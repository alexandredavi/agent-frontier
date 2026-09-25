import { describe, expect, it } from 'vitest';
import { SimClock } from './clock';

describe('SimClock', () => {
  it('avança em passos fixos proporcionais à velocidade', () => {
    const c = new SimClock();
    let t = 0;
    c.advance(0.2, (dt) => (t += dt));
    expect(t).toBeCloseTo(0.2);
    c.setSpeed(4);
    c.advance(0.2, (dt) => (t += dt));
    expect(t).toBeCloseTo(1.0);
  });

  it('não avança pausado e retoma a última velocidade', () => {
    const c = new SimClock();
    c.setSpeed(2);
    c.togglePause();
    expect(c.speed).toBe(0);
    expect(c.advance(1, () => {})).toBe(0);
    c.togglePause();
    expect(c.speed).toBe(2);
  });

  it('limita o tempo consumido por quadro', () => {
    const c = new SimClock();
    expect(c.advance(10, () => {})).toBe(Math.floor(SimClock.MAX_FRAME / SimClock.STEP));
  });
});
