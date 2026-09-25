import { AGENT_DEFS } from './defs';
import type { AgentType } from './types';

/** Agentes de IA (montados na Oficina). Logística e energia são infraestrutura pronta. */
export const MACHINE_ROLES: AgentType[] = ['extrator', 'sensor', 'derretedor', 'cartografo', 'analista', 'eletrolisador', 'fundidor', 'prensa', 'construtor'];

export const isMachine = (t: AgentType): boolean => MACHINE_ROLES.includes(t);

export type CoreId = 'basico' | 'avancado';
export type ToolId = 'broca' | 'antena' | 'aquecedor' | 'laboratorio' | 'celula' | 'forno' | 'braco' | 'montador';
export type CardId = 'acelerar' | 'cuidadoso' | 'economico' | 'filtrar';

export const CORES: Record<CoreId, { name: string; speed: number; rel: number; kw: number; slots: number }> = {
  basico: { name: 'Núcleo Básico', speed: 1, rel: 0, kw: 1, slots: 2 },
  avancado: { name: 'Núcleo Avançado', speed: 1.5, rel: 10, kw: 2, slots: 4 },
};

/** Ferramenta → receitas (papéis) que ela habilita. */
export const TOOLS: Record<ToolId, { name: string; roles: AgentType[] }> = {
  broca: { name: 'Broca', roles: ['extrator'] },
  antena: { name: 'Antena', roles: ['sensor'] },
  aquecedor: { name: 'Aquecedor', roles: ['derretedor'] },
  laboratorio: { name: 'Laboratório', roles: ['cartografo', 'analista'] },
  celula: { name: 'Célula', roles: ['eletrolisador'] },
  forno: { name: 'Forno', roles: ['fundidor'] },
  braco: { name: 'Braço soldador', roles: ['prensa'] },
  montador: { name: 'Montador', roles: ['construtor'] },
};

export const TOOL_OF: Record<string, ToolId> = Object.fromEntries(
  (Object.entries(TOOLS) as [ToolId, { roles: AgentType[] }][]).flatMap(([tool, t]) => t.roles.map((r) => [r, tool])),
);

export interface CardDef {
  name: string;
  effect: string;
  speed?: number;
  rel?: number;
  kw?: number;
  /** Ainda não disponível (liberado em outro marco). */
  lockedUntil?: string;
}

export const CARDS: Record<CardId, CardDef> = {
  acelerar: { name: 'Acelerar', effect: '×1,5 velocidade · −10 pp confiabilidade', speed: 1.5, rel: -10 },
  cuidadoso: { name: 'Cuidadoso', effect: '×0,5 velocidade · +15 pp confiabilidade', speed: 0.5, rel: 15 },
  economico: { name: 'Econômico', effect: '−30% consumo · ×0,8 velocidade', speed: 0.8, kw: 0.7 },
  filtrar: { name: 'Filtrar entrada suja', effect: 'Anula a sujeira do bioma', lockedUntil: 'M5' },
};

/** Custo de contexto: cada cartão encaixado deixa o agente 5% mais lento. */
export const CARD_CONTEXT_COST = 0.95;

/** Confiabilidade base de cada receita (%). */
export const BASE_RELIABILITY: Record<string, number> = {
  extrator: 100,
  sensor: 100,
  derretedor: 100,
  cartografo: 80,
  analista: 80,
  eletrolisador: 90,
  fundidor: 90,
  prensa: 90,
  construtor: 90,
};

export interface Design {
  id: string;
  name: string;
  role: AgentType;
  core: CoreId;
  tool: ToolId;
  cards: CardId[];
  /** Nº da versão dentro do papel (v1 = fábrica). */
  version: number;
  factory: boolean;
}

export interface DesignStats {
  /** Multiplicador de velocidade do ciclo. */
  speed: number;
  /** Confiabilidade 0..100. */
  reliability: number;
  /** Multiplicador do consumo de energia. */
  kwMult: number;
  slots: number;
  /** Itens por minuto com energia plena e ingredientes à vontade. */
  perMin: number;
}

export const factoryId = (role: AgentType) => `f-${role}`;

export function factoryDesign(role: AgentType): Design {
  return { id: factoryId(role), name: `${AGENT_DEFS[role].name} v1`, role, core: 'basico', tool: TOOL_OF[role], cards: [], version: 1, factory: true };
}

export function designStats(d: Pick<Design, 'role' | 'core' | 'cards'>): DesignStats {
  const core = CORES[d.core];
  let speed = core.speed;
  let rel = BASE_RELIABILITY[d.role] + core.rel;
  let kw = core.kw;
  for (const c of d.cards) {
    const card = CARDS[c];
    if (card.lockedUntil) continue;
    speed *= card.speed ?? 1;
    rel += card.rel ?? 0;
    kw *= card.kw ?? 1;
  }
  speed *= Math.pow(CARD_CONTEXT_COST, d.cards.length);
  const base = BASE_RELIABILITY[d.role];
  rel = Math.max(5, Math.min(rel, Math.max(base, 99)));
  const r = AGENT_DEFS[d.role].recipe!;
  return { speed, reliability: rel, kwMult: kw, slots: core.slots, perMin: ((r.output.n * 60) / r.cycle) * speed };
}
