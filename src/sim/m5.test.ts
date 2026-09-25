import { describe, expect, it } from 'vitest';
import { AGENT_DEFS, ARCA_PHASES, DRIFT_PP } from './defs';
import { type Design, TOOL_OF, factoryId } from './designs';
import { GameMap } from './map';
import { MAP_ROWS } from './mapData';
import { deserialize, serialize } from './save';
import { openMap } from './testMaps';
import type { Agent, AgentType, Item, ResourceId } from './types';
import { World } from './world';

const custom = (role: AgentType, extra: Partial<Design> = {}): Design => ({
  id: `c-${role}`, name: `${AGENT_DEFS[role].name} v2`, role, core: 'basico', tool: TOOL_OF[role], cards: [], version: 2, factory: false, ...extra,
});
function placeOk(w: World, type: AgentType, x: number, y: number, designId?: string): Agent {
  const r = w.place(type, x, y, designId);
  if (!r.ok) throw new Error(`place ${type}: ${r.reason}`);
  return r.agent;
}
/** Empurra itens direto para um agente pela API de entrega (simula uma linha). */
function push(w: World, a: Agent, items: Item[]) {
  for (const it of items) (w as unknown as { receive(a: Agent, r: ResourceId, b: boolean): void }).receive(a, it.res, it.bad);
}

describe('tiers', () => {
  it('jogo novo começa no Tier 0: Tier 1 bloqueado, Tier 0 liberado', () => {
    const w = new World(openMap(40, 10, [{ x: 30, y: 2, c: 'r' }]));
    expect(w.place('analista', 2, 2)).toEqual({ ok: false, reason: 'bloqueado' });
    expect(w.canPlace('construtor', 2, 2)).toEqual({ ok: false, reason: 'bloqueado' });
    expect(w.place('cartografo', 2, 2).ok).toBe(true);
    expect(w.place('verificador', 6, 2).ok).toBe(true);
    expect(w.place('plataforma', 10, 2).ok).toBe(true);
    // Núcleo Avançado também é Tier 1
    const adv = custom('derretedor', { core: 'avancado' });
    w.addDesign(adv);
    expect(w.place('derretedor', 14, 2, adv.id)).toEqual({ ok: false, reason: 'bloqueado' });
  });

  it('Minério só pode ser extraído no Tier 1', () => {
    const w = new World(GameMap.fromAscii(MAP_ROWS));
    expect(w.canPlace('extrator', 44, 8)).toEqual({ ok: false, reason: 'bloqueado' });
    w.unlockTier1();
    expect(w.canPlace('extrator', 44, 8)).toEqual({ ok: true, resource: 'minerio' });
  });
});

describe('Arca', () => {
  it('Fase 0: 20 Mapas bons liberam o Tier 1 (com drift); defeituosos são rejeitados', () => {
    const w = new World(openMap(30, 10));
    const p = placeOk(w, 'plataforma', 2, 2);
    push(w, p, [{ res: 'mapa', bad: true }, { res: 'mapa', bad: true }]);
    push(w, p, Array.from({ length: 19 }, () => ({ res: 'mapa' as const, bad: false })));
    expect(w.tier).toBe(0);
    expect(w.arca).toMatchObject({ phase: 0, delivered: 19, rejected: 2 });
    push(w, p, [{ res: 'mapa', bad: false }]);
    expect(w.tier).toBe(1);
    expect(w.arca).toMatchObject({ phase: 1, delivered: 0, rejected: 0 });
    expect(w.events).toContain('tier1');
    expect(w.designs.get(factoryId('cartografo'))!.drift).toBe(DRIFT_PP);
  });

  it('Plataforma só aceita a carga da fase atual (outros itens travam a linha)', () => {
    const w = new World(openMap(30, 10));
    const p = placeOk(w, 'plataforma', 2, 2);
    expect(w.accepts(p, 'mapa')).toBe(true);
    expect(w.accepts(p, 'modulo')).toBe(false);
    expect(w.accepts(p, 'gelo')).toBe(false);
  });

  it('Fase 1: 50 Módulos concluem o protótipo', () => {
    const w = new World(openMap(30, 10));
    w.arca = { phase: 1, delivered: 49, rejected: 0, done: false };
    w.tier = 1;
    const p = placeOk(w, 'plataforma', 2, 2);
    push(w, p, [{ res: 'modulo', bad: false }]);
    expect(w.arca.done).toBe(true);
    expect(w.events).toContain('vitoria');
    expect(ARCA_PHASES[1].n).toBe(50);
  });
});

describe('Verificador', () => {
  function runVerifier(designId: string | undefined, items: Item[], secondOut = true, sink: AgentType = 'silo') {
    const w = new World(openMap(40, 10));
    const v = placeOk(w, 'verificador', 10, 4, designId);
    const ok = placeOk(w, sink, 16, 2);
    const rej = placeOk(w, sink, 16, 6);
    w.connect(v.id, ok.id);
    if (secondOut) w.connect(v.id, rej.id);
    let i = 0;
    for (let t = 0; t < items.length * 25 + 200; t++) {
      while (i < items.length && w.accepts(v, items[i].res)) push(w, v, [items[i++]]);
      w.tick(0.1);
    }
    return { v, ok, rej, w };
  }
  const mix = (n: number, badEvery: number): Item[] => Array.from({ length: n }, (_, k) => ({ res: 'modelo', bad: k % badEvery === 0 }));

  it('fábrica: detecta ~90% dos defeituosos e rejeita ~2% dos bons; 2ª saída recebe rejeitados', () => {
    const { v, ok, rej } = runVerifier(undefined, mix(1000, 4), true, 'descarte'); // 250 defeituosos
    expect(v.produced).toBe(1000);
    expect(v.caught / 250).toBeGreaterThan(0.85);
    expect(v.caught / 250).toBeLessThan(0.95);
    expect(v.falsePos / 750).toBeGreaterThan(0.005);
    expect(v.falsePos / 750).toBeLessThan(0.04);
    expect(rej.produced).toBe(v.caught + v.falsePos);
    expect(ok.produced).toBe(1000 - v.caught - v.falsePos);
  });

  it('itens aprovados chegam marcados (defeituosos que escaparam continuam defeituosos)', () => {
    const { v, ok } = runVerifier(undefined, mix(150, 3));
    expect(ok.buffer.filter((i) => i.bad).length).toBe(v.missed);
  });

  it('sem 2ª saída ligada, rejeitados são destruídos', () => {
    const { v, ok } = runVerifier(undefined, mix(200, 2), false);
    expect(v.produced).toBe(200);
    expect(ok.buffer.length).toBe(200 - v.caught - v.falsePos);
  });

  it('inspeciona 30 itens/min', () => {
    const w = new World(openMap(40, 10));
    const v = placeOk(w, 'verificador', 10, 4);
    const s = placeOk(w, 'silo', 16, 4);
    w.connect(v.id, s.id);
    for (let t = 0; t < 600; t++) {
      if (w.accepts(v, 'agua')) push(w, v, [{ res: 'agua', bad: false }]);
      w.tick(0.1);
    }
    expect(v.produced).toBeGreaterThanOrEqual(29);
    expect(v.produced).toBeLessThanOrEqual(31);
  });
});

describe('confiabilidade real', () => {
  it('bioma: Crateras −10, Cordilheira −5; Filtrar anula (×0,85 velocidade)', () => {
    const w = new World(GameMap.fromAscii(MAP_ROWS));
    w.tier = 1;
    const gelo = placeOk(w, 'extrator', 31, 20); // nas crateras
    expect(gelo.biome).toBe(10);
    expect(w.reliability(gelo)).toBe(90);
    const min = placeOk(w, 'extrator', 44, 8); // cordilheira
    expect(w.reliability(min)).toBe(95);
    const filt = custom('extrator', { cards: ['filtrar'] });
    w.addDesign(filt);
    w.applyDesign(factoryId('extrator'), filt.id);
    expect(w.reliability(gelo)).toBe(100);
    expect(w.stats(filt.id).speed).toBeCloseTo(0.85 * 0.95);
  });

  it('drift −5 até recalibrar; experiência +1 pp a cada 500 itens, até +10', () => {
    const w = new World(openMap(30, 10));
    const c = placeOk(w, 'cartografo', 2, 2);
    expect(w.reliability(c)).toBe(80);
    w.unlockTier1();
    expect(w.reliability(c)).toBe(75);
    c.produced = 1250;
    expect(w.reliabilityBreakdown(c)).toMatchObject({ design: 80, drift: 5, xp: 2, real: 77 });
    w.recalibrate(c.designId!);
    expect(w.reliability(c)).toBe(82);
    c.produced = 99999;
    expect(w.xp(c)).toBe(10);
    expect(w.reliability(c)).toBe(90);
  });

  it('versões criadas depois do Tier 1 não têm drift', () => {
    const w = new World(openMap(30, 10));
    w.unlockTier1();
    const d = custom('analista');
    w.addDesign(d);
    const a = placeOk(w, 'analista', 2, 2, d.id);
    expect(w.reliability(a)).toBe(80);
  });
});

describe('save v5', () => {
  it('guarda tier, Arca, drift das versões de fábrica e o Verificador', () => {
    const map = GameMap.fromAscii(MAP_ROWS);
    const w = new World(map);
    w.arca = { phase: 0, delivered: 7, rejected: 2, done: false };
    const v = placeOk(w, 'verificador', 20, 20);
    v.caught = 3;
    v.queue.push({ res: 'mapa', bad: true });
    w.unlockTier1();
    const copy = deserialize(JSON.parse(JSON.stringify(serialize(w))), map);
    expect(copy.tier).toBe(1);
    expect(copy.arca).toEqual(w.arca);
    expect(copy.designs.get(factoryId('cartografo'))!.drift).toBe(DRIFT_PP);
    const cv = [...copy.agents.values()][0];
    expect(cv.caught).toBe(3);
    expect(cv.queue).toEqual([{ res: 'mapa', bad: true }]);
  });

  it('save antigo (v4) começa com Tier 1 liberado e sem drift', () => {
    const map = GameMap.fromAscii(MAP_ROWS);
    const old = deserialize({ version: 4, time: 1, agents: [{ id: 1, type: 'construtor', x: 20, y: 20 }], connections: [] }, map);
    expect(old.tier).toBe(1);
    expect(old.agents.size).toBe(1);
    expect(old.designs.get(factoryId('construtor'))!.drift ?? 0).toBe(0);
  });
});
