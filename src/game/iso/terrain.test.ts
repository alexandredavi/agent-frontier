import { describe, expect, it } from 'vitest';
import { GameMap } from '../../sim/map';
import { MAP_ROWS } from '../../sim/mapData';
import { PALETTES, terraStage, visualHeight } from './terrain';

describe('terraformação visual', () => {
  it('estágio segue as fases da Arca', () => {
    expect(terraStage({ phase: 0, done: false })).toBe(0);
    expect(terraStage({ phase: 1, done: false })).toBe(1);
    expect(terraStage({ phase: 1, done: true })).toBe(2);
    expect(terraStage({ phase: 7, done: false })).toBe(1);
  });

  it('há uma paleta completa para cada estágio', () => {
    expect(PALETTES).toHaveLength(3);
    const keys = Object.keys(PALETTES[0]).sort();
    for (const p of PALETTES) expect(Object.keys(p).sort()).toEqual(keys);
    // o céu clareia e as estrelas somem à medida que a atmosfera engrossa
    expect(PALETTES[0].stars).toBeGreaterThan(PALETTES[1].stars);
    expect(PALETTES[1].stars).toBeGreaterThan(PALETTES[2].stars);
    expect(PALETTES[2].water).toBe(true);
  });

  it('relevo: crateras afundam, cordilheira sobe em degraus de 9 px', () => {
    const map = GameMap.fromAscii(MAP_ROWS);
    const hs = new Set<number>();
    for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) hs.add(visualHeight(map, x, y));
    expect([...hs].every((h) => [-7, 0, 9, 18, 27].includes(h))).toBe(true);
    expect(hs.has(-7)).toBe(true);
    expect(hs.has(9)).toBe(true);
  });
});
