/** Gerador pseudoaleatório com semente (mulberry32): mesmo resultado a cada execução. */
export class Rng {
  constructor(public state = 0x9e3779b9) {}

  /** Número em [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** true com probabilidade p. */
  chance(p: number): boolean {
    return this.next() < p;
  }
}
