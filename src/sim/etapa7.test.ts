import { describe, expect, it } from 'vitest';
import { GameMap } from './map';
import { MAP_ROWS } from './mapData';
import { deserialize, serialize } from './save';
import { openMap } from './testMaps';
import type { Agent, AgentType, ResourceId } from './types';
import { TUTORIAL_STEPS, World } from './world';

function placeOk(w: World, type: AgentType, x: number, y: number): Agent {
  const r = w.place(type, x, y);
  if (!r.ok) throw new Error(`place ${type}: ${r.reason}`);
  return r.agent;
}
const receive = (w: World, a: Agent, res: ResourceId, bad = false) =>
  (w as unknown as { receive(a: Agent, r: ResourceId, b: boolean): void }).receive(a, res, bad);

describe('mover agente', () => {
  it('mantém conexões no alcance, ajusta o comprimento e remove as que ficam longe', () => {
    const w = new World(openMap(40, 10));
    const a = placeOk(w, 'sensor', 2, 4);
    const b = placeOk(w, 'cartografo', 8, 4);
    const c = placeOk(w, 'silo', 14, 4);
    w.connect(a.id, b.id);
    w.connect(b.id, c.id);
    const r = w.move(b.id, 10, 4);
    expect(r).toEqual({ ok: true, removed: 0 });
    expect(w.agentAt(10, 4)?.id).toBe(b.id);
    expect(w.agentAt(8, 4)).toBeUndefined();
    const r2 = w.move(c.id, 26, 4); // cartógrafo (centro 11) → silo (centro 27): 16 > 12
    expect(r2).toEqual({ ok: true, removed: 1 });
    expect(w.outputsOf(b.id)).toHaveLength(0);
  });

  it('recusa destino inválido e deixa o agente onde estava', () => {
    const w = new World(openMap(40, 10));
    const a = placeOk(w, 'silo', 2, 4);
    placeOk(w, 'silo', 8, 4);
    expect(w.move(a.id, 9, 4)).toEqual({ ok: false, reason: 'ocupado' });
    expect(w.agentAt(2, 4)?.id).toBe(a.id);
    expect(w.move(a.id, 3, 4).ok).toBe(true); // sobrepor a si mesmo é permitido
  });

  it('Extrator só se move para outro nó (e muda de recurso)', () => {
    const w = new World(openMap(40, 10, [{ x: 2, y: 2, c: 'r' }, { x: 10, y: 2, c: 'i' }]));
    const e = placeOk(w, 'extrator', 2, 2);
    expect(w.move(e.id, 20, 2)).toEqual({ ok: false, reason: 'sem-no' });
    expect(w.move(e.id, 10, 2).ok).toBe(true);
    expect(e.resource).toBe('gelo');
    expect(e.biome).toBe(10); // nó de gelo fica na cratera
  });
});

describe('Plataforma: excedente', () => {
  it('na Fase 2, Mapas viram excedente sem travar; itens que não são carga continuam recusados', () => {
    const w = new World(openMap(30, 10));
    w.tier = 1;
    w.arca = { phase: 1, delivered: 0, rejected: 0, surplus: 0, done: false };
    const p = placeOk(w, 'plataforma', 2, 2);
    expect(w.accepts(p, 'mapa')).toBe(true);
    expect(w.accepts(p, 'gelo')).toBe(false);
    receive(w, p, 'mapa');
    receive(w, p, 'modulo');
    expect(w.arca).toMatchObject({ delivered: 1, surplus: 1 });
  });
});

describe('diário de sessão', () => {
  it('marca a primeira vez de cada coisa, conta e amostra por minuto de jogo', () => {
    const w = new World(openMap(30, 10));
    const s = placeOk(w, 'sensor', 2, 2);
    const c = placeOk(w, 'cartografo', 8, 2);
    w.connect(s.id, c.id);
    w.count('bancadas');
    w.count('bancadas');
    for (let i = 0; i < 1250; i++) w.tick(0.1); // ~125 s
    expect(Object.keys(w.diary.milestones)).toEqual(expect.arrayContaining(['primeiro_agente', 'primeira_conexao']));
    expect(w.diary.milestones.primeiro_agente.game).toBe(0);
    expect(w.diary.counts.bancadas).toBe(2);
    expect(w.diary.samples.map((x) => x.game)).toEqual([60, 120]);
    expect(w.diary.samples[0]).toMatchObject({ agents: 2, power: 100 });
  });
});

describe('tutorial', () => {
  it('avança conforme o jogador cumpre cada passo', () => {
    const w = new World(openMap(40, 10));
    expect(w.tutorial).toEqual({ step: 0, skipped: false, done: false });
    const s = placeOk(w, 'sensor', 2, 2);
    w.checkTutorial();
    expect(TUTORIAL_STEPS[w.tutorial!.step]).toBe('cartografo');
    const c = placeOk(w, 'cartografo', 8, 2);
    w.connect(s.id, c.id);
    w.checkTutorial();
    expect(TUTORIAL_STEPS[w.tutorial!.step]).toBe('plataforma');
    const p = placeOk(w, 'plataforma', 14, 2);
    w.connect(c.id, p.id);
    w.checkTutorial();
    expect(TUTORIAL_STEPS[w.tutorial!.step]).toBe('entregar');
    receive(w, p, 'mapa');
    w.checkTutorial();
    expect(TUTORIAL_STEPS[w.tutorial!.step]).toBe('bancada');
    w.mark('primeira_bancada');
    w.checkTutorial();
    expect(TUTORIAL_STEPS[w.tutorial!.step]).toBe('verificador');
    w.disconnect([...w.connections.values()].find((x) => x.to === p.id)!.id);
    const v = placeOk(w, 'verificador', 20, 2);
    w.connect(c.id, v.id);
    w.connect(v.id, p.id);
    w.checkTutorial();
    expect(w.tutorial!.done).toBe(true);
  });

  it('save guarda diário e tutorial; save antigo não mostra tutorial', () => {
    const map = GameMap.fromAscii(MAP_ROWS);
    const w = new World(map);
    w.tutorial = { step: 3, skipped: false, done: false };
    w.count('demolicoes', 4);
    const copy = deserialize(JSON.parse(JSON.stringify(serialize(w))), map);
    expect(copy.tutorial).toEqual({ step: 3, skipped: false, done: false });
    expect(copy.diary.counts.demolicoes).toBe(4);
    const old = deserialize({ version: 4, time: 0, agents: [], connections: [] }, map);
    expect(old.tutorial).toBeNull();
  });
});
