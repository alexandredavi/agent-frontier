import type { AgentType, ResourceId } from './types';

/** Todos os agentes do protótipo ocupam 2x2 células. */
export const AGENT_SIZE = 2;

export const RESOURCES: Record<ResourceId, { name: string }> = {
  gelo: { name: 'Gelo' },
  regolito: { name: 'Regolito' },
};

export interface AgentDef {
  name: string;
  /** Máximo de conexões de entrada e de saída. */
  maxIn: number;
  maxOut: number;
  /** Capacidade do buffer interno (ou do estoque, no Silo). */
  capacity: number;
  /** Itens produzidos por minuto (só Extrator). */
  ratePerMin?: number;
  /** Precisa ficar sobre um nó de recurso. */
  needsNode?: boolean;
  /** Consumo de energia (usado a partir do M3). */
  kw: number;
}

export const AGENT_DEFS: Record<AgentType, AgentDef> = {
  extrator: { name: 'Extrator', maxIn: 0, maxOut: 1, capacity: 10, ratePerMin: 30, needsNode: true, kw: 4 },
  silo: { name: 'Silo', maxIn: 4, maxOut: 1, capacity: 200, kw: 0 },
  divisor: { name: 'Divisor', maxIn: 1, maxOut: 3, capacity: 2, kw: 1 },
  unificador: { name: 'Unificador', maxIn: 3, maxOut: 1, capacity: 2, kw: 1 },
};

/** Conexão Mk1. */
export const LINK = {
  ratePerMin: 60,
  /** Alcance máximo, centro a centro, em células. */
  range: 12,
  /** Velocidade dos itens, em células por segundo. */
  speed: 3,
  /** Espaço mínimo entre itens parados numa fila, em células. */
  gap: 0.5,
};

/** Tempo bloqueado (s) a partir do qual o agente fica vermelho. */
export const STALL_ALERT = 5;
