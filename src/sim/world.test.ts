import { describe, expect, it } from 'vitest';
import { GameMap } from './map';
import { MAP_ROWS } from './mapData';
import { World } from './world';

// Mapa mínimo de teste:
//  x: 0123456
const TEST_ROWS = [
  '#######', // y0
  '#..rr.#', // y1
  '#..rr.#', // y2
  '#.^...#', // y3
  '#:ii:.#', // y4
  '#:iirr#', // y5 — gelo e regolito lado a lado
  '#######', // y6
];

const newWorld = () => new World(GameMap.fromAscii(TEST_ROWS));

describe('World.canPlace', () => {
  it('aceita extrator sobre um nó e identifica o recurso', () => {
    expect(newWorld().canPlace('extrator', 3, 1)).toEqual({ ok: true, resource: 'regolito' });
    expect(newWorld().canPlace('extrator', 2, 4)).toEqual({ ok: true, resource: 'gelo' });
  });

  it('aceita cobertura parcial do nó', () => {
    expect(newWorld().canPlace('extrator', 4, 1)).toEqual({ ok: true, resource: 'regolito' });
  });

  it('rejeita névoa, rocha, fora do mapa e sem nó', () => {
    const w = newWorld();
    expect(w.canPlace('extrator', 0, 1)).toEqual({ ok: false, reason: 'sinal-fraco' });
    expect(w.canPlace('extrator', 2, 2)).toEqual({ ok: false, reason: 'terreno' });
    expect(w.canPlace('extrator', 7, 1)).toEqual({ ok: false, reason: 'fora-do-mapa' });
    expect(w.canPlace('extrator', -1, 2)).toEqual({ ok: false, reason: 'fora-do-mapa' });
    expect(w.canPlace('extrator', 4, 3)).toEqual({ ok: false, reason: 'sem-no' });
  });

  it('rejeita dois recursos diferentes', () => {
    expect(newWorld().canPlace('extrator', 3, 4)).toEqual({ ok: false, reason: 'nos-misturados' });
  });

  it('rejeita sobreposição e libera após remover', () => {
    const w = newWorld();
    const r = w.place('extrator', 3, 1);
    expect(r.ok).toBe(true);
    expect(w.canPlace('extrator', 4, 1)).toEqual({ ok: false, reason: 'ocupado' });
    if (r.ok) {
      expect(w.agentAt(4, 2)?.id).toBe(r.agent.id);
      w.remove(r.agent.id);
    }
    expect(w.agentAt(4, 2)).toBeUndefined();
    expect(w.canPlace('extrator', 4, 1).ok).toBe(true);
  });
});

describe('World.tick', () => {
  it('extrator produz 30 itens por minuto de jogo', () => {
    const w = newWorld();
    w.place('extrator', 3, 1);
    for (let i = 0; i < 600; i++) w.tick(0.1); // 60 s
    expect(w.stock.regolito).toBe(30);
    expect(w.stock.gelo).toBe(0);
    expect(w.time).toBeCloseTo(60);
  });

  it('dois extratores somam a produção', () => {
    const w = newWorld();
    w.place('extrator', 3, 1);
    w.place('extrator', 2, 4);
    for (let i = 0; i < 1200; i++) w.tick(0.1); // 120 s
    expect(w.stock.regolito).toBe(60);
    expect(w.stock.gelo).toBe(60);
  });
});

describe('mapa do protótipo', () => {
  it('carrega e tem nós de gelo e regolito', () => {
    const map = GameMap.fromAscii(MAP_ROWS);
    let gelo = 0;
    let regolito = 0;
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x < map.width; x++) {
        const n = map.nodeAt(x, y);
        if (n === 'gelo') gelo++;
        if (n === 'regolito') regolito++;
      }
    expect(gelo).toBeGreaterThan(0);
    expect(regolito).toBeGreaterThan(0);
  });

  it('recusa linhas com tamanhos diferentes', () => {
    expect(() => GameMap.fromAscii(['...', '..'])).toThrow();
  });
});
