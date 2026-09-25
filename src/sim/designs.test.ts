import { describe, expect, it } from 'vitest';
import { runBench } from './bench';
import { AGENT_DEFS } from './defs';
import { type Design, TOOL_OF, designStats, factoryId } from './designs';
import { GameMap } from './map';
import { MAP_ROWS } from './mapData';
import { Rng } from './rng';
import { deserialize, serialize } from './save';
import { openMap, testWorld } from './testMaps';
import type { AgentType, ResourceId } from './types';
import { World } from './world';

const custom = (role: AgentType, extra: Partial<Design> = {}): Design => ({
  id: `c-${role}-${extra.version ?? 2}`,
  name: `${AGENT_DEFS[role].name} v${extra.version ?? 2}`,
  role,
  core: 'basico',
  tool: TOOL_OF[role],
  cards: [],
  version: 2,
  factory: false,
  ...extra,
});

describe('atributos por módulo', () => {
  it('fábrica usa os valores base', () => {
    expect(designStats(custom('analista'))).toMatchObject({ speed: 1, reliability: 80, kwMult: 1, slots: 2, perMin: 10 });
    expect(designStats(custom('extrator')).reliability).toBe(100);
  });

  it('Núcleo Avançado + Cuidadoso: ×1,5 × 0,5 × 0,95; confiabilidade limitada a 99%', () => {
    const st = designStats(custom('analista', { core: 'avancado', cards: ['cuidadoso'] }));
    expect(st.speed).toBeCloseTo(0.7125);
    expect(st.reliability).toBe(99);
    expect(st.kwMult).toBe(2);
    expect(st.slots).toBe(4);
  });

  it('Acelerar derruba confiabilidade; Econômico reduz consumo', () => {
    expect(designStats(custom('extrator', { cards: ['acelerar'] })).reliability).toBe(90);
    const eco = designStats(custom('derretedor', { cards: ['economico'] }));
    expect(eco.kwMult).toBeCloseTo(0.7);
    expect(eco.speed).toBeCloseTo(0.8 * 0.95);
  });

  it('base 100% continua 100% com Núcleo Avançado', () => {
    expect(designStats(custom('derretedor', { core: 'avancado' })).reliability).toBe(100);
  });
});

describe('alucinações', () => {
  const feedLoop = (w: World, id: number, seconds: number) => {
    const a = w.agents.get(id)!;
    const r = AGENT_DEFS[a.type].recipe!;
    for (let i = 0; i < seconds * 10; i++) {
      for (const [res, n] of Object.entries(r.inputs)) a.inputs[res as ResourceId] = n! * 2;
      a.badInputs = {};
      a.buffer = a.buffer.slice(-5);
      w.tick(0.1);
    }
  };

  it('confiabilidade estatística: ~80% em 1.000 itens do Analista', () => {
    const w = testWorld(openMap(30, 10));
    for (let i = 0; i < 4; i++) w.place('painel_solar', 20, 1 + i * 2);
    const a = w.place('analista', 4, 4);
    if (!a.ok) throw new Error();
    feedLoop(w, a.agent.id, 6000); // 1.000 ciclos
    const rate = 1 - a.agent.defects / a.agent.produced;
    expect(a.agent.produced).toBeGreaterThanOrEqual(990);
    expect(rate).toBeGreaterThan(0.76);
    expect(rate).toBeLessThan(0.84);
  });

  it('ingredientes todos defeituosos: tudo sai defeituoso, contado como herdado', () => {
    const w = testWorld(openMap(30, 10));
    const e = w.place('eletrolisador', 4, 4);
    if (!e.ok) throw new Error();
    const m = e.agent;
    m.inputs = { agua: 6, modelo: 2 };
    m.badInputs = { agua: 6, modelo: 2 };
    for (let i = 0; i < 130; i++) w.tick(0.1);
    expect(m.produced).toBe(6); // o ciclo não é mais perdido
    expect(m.buffer.every((it) => it.bad)).toBe(true);
    expect(m.inherited + m.defects).toBe(6);
    expect(m.inherited).toBeGreaterThan(0);
  });

  it('defeitos suavizados: 1 ingrediente ruim em 4 → ~(3/4)² × confiabilidade', () => {
    const w = testWorld(openMap(30, 10));
    for (let i = 0; i < 4; i++) w.place('painel_solar', 20, 1 + i * 2);
    const e = w.place('eletrolisador', 4, 4);
    if (!e.ok) throw new Error();
    const m = e.agent;
    let good = 0;
    let total = 0;
    for (let i = 0; i < 20000; i++) {
      m.inputs = { agua: 6, modelo: 2 };
      m.badInputs = { modelo: 2 }; // o modelo de cada ciclo é defeituoso
      w.tick(0.1);
      for (const it of m.buffer) {
        total++;
        if (!it.bad) good++;
      }
      m.buffer = [];
    }
    const expected = 0.9 * (3 / 4) ** 2; // ≈ 0,506
    expect(total).toBeGreaterThan(900);
    expect(good / total).toBeGreaterThan(expected - 0.05);
    expect(good / total).toBeLessThan(expected + 0.05);
  });

  it('Silo separa itens bons e defeituosos', () => {
    const w = testWorld(openMap(30, 10));
    const s = w.place('silo', 4, 4);
    if (!s.ok) throw new Error();
    s.agent.buffer.push({ res: 'modulo', bad: false }, { res: 'modulo', bad: true }, { res: 'modulo', bad: false });
    expect(w.stockTotals()).toEqual({ modulo: 2 });
    expect(w.defectTotals()).toEqual({ modulo: 1 });
  });

  it('itens defeituosos viajam pela linha marcados', () => {
    const w = testWorld(openMap(30, 10));
    const a = w.place('analista', 2, 4);
    const s = w.place('silo', 8, 4);
    if (!a.ok || !s.ok) throw new Error();
    w.connect(a.agent.id, s.agent.id);
    w.addDesign(custom('analista', { cards: ['acelerar', 'acelerar'] })); // 60% confiável
    w.applyDesign(factoryId('analista'), 'c-analista-2');
    for (let i = 0; i < 3000; i++) {
      a.agent.inputs.telemetria = 4;
      w.tick(0.1);
    }
    const good = w.stockTotals().modelo ?? 0;
    const bad = w.defectTotals().modelo ?? 0;
    expect(bad).toBeGreaterThan(0);
    expect(bad / (good + bad)).toBeGreaterThan(0.3);
    expect(bad / (good + bad)).toBeLessThan(0.5);
  });
});

describe('bancada de testes', () => {
  it('bate com a teoria (1.000 amostras)', () => {
    const d = custom('analista', { core: 'avancado' }); // 90%
    const r = runBench(d, 1000, new Rng(42));
    expect(r.measured).toBeGreaterThan(87);
    expect(r.measured).toBeLessThan(93);
    expect(r.perMin).toBeCloseTo(15);
    expect(r.kw).toBe(12);
    expect(r.good + r.failures).toBe(1000);
  });

  it('receita 100% nunca falha', () => {
    expect(runBench(custom('derretedor'), 100, new Rng(1)).failures).toBe(0);
  });
});

describe('versões', () => {
  it('construir usa a versão ativa; aplicar a todos troca só os da versão antiga', () => {
    const w = testWorld(openMap(40, 10));
    const a1 = w.place('analista', 2, 2);
    const a2 = w.place('analista', 6, 2);
    if (!a1.ok || !a2.ok) throw new Error();
    expect(a1.agent.designId).toBe(factoryId('analista'));
    const v2 = custom('analista', { core: 'avancado' });
    w.addDesign(v2);
    w.setActive(v2.id);
    const a3 = w.place('analista', 10, 2);
    if (!a3.ok) throw new Error();
    expect(a3.agent.designId).toBe(v2.id);
    // "Só os novos": nada muda nos antigos
    expect(w.agentsUsing(factoryId('analista'))).toHaveLength(2);
    // "Todos"
    expect(w.applyDesign(factoryId('analista'), v2.id)).toBe(2);
    expect(w.agentsUsing(v2.id)).toHaveLength(3);
  });

  it('place com designId define o papel e o consumo segue os módulos', () => {
    const w = testWorld(openMap(40, 10));
    const d = custom('cartografo', { core: 'avancado', cards: ['economico'] });
    w.addDesign(d);
    const r = w.place('silo', 2, 2, d.id); // o tipo vem da versão
    if (!r.ok) throw new Error();
    expect(r.agent.type).toBe('cartografo');
    expect(w.agentPower(r.agent)).toBeCloseTo(6 * 2 * 0.7);
    expect(w.nextVersion('cartografo')).toBe(3);
  });

  it('save v4 guarda versões criadas e a ativa; save v3 vira fábrica', () => {
    const map = GameMap.fromAscii(MAP_ROWS);
    const w = testWorld(map);
    const d = custom('derretedor', { cards: ['acelerar'] });
    w.addDesign(d);
    w.setActive(d.id);
    expect(w.place('derretedor', 20, 20).ok).toBe(true);
    const copy = deserialize(JSON.parse(JSON.stringify(serialize(w))), map);
    expect(copy.designs.get(d.id)?.cards).toEqual(['acelerar']);
    expect(copy.activeDesign.derretedor).toBe(d.id);
    expect([...copy.agents.values()][0].designId).toBe(d.id);

    const v3 = { version: 3, time: 1, agents: [{ id: 1, type: 'analista', x: 20, y: 20, produced: 2, progress: 0, running: false, inputs: { telemetria: 3 }, buffer: ['modelo'] }], connections: [] };
    const old = deserialize(v3, map);
    const a = [...old.agents.values()][0];
    expect(a.designId).toBe(factoryId('analista'));
    expect(a.buffer).toEqual([{ res: 'modelo', bad: false }]);
    expect(a.inputs.telemetria).toBe(3);
  });
});
