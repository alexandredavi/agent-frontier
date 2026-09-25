import { describe, expect, it } from 'vitest';
import { AGENT_DEFS, CAPSULE_KW, outputPerMin } from './defs';
import { openMap } from './testMaps';
import type { Agent, AgentType, ResourceId } from './types';
import { World } from './world';

function run(w: World, seconds: number) {
  for (let i = 0; i < Math.round(seconds * 10); i++) w.tick(0.1);
}
function placeOk(w: World, type: AgentType, x: number, y: number): Agent {
  const r = w.place(type, x, y);
  if (!r.ok) throw new Error(`place ${type} ${x},${y}: ${r.reason}`);
  return r.agent;
}
function link(w: World, a: Agent, b: Agent) {
  const r = w.connect(a.id, b.id);
  if (!r.ok) throw new Error(`connect ${a.type}->${b.type}: ${r.reason}`);
}
/** Enche os ingredientes de uma máquina direto (sem linhas), para medir só o ciclo. */
function feed(a: Agent) {
  const r = AGENT_DEFS[a.type].recipe!;
  for (const [res, n] of Object.entries(r.inputs)) a.inputs[res as ResourceId] = n! * 2;
}
const openWorld = () => new World(openMap(60, 30, [{ x: 2, y: 2, c: 'r' }, { x: 2, y: 8, c: 'i' }]));

describe('receitas', () => {
  it('valores por minuto batem com a tabela aprovada', () => {
    const expected: Partial<Record<AgentType, number>> = {
      extrator: 30, sensor: 20, derretedor: 30, cartografo: 2, analista: 10, eletrolisador: 30, fundidor: 15, prensa: 15, construtor: 2,
    };
    for (const [t, v] of Object.entries(expected)) expect(outputPerMin(t as AgentType)).toBe(v);
  });

  it('cada máquina completa ciclos no tempo da receita (com ingredientes à vontade)', () => {
    const types: AgentType[] = ['derretedor', 'analista', 'eletrolisador', 'fundidor', 'prensa', 'construtor', 'cartografo'];
    for (const t of types) {
      const w = openWorld();
      placeOk(w, 'painel_solar', 30, 20); // energia de sobra
      const m = placeOk(w, t, 20, 10);
      const r = AGENT_DEFS[t].recipe!;
      // Reabastece a cada passo, sem limite de saída (esvazia o buffer)
      for (let i = 0; i < r.cycle * 3 * 10; i++) {
        feed(m);
        m.buffer = [];
        w.tick(0.1);
      }
      expect(m.produced, t).toBe(r.output.n * 3);
    }
  });

  it('máquina com 2 ingredientes só trabalha quando tem os dois', () => {
    const w = openWorld();
    const m = placeOk(w, 'eletrolisador', 20, 10);
    m.inputs.agua = 6;
    run(w, 12);
    expect(m.produced).toBe(0);
    expect(m.status).toBe('ocioso');
    m.inputs.modelo = 2;
    run(w, 12.05);
    expect(m.produced).toBe(6);
  });

  it('item que a máquina não usa é recusado e trava a linha', () => {
    const w = openWorld();
    const e = placeOk(w, 'extrator', 2, 2); // regolito
    const d = placeOk(w, 'derretedor', 8, 2); // quer gelo
    link(w, e, d);
    run(w, 30);
    expect(d.refusing).toBe('regolito');
    expect(d.status).toBe('bloqueado');
    expect(d.produced).toBe(0);
    expect(w.connections.values().next().value!.items.length).toBeGreaterThan(0);
  });

  it('Descarte destrói tudo que recebe', () => {
    const w = openWorld();
    const e = placeOk(w, 'extrator', 2, 2);
    const x = placeOk(w, 'descarte', 8, 2);
    link(w, e, x);
    run(w, 60);
    expect(x.produced).toBeGreaterThanOrEqual(28);
    expect(e.status).toBe('ok');
  });
});

describe('energia', () => {
  it('cápsula dá 10 kW; painéis somam 20 kW cada', () => {
    const w = openWorld();
    expect(w.powerSupply()).toBe(CAPSULE_KW);
    placeOk(w, 'painel_solar', 30, 20);
    placeOk(w, 'painel_solar', 34, 20);
    expect(w.powerSupply()).toBe(CAPSULE_KW + 40);
  });

  it('só consome enquanto trabalha', () => {
    const w = openWorld();
    placeOk(w, 'derretedor', 20, 10); // sem ingredientes
    run(w, 1);
    expect(w.power.demand).toBe(0);
    const e = placeOk(w, 'extrator', 2, 2);
    run(w, 1);
    expect(w.power.demand).toBe(4);
    expect(e.status).toBe('ok');
  });

  it('falta de energia desacelera tudo na proporção', () => {
    const w = openWorld();
    // 4 derretedores = 32 kW pedidos, 10 kW disponíveis → 31,25%
    const ms = [0, 1, 2, 3].map((i) => placeOk(w, 'derretedor', 20 + i * 3, 10));
    for (let i = 0; i < 600; i++) {
      ms.forEach((m) => { feed(m); m.buffer = []; });
      w.tick(0.1);
    }
    expect(w.power.factor).toBeCloseTo(10 / 32, 2);
    const total = ms.reduce((s, m) => s + m.produced, 0);
    // 60 s × 4 máquinas × 30/min × 31,25% ≈ 37,5
    expect(total).toBeGreaterThanOrEqual(35);
    expect(total).toBeLessThanOrEqual(40);
  });
});

describe('cadeia completa', () => {
  it('Gelo + Telemetria + Minério + Regolito chegam a Módulos de habitat', () => {
    const w = new World(
      openMap(60, 40, [
        { x: 2, y: 2, c: 'i' }, { x: 2, y: 6, c: 'i' }, // gelo
        { x: 2, y: 20, c: 'r' }, // regolito
        { x: 2, y: 28, c: 'r' },
      ]),
    );
    for (let i = 0; i < 6; i++) placeOk(w, 'painel_solar', 50, 2 + i * 3);

    // Água: 2 extratores de gelo → unificador → derretedor x2 via divisor
    const g1 = placeOk(w, 'extrator', 2, 2);
    const g2 = placeOk(w, 'extrator', 2, 6);
    const d1 = placeOk(w, 'derretedor', 8, 2);
    const d2 = placeOk(w, 'derretedor', 8, 6);
    link(w, g1, d1);
    link(w, g2, d2);
    const uA = placeOk(w, 'unificador', 14, 4);
    link(w, d1, uA);
    link(w, d2, uA);

    // Modelos: 2 sensores → 2 analistas → unificador
    const s1 = placeOk(w, 'sensor', 2, 12);
    const s2 = placeOk(w, 'sensor', 6, 12);
    const a1 = placeOk(w, 'analista', 2, 15);
    const a2 = placeOk(w, 'analista', 6, 15);
    link(w, s1, a1);
    link(w, s2, a2);
    const uM = placeOk(w, 'unificador', 12, 12);
    link(w, a1, uM);
    link(w, a2, uM);

    // O₂
    const el = placeOk(w, 'eletrolisador', 18, 8);
    link(w, uA, el);
    link(w, uM, el);

    // Painéis: sem nó de minério aqui, então abastecemos o fundidor direto
    const f = placeOk(w, 'fundidor', 8, 24);
    const r1 = placeOk(w, 'extrator', 2, 20);
    const p = placeOk(w, 'prensa', 12, 22);
    link(w, f, p);
    link(w, r1, p);

    const c = placeOk(w, 'construtor', 22, 16);
    link(w, el, c);
    link(w, p, c);
    const silo = placeOk(w, 'silo', 28, 16);
    link(w, c, silo);

    for (let i = 0; i < 3000; i++) {
      f.inputs.minerio = 4;
      w.tick(0.1);
    }
    expect(w.power.factor).toBe(1);
    expect(w.stockTotals().modulo ?? 0).toBeGreaterThanOrEqual(5);
  });
});
