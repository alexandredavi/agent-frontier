import { describe, expect, it } from 'vitest';
import { GameMap } from './map';
import { MAP_ROWS } from './mapData';
import { Rng } from './rng';
import { deserialize, serialize } from './save';
import { World } from './world';

const map = GameMap.fromAscii(MAP_ROWS);

describe('migração de saves antigos', () => {
  it('v3 (M3): buffer com ids de recurso e itens na linha sem "bad"', () => {
    const v3 = {
      version: 3,
      time: 300,
      agents: [
        { id: 1, type: 'extrator', x: 17, y: 8, produced: 40, progress: 0.5, running: true, inputs: {}, buffer: ['regolito', 'regolito'] },
        { id: 2, type: 'silo', x: 20, y: 8, produced: 0, progress: 0, running: false, inputs: {}, buffer: ['regolito'] },
      ],
      connections: [{ from: 1, to: 2, items: [{ res: 'regolito', pos: 0.4 }] }],
    };
    const w = deserialize(v3, map);
    const [ex, silo] = [...w.agents.values()];
    expect(w.tier).toBe(1); // saves antigos já tinham agentes de Tier 1
    expect(ex.buffer).toEqual([{ res: 'regolito', bad: false }, { res: 'regolito', bad: false }]);
    expect(silo.buffer).toEqual([{ res: 'regolito', bad: false }]);
    expect([...w.connections.values()][0].items).toEqual([{ res: 'regolito', bad: false, pos: 0.4 }]);
    expect(w.tutorial).toBeNull(); // saves sem tutorial não mostram a MERIDIAN
  });

  it('v4 (M4): versões da Oficina, "contaminated" vira qualidade 0,5 e "wasted" vira herdados', () => {
    const v4 = {
      version: 4,
      time: 900,
      rng: 12345,
      designs: [{ id: 'u-cart-2', name: 'Cartógrafo rápido', role: 'cartografo', core: 'basico', tool: 'laboratorio', cards: ['acelerar'], version: 2, factory: false }],
      active: { cartografo: 'u-cart-2' },
      agents: [{ id: 7, type: 'cartografo', x: 18, y: 16, designId: 'u-cart-2', produced: 12, progress: 0.3, running: true, contaminated: true, defects: 3, wasted: 2, inputs: { telemetria: 4 }, badInputs: { telemetria: 1 }, buffer: [{ res: 'mapa', bad: true }] }],
      connections: [],
    };
    const w = deserialize(v4, map);
    const a = [...w.agents.values()][0];
    expect(w.activeDesign.cartografo).toBe('u-cart-2');
    expect(a).toMatchObject({ designId: 'u-cart-2', quality: 0.5, inherited: 2, defects: 3, inputs: { telemetria: 4 }, badInputs: { telemetria: 1 } });
    expect(w.rng.state).toBe(12345);
  });
});

describe('saves corrompidos ou editados à mão', () => {
  const base = () => {
    const w = new World(map);
    w.tier = 1;
    const ids = [['sensor', 16, 16], ['cartografo', 19, 16], ['verificador', 22, 16], ['plataforma', 25, 16], ['silo', 19, 19]].map(([t, x, y]) => {
      const r = w.place(t as never, x as number, y as number);
      if (!r.ok) throw new Error(r.reason);
      return r.agent.id;
    });
    w.connect(ids[0], ids[1]);
    w.connect(ids[1], ids[2]);
    w.connect(ids[2], ids[3]);
    w.connect(ids[2], ids[4]);
    for (let i = 0; i < 1200; i++) w.tick(0.1);
    return JSON.stringify(serialize(w));
  };

  it('entradas nulas e campos trocados não derrubam o jogo depois de carregar', () => {
    const d = JSON.parse(base());
    d.agents.unshift(null, 5, 'x');
    d.connections.push(null, { from: 1, to: 2, items: [null, { res: 'mapa', pos: 1 }] });
    d.designs = [null, 'x'];
    d.diary.milestones = 0.5;
    d.diary.counts = [];
    d.diary.samples.push(null);
    d.agents[3].produced = -999999;
    const w = deserialize(d, map);
    for (let i = 0; i < 50; i++) w.tick(0.1);
    expect(() => w.mark('primeiro_agente')).not.toThrow();
    expect(() => w.count('x')).not.toThrow();
    expect([...w.agents.values()].every((a) => a.produced >= 0)).toBe(true);
    expect(w.diary.samples.every((s) => s && typeof s === 'object')).toBe(true);
  });

  it('3.000 mutações aleatórias: ou recusa com "Save inválido", ou carrega um mundo que roda', () => {
    const src = base();
    const R = new Rng(9);
    const junk: unknown[] = [null, -1, 1e308, 'x', [], {}, true, -999999, 0.5];
    const bad: string[] = [];
    for (let n = 0; n < 3000; n++) {
      const d = JSON.parse(src);
      const paths: [Record<string, unknown>, string][] = [];
      const walk = (o: unknown) => {
        if (o && typeof o === 'object') for (const k of Object.keys(o)) { paths.push([o as Record<string, unknown>, k]); walk((o as Record<string, unknown>)[k]); }
      };
      walk(d);
      for (let m = 0; m < 3; m++) {
        const [o, k] = paths[Math.floor(R.next() * paths.length)];
        o[k] = junk[Math.floor(R.next() * junk.length)];
      }
      try {
        const w = deserialize(d, map);
        for (let i = 0; i < 30; i++) w.tick(0.1);
        w.mark('teste');
        w.count('teste');
        const broken = [...w.agents.values()].some((a) => !Number.isFinite(a.progress) || !(a.produced >= 0)) || !Number.isFinite(w.arca.delivered);
        if (broken && bad.length < 5) bad.push(`mutação ${n}: estado inválido`);
      } catch (e) {
        if (!String(e).includes('Save inválido') && bad.length < 5) bad.push(`mutação ${n}: ${String(e).slice(0, 100)}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
