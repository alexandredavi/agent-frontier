import { describe, expect, it } from 'vitest';
import { GameMap } from './map';
import { MAP_ROWS } from './mapData';
import { deserialize, serialize } from './save';
import { World } from './world';

describe('save', () => {
  it('ida e volta preserva agentes, estoque e tempo', () => {
    const map = GameMap.fromAscii(MAP_ROWS);
    const w = new World(map);
    expect(w.place('extrator', 17, 8).ok).toBe(true);
    for (let i = 0; i < 100; i++) w.tick(0.1);
    const copy = deserialize(JSON.parse(JSON.stringify(serialize(w))), map);
    expect(copy.agents.size).toBe(1);
    expect(copy.stock).toEqual(w.stock);
    expect(copy.time).toBeCloseTo(w.time);
    expect([...copy.agents.values()][0].produced).toBe([...w.agents.values()][0].produced);
  });

  it('rejeita dados inválidos', () => {
    const map = GameMap.fromAscii(MAP_ROWS);
    expect(() => deserialize({ version: 99 }, map)).toThrow();
    expect(() => deserialize(null, map)).toThrow();
  });
});
