import { describe, expect, it } from 'vitest';
import { GameMap } from './map';
import { MAP_ROWS } from './mapData';
import { openMap } from './testMaps';
import type { Agent } from './types';
import { World } from './world';

const TEST_ROWS = [
  '#######',
  '#..rr.#',
  '#..rr.#',
  '#.^...#',
  '#:ii:.#',
  '#:iirr#',
  '#######',
];
const smallWorld = () => new World(GameMap.fromAscii(TEST_ROWS));

function run(w: World, seconds: number) {
  for (let i = 0; i < Math.round(seconds * 10); i++) w.tick(0.1);
}
function placeOk(w: World, type: Agent['type'], x: number, y: number): Agent {
  const r = w.place(type, x, y);
  if (!r.ok) throw new Error(`place ${type} ${x},${y}: ${r.reason}`);
  return r.agent;
}
function connectOk(w: World, a: Agent, b: Agent) {
  const r = w.connect(a.id, b.id);
  if (!r.ok) throw new Error(`connect: ${r.reason}`);
  return r.connection;
}

describe('posicionamento', () => {
  it('Extrator exige nó; demais agentes vão em qualquer terreno construível', () => {
    const w = smallWorld();
    expect(w.canPlace('extrator', 3, 1)).toEqual({ ok: true, resource: 'regolito' });
    expect(w.canPlace('extrator', 4, 3)).toEqual({ ok: false, reason: 'sem-no' });
    expect(w.canPlace('silo', 4, 3)).toEqual({ ok: true, resource: null });
    expect(w.canPlace('divisor', 3, 1)).toEqual({ ok: true, resource: null });
  });

  it('rejeita névoa, rocha, fora do mapa, sobreposição e nós misturados', () => {
    const w = smallWorld();
    expect(w.canPlace('silo', 0, 1)).toEqual({ ok: false, reason: 'sinal-fraco' });
    expect(w.canPlace('silo', 2, 2)).toEqual({ ok: false, reason: 'terreno' });
    expect(w.canPlace('silo', 7, 1)).toEqual({ ok: false, reason: 'fora-do-mapa' });
    expect(w.canPlace('extrator', 3, 4)).toEqual({ ok: false, reason: 'nos-misturados' });
    placeOk(w, 'extrator', 3, 1);
    expect(w.canPlace('silo', 4, 1)).toEqual({ ok: false, reason: 'ocupado' });
  });
});

describe('produção e contrapressão', () => {
  it('Extrator sem saída enche o buffer (10) e para', () => {
    const w = smallWorld();
    const e = placeOk(w, 'extrator', 3, 1);
    run(w, 60);
    expect(e.produced).toBe(10);
    expect(e.status).toBe('bloqueado');
    expect(e.stalledFor).toBeGreaterThan(30);
  });

  it('Extrator → Silo entrega 30/min e o estoque conta só o silo', () => {
    const w = new World(openMap(30, 10, [{ x: 2, y: 2, c: 'r' }]));
    const e = placeOk(w, 'extrator', 2, 2);
    const s = placeOk(w, 'silo', 8, 2);
    connectOk(w, e, s);
    run(w, 120);
    const stock = w.stockTotals().regolito;
    expect(stock).toBeGreaterThanOrEqual(58);
    expect(stock).toBeLessThanOrEqual(60);
    expect(e.status).toBe('ok');
  });

  it('linha Mk1 limita a vazão a 60/min', () => {
    const w = new World(openMap(40, 12, [{ x: 2, y: 1, c: 'r' }, { x: 2, y: 4, c: 'r' }, { x: 2, y: 7, c: 'r' }]));
    const es = [placeOk(w, 'extrator', 2, 1), placeOk(w, 'extrator', 2, 4), placeOk(w, 'extrator', 2, 7)];
    const u = placeOk(w, 'unificador', 7, 4);
    const s = placeOk(w, 'silo', 12, 4);
    es.forEach((e) => connectOk(w, e, u));
    connectOk(w, u, s);
    run(w, 120); // aquecimento (enche as filas)
    const before = w.stockTotals().regolito;
    run(w, 60);
    const perMin = w.stockTotals().regolito - before;
    expect(perMin).toBeGreaterThanOrEqual(59);
    expect(perMin).toBeLessThanOrEqual(61);
    // 90/min de oferta para 60/min de vazão: alguém fica bloqueado
    expect(es.some((e) => e.status === 'bloqueado')).toBe(true);
  });

  it('destino travado faz a fila encher e a origem parar sem perder itens', () => {
    const w = new World(openMap(30, 10, [{ x: 2, y: 2, c: 'r' }]));
    const e = placeOk(w, 'extrator', 2, 2);
    const d = placeOk(w, 'divisor', 8, 2); // sem saídas: trava após 2 itens
    const c = connectOk(w, e, d);
    run(w, 120);
    const produced = e.produced;
    run(w, 30);
    expect(e.produced).toBe(produced);
    expect(e.status).toBe('bloqueado');
    expect(d.status).toBe('bloqueado');
    expect(produced).toBe(e.buffer.length + c.items.length + d.buffer.length);
  });
});

describe('Divisor e Unificador', () => {
  it('Divisor distribui em rodízio entre 3 saídas', () => {
    const w = new World(openMap(40, 14, [{ x: 2, y: 6, c: 'r' }]));
    const e = placeOk(w, 'extrator', 2, 6);
    const d = placeOk(w, 'divisor', 7, 6);
    const silos = [placeOk(w, 'silo', 12, 2), placeOk(w, 'silo', 12, 6), placeOk(w, 'silo', 12, 10)];
    connectOk(w, e, d);
    silos.forEach((s) => connectOk(w, d, s));
    run(w, 180);
    const counts = silos.map((s) => s.buffer.length);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    expect(counts.reduce((a, b) => a + b, 0)).toBeGreaterThan(80);
  });

  it('Divisor pula a saída travada', () => {
    const w = new World(openMap(40, 14, [{ x: 2, y: 6, c: 'r' }]));
    const e = placeOk(w, 'extrator', 2, 6);
    const d = placeOk(w, 'divisor', 7, 6);
    const s = placeOk(w, 'silo', 12, 2);
    const dead = placeOk(w, 'divisor', 12, 10); // sem saída: trava
    connectOk(w, e, d);
    connectOk(w, d, s);
    connectOk(w, d, dead);
    run(w, 60);
    const before = s.buffer.length;
    run(w, 60);
    expect(s.buffer.length - before).toBeGreaterThanOrEqual(29);
  });

  it('Unificador alterna entre as entradas', () => {
    const w = new World(openMap(40, 12, [{ x: 2, y: 1, c: 'r' }, { x: 2, y: 7, c: 'i' }]));
    const er = placeOk(w, 'extrator', 2, 1);
    const eg = placeOk(w, 'extrator', 2, 7);
    const u = placeOk(w, 'unificador', 7, 4);
    const s = placeOk(w, 'silo', 12, 4);
    connectOk(w, er, u);
    connectOk(w, eg, u);
    connectOk(w, u, s);
    run(w, 150); // silo tem 200 de capacidade
    const t = w.stockTotals();
    expect(Math.abs(t.gelo - t.regolito)).toBeLessThanOrEqual(2);
    expect(t.gelo + t.regolito).toBeGreaterThan(130);
  });
});

describe('regras de conexão', () => {
  it('valida portas, alcance e duplicatas', () => {
    const w = new World(openMap(40, 20, [{ x: 2, y: 2, c: 'r' }]));
    const e = placeOk(w, 'extrator', 2, 2);
    const s1 = placeOk(w, 'silo', 14, 2); // centros a 12 células
    const far = placeOk(w, 'silo', 15, 6);
    expect(w.canConnect(e.id, e.id)).toEqual({ ok: false, reason: 'mesmo-agente' });
    expect(w.canConnect(e.id, far.id)).toEqual({ ok: false, reason: 'longe-demais' });
    expect(w.canConnect(s1.id, e.id)).toEqual({ ok: false, reason: 'sem-entrada' });
    connectOk(w, e, s1);
    expect(w.canConnect(e.id, s1.id)).toEqual({ ok: false, reason: 'ja-conectado' });
    const s2 = placeOk(w, 'silo', 6, 6);
    expect(w.canConnect(e.id, s2.id)).toEqual({ ok: false, reason: 'saidas-cheias' });
    // Silo aceita até 4 entradas
    const target = placeOk(w, 'silo', 20, 12);
    const srcs = [placeOk(w, 'silo', 16, 10), placeOk(w, 'silo', 24, 10), placeOk(w, 'silo', 16, 14), placeOk(w, 'silo', 24, 14), placeOk(w, 'silo', 20, 16)];
    srcs.slice(0, 4).forEach((x) => connectOk(w, x, target));
    expect(w.canConnect(srcs[4].id, target.id)).toEqual({ ok: false, reason: 'entradas-cheias' });
  });

  it('demolir remove as conexões; linha é encontrada perto do ponteiro', () => {
    const w = new World(openMap(30, 10, [{ x: 2, y: 2, c: 'r' }]));
    const e = placeOk(w, 'extrator', 2, 2);
    const s = placeOk(w, 'silo', 10, 2);
    const c = connectOk(w, e, s);
    expect(w.connectionNear(7, 3.2)?.id).toBe(c.id);
    expect(w.connectionNear(7, 5)).toBeUndefined();
    w.remove(s.id);
    expect(w.connections.size).toBe(0);
    expect(w.outputsOf(e.id)).toHaveLength(0);
  });
});

describe('mapa do protótipo', () => {
  it('carrega e tem nós de gelo e regolito', () => {
    const map = GameMap.fromAscii(MAP_ROWS);
    const found = new Set<string>();
    for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) found.add(String(map.nodeAt(x, y)));
    expect(found.has('gelo') && found.has('regolito')).toBe(true);
  });

  it('recusa linhas com tamanhos diferentes', () => {
    expect(() => GameMap.fromAscii(['...', '..'])).toThrow();
  });
});
