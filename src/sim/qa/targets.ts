/**
 * Faixas de balanceamento vigiadas pelo CI (src/sim/qa/balance.test.ts).
 * Tempos em segundos de jogo, a 1×. Ajuste aqui quando o balanceamento mudar
 * de propósito (Etapa 3 do plano de testes); o teste falha se o jogo sair da faixa.
 */
export const TARGETS = {
  /** Novato: só o tutorial (1 Sensor → 1 Cartógrafo → 1 Plataforma), sem Painel Solar. */
  novato: {
    primeiroMapaMax: 2 * 60,
    tier1MedianaMax: 15 * 60,
    tier1PiorMax: 20 * 60,
  },
  /** 4 linhas Sensor→Cartógrafo com energia suficiente. */
  fase0Otimizada: { tier1Min: 2 * 60, tier1Max: 6 * 60 },
  /**
   * Fase 1 (50 Módulos) com Verificadores nas saídas de Painéis e O₂. Hoje: ~68–72 min,
   * limitada pelo O₂ (o Construtor fica ocioso). Faixa estreita o bastante para pegar,
   * por exemplo, Construtor 2× mais lento (~92 min) ou Eletrolisador 6→9 s (~104 min).
   */
  fase1ComVerificador: { min: 55 * 60, max: 85 * 60 },
} as const;
