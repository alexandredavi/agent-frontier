import { describe, expect, it } from 'vitest';
import { GameMap } from './map';
import { MAP_ROWS } from './mapData';
import { deserialize, serialize } from './save';
import { World } from './world';

const map = () => GameMap.fromAscii(MAP_ROWS);

describe('save', () => {
  it('ida e volta preserva agentes, conexões, itens em trânsito e estoque', () => {
    const m = map();
    const w = new World(m);
    const e = w.place('extrator', 17, 8);
    const s = w.place('silo', 22, 8);
    if (!e.ok || !s.ok) throw new Error('place');
    expect(w.connect(e.agent.id, s.agent.id).ok).toBe(true);
    for (let i = 0; i < 205; i++) w.tick(0.1);
    const copy = deserialize(JSON.parse(JSON.stringify(serialize(w))), m);
    expect(copy.agents.size).toBe(2);
    expect(copy.connections.size).toBe(1);
    expect(copy.stockTotals()).toEqual(w.stockTotals());
    const [c1] = copy.connections.values();
    const [c0] = w.connections.values();
    expect(c1.items.map((i) => i.res)).toEqual(c0.items.map((i) => i.res));
    expect(copy.time).toBeCloseTo(w.time);
  });

  it('migra save v1 (M1): extratores voltam sem conexões, estoque antigo descartado', () => {
    const v1 = { version: 1, time: 42, stock: { gelo: 10, regolito: 20 }, agents: [{ type: 'extrator', x: 17, y: 8, produced: 30, acc: 0.5 }] };
    const w = deserialize(v1, map());
    expect(w.agents.size).toBe(1);
    expect(w.connections.size).toBe(0);
    expect(w.stockTotals()).toEqual({ gelo: 0, regolito: 0 });
    expect([...w.agents.values()][0].produced).toBe(30);
  });

  it('rejeita dados inválidos', () => {
    expect(() => deserialize({ version: 99, agents: [] }, map())).toThrow();
    expect(() => deserialize(null, map())).toThrow();
  });
});
