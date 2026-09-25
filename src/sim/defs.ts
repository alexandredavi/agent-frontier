import type { AgentType, ResourceId } from './types';

/** Todos os agentes do protótipo ocupam 2x2 células. */
export const AGENT_SIZE = 2;

export const RESOURCES: Record<ResourceId, { name: string }> = {
  gelo: { name: 'Gelo' },
  regolito: { name: 'Regolito' },
};

export interface AgentDef {
  name: string;
  /** Itens produzidos por minuto (tempo de jogo). */
  ratePerMin: number;
  /** Consumo de energia (usado a partir do M3). */
  kw: number;
}

export const AGENT_DEFS: Record<AgentType, AgentDef> = {
  extrator: { name: 'Extrator', ratePerMin: 30, kw: 4 },
};
