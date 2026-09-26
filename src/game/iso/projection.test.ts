import { describe, expect, it } from 'vitest';
import { TH, TW, cellAt, depthOf, footprintAt, fromIso, isoCircle, pickFrontmost, toIso } from './projection';

describe('projeção isométrica', () => {
  it('ida e volta grade → tela → grade', () => {
    for (const [gx, gy] of [[0, 0], [3, 7], [12.5, 4.25], [63, 31], [-2, 5]]) {
      const p = toIso(gx, gy);
      const g = fromIso(p.x, p.y);
      expect(g.gx).toBeCloseTo(gx);
      expect(g.gy).toBeCloseTo(gy);
    }
  });

  it('losango 2:1 e altura sobe na tela', () => {
    expect(toIso(1, 0)).toEqual({ x: TW / 2, y: TH / 2 });
    expect(toIso(0, 1)).toEqual({ x: -TW / 2, y: TH / 2 });
    expect(toIso(0, 0, 10).y).toBe(-10);
  });

  it('célula sob o cursor e área 2x2 centrada', () => {
    const c = toIso(5.5, 9.5);
    expect(cellAt(c.x, c.y)).toEqual({ x: 5, y: 9 });
    const center = toIso(8, 3); // centro de uma área 2x2 com canto em (7,2)
    expect(footprintAt(center.x, center.y)).toEqual({ x: 7, y: 2 });
  });

  it('profundidade cresce para a frente', () => {
    expect(depthOf(5, 5)).toBeGreaterThan(depthOf(4, 5));
    expect(depthOf(2, 8)).toBe(depthOf(8, 2));
  });

  it('círculo na grade vira elipse 2:1', () => {
    const e = isoCircle(12);
    expect(e.rx / e.ry).toBeCloseTo(2);
  });

  it('escolhe o agente mais à frente quando os desenhos se sobrepõem', () => {
    const box = { left: 0, right: 100, top: 0, bottom: 100 };
    const back = { id: 1, x: 3, y: 3, ...box };
    const front = { id: 2, x: 4, y: 4, ...box };
    const other = { id: 3, x: 9, y: 9, left: 200, right: 300, top: 0, bottom: 100 };
    expect(pickFrontmost([back, front, other], 50, 50)?.id).toBe(2);
    expect(pickFrontmost([back, front], 50, 50, (it) => it.id !== 2)?.id).toBe(1);
    expect(pickFrontmost([back, front], 150, 50)).toBeUndefined();
  });
});
