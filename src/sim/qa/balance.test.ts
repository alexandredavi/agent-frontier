import { describe, expect, it } from 'vitest';
import { buildFase0, buildFase1, buildNovato, median, newWorld, run, trackArca } from './bots';
import { TARGETS } from './targets';

const SEEDS = [7919, 15838, 23757, 31676, 39595, 47514];
const min = (s: number) => `${(s / 60).toFixed(1)} min`;

describe('balanceamento · Fase 0', () => {
  it('novato que só segue a MERIDIAN entrega o 1º Mapa e libera o Tier 1 a tempo', () => {
    const firsts: number[] = [];
    const tiers: number[] = [];
    for (const seed of SEEDS) {
      const w = newWorld(seed);
      buildNovato(w);
      run(w, 45 * 60, () => w.tier >= 1);
      expect(w.tier, `semente ${seed} não liberou o Tier 1 em 45 min`).toBe(1);
      firsts.push(w.diary.milestones.primeiro_mapa!.game);
      tiers.push(w.time);
    }
    const t = TARGETS.novato;
    expect(Math.max(...firsts), `1º Mapa mais lento: ${min(Math.max(...firsts))}`).toBeLessThanOrEqual(t.primeiroMapaMax);
    expect(median(tiers), `mediana do Tier 1: ${min(median(tiers))}`).toBeLessThanOrEqual(t.tier1MedianaMax);
    expect(Math.max(...tiers), `pior Tier 1: ${min(Math.max(...tiers))}`).toBeLessThanOrEqual(t.tier1PiorMax);
  });

  it('Fase 0 otimizada fica na faixa (nem trivial, nem lenta)', () => {
    const tiers = SEEDS.slice(0, 3).map((seed) => {
      const w = newWorld(seed);
      buildFase0(w, 4, 2);
      run(w, 30 * 60, () => w.tier >= 1);
      return w.time;
    });
    const m = median(tiers);
    expect(m, `mediana: ${min(m)}`).toBeGreaterThanOrEqual(TARGETS.fase0Otimizada.tier1Min);
    expect(m, `mediana: ${min(m)}`).toBeLessThanOrEqual(TARGETS.fase0Otimizada.tier1Max);
  });

  it('energia importa: 4 linhas sem Painel Solar rendem menos que com Painéis', () => {
    const time = (solar: number) => {
      const w = newWorld(SEEDS[0]);
      buildFase0(w, 4, solar);
      run(w, 30 * 60, () => w.tier >= 1);
      return { t: w.time, factor: w.power.factor };
    };
    const sem = time(0);
    const com = time(2);
    expect(sem.factor).toBeLessThan(0.5);
    expect(com.factor).toBe(1);
    expect(sem.t).toBeGreaterThan(com.t * 2);
  });
});

describe('balanceamento · Fase 1', () => {
  // Uma campanha inteira por caso: mais lento que os outros testes (~alguns segundos).
  const campaign = (seed: number, verifiers: boolean) => {
    const w = newWorld(seed);
    const arca = trackArca(w);
    buildFase0(w, 4, 2);
    run(w, 30 * 60, () => w.tier >= 1);
    const t1 = w.time;
    buildFase1(w, verifiers);
    run(w, 4 * 3600, () => w.arca.done);
    return { done: w.arca.done, fase1: w.time - t1, badRate: arca.bad[1] / (arca.good[1] + arca.bad[1]) };
  };

  it('com Verificadores, os 50 Módulos saem dentro da faixa de tempo', () => {
    const runs = [31337, 62674].map((s) => campaign(s, true));
    for (const r of runs) expect(r.done).toBe(true);
    const m = median(runs.map((r) => r.fase1));
    expect(m, `Fase 1: ${min(m)}`).toBeGreaterThanOrEqual(TARGETS.fase1ComVerificador.min);
    expect(m, `Fase 1: ${min(m)}`).toBeLessThanOrEqual(TARGETS.fase1ComVerificador.max);
  });

  it('Verificador compensa: sem ele há mais Módulos rejeitados e a Fase 1 demora mais', () => {
    const com = campaign(31337, true);
    const sem = campaign(31337, false);
    expect(sem.badRate).toBeGreaterThan(com.badRate);
    expect(sem.fase1).toBeGreaterThan(com.fase1);
  });
});
