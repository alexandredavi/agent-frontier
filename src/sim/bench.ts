import { AGENT_DEFS, agentKw } from './defs';
import { type Design, designStats } from './designs';
import { Rng } from './rng';

export interface BenchResult {
  samples: number;
  /** Itens bons dentre as amostras. */
  good: number;
  /** Alucinações (itens defeituosos). */
  failures: number;
  /** Confiabilidade medida (%). */
  measured: number;
  /** Itens por minuto (energia plena, ingredientes à vontade). */
  perMin: number;
  /** Consumo trabalhando (kW; Extrator considerado em Gelo/Regolito). */
  kw: number;
  /** Tempo de jogo que as amostras levariam (s). */
  gameSeconds: number;
}

/**
 * Bancada de testes: roda a versão isolada com amostras limpas (ingredientes perfeitos),
 * como um eval. Cada rodada tem variação natural porque o sorteio muda.
 */
export function runBench(design: Design, samples = 100, rng = new Rng((Math.random() * 2 ** 32) >>> 0)): BenchResult {
  const st = designStats(design);
  const recipe = AGENT_DEFS[design.role].recipe!;
  let good = 0;
  for (let i = 0; i < samples; i++) if (st.reliability >= 100 || !rng.chance(1 - st.reliability / 100)) good++;
  const cycles = Math.ceil(samples / recipe.output.n);
  return {
    samples,
    good,
    failures: samples - good,
    measured: (good / samples) * 100,
    perMin: st.perMin,
    kw: agentKw(design.role, null) * st.kwMult,
    gameSeconds: (cycles * recipe.cycle) / st.speed,
  };
}
