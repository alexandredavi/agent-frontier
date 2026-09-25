export type Speed = 0 | 1 | 2 | 4;

/**
 * Relógio de passo fixo: a simulação sempre avança em passos de STEP segundos,
 * independente do FPS. Velocidade 0 = pausado.
 */
export class SimClock {
  static readonly STEP = 0.1;
  /** Limite de tempo real consumido por quadro (evita "saltos" ao voltar de outra aba). */
  static readonly MAX_FRAME = 0.25;

  private acc = 0;
  private _speed: Speed = 1;
  private lastRunning: Exclude<Speed, 0> = 1;

  get speed(): Speed {
    return this._speed;
  }

  setSpeed(s: Speed): void {
    this._speed = s;
    if (s !== 0) this.lastRunning = s;
  }

  togglePause(): void {
    this.setSpeed(this._speed === 0 ? this.lastRunning : 0);
  }

  /** Avança o relógio pelo tempo real decorrido; chama `step` para cada passo fixo. Retorna o nº de passos. */
  advance(realDt: number, step: (dt: number) => void): number {
    if (this._speed === 0) return 0;
    this.acc += Math.min(Math.max(realDt, 0), SimClock.MAX_FRAME) * this._speed;
    let n = 0;
    while (this.acc >= SimClock.STEP - 1e-9) {
      step(SimClock.STEP);
      this.acc -= SimClock.STEP;
      n++;
    }
    return n;
  }
}
