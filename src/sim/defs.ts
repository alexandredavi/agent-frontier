import type { AgentType, ResourceId } from './types';

/** Todos os agentes do protótipo ocupam 2x2 células. */
export const AGENT_SIZE = 2;

export type ResourceKind = 'materia' | 'dados';

export const RESOURCES: Record<ResourceId, { name: string; kind: ResourceKind }> = {
  gelo: { name: 'Gelo', kind: 'materia' },
  regolito: { name: 'Regolito', kind: 'materia' },
  minerio: { name: 'Minério', kind: 'materia' },
  telemetria: { name: 'Telemetria', kind: 'dados' },
  agua: { name: 'Água', kind: 'materia' },
  modelo: { name: 'Modelo químico', kind: 'dados' },
  o2: { name: 'O₂', kind: 'materia' },
  lingote: { name: 'Lingote', kind: 'materia' },
  painel: { name: 'Painel estrutural', kind: 'materia' },
  modulo: { name: 'Módulo de habitat', kind: 'materia' },
  mapa: { name: 'Mapa de pouso', kind: 'dados' },
};

export const RESOURCE_ORDER = Object.keys(RESOURCES) as ResourceId[];

export interface Recipe {
  /** Ingredientes consumidos por ciclo. */
  inputs: Partial<Record<ResourceId, number>>;
  /** Saída por ciclo. `res: null` = o recurso do nó (Extrator). */
  output: { res: ResourceId | null; n: number };
  /** Duração do ciclo, em segundos. */
  cycle: number;
}

export type Category = 'extracao' | 'processamento' | 'logistica' | 'energia';

export interface AgentDef {
  name: string;
  category: Category;
  maxIn: number;
  maxOut: number;
  /** Capacidade do buffer de saída (ou do estoque, no Silo). */
  capacity: number;
  recipe?: Recipe;
  /** Precisa ficar sobre um nó de recurso. */
  needsNode?: boolean;
  /** Consumo enquanto trabalha (kW). */
  kw: number;
  /** Geração de energia (kW). */
  generates?: number;
}

export const AGENT_DEFS: Record<AgentType, AgentDef> = {
  extrator: { name: 'Extrator', category: 'extracao', maxIn: 0, maxOut: 1, capacity: 10, needsNode: true, kw: 4, recipe: { inputs: {}, output: { res: null, n: 1 }, cycle: 2 } },
  sensor: { name: 'Sensor', category: 'extracao', maxIn: 0, maxOut: 1, capacity: 10, kw: 2, recipe: { inputs: {}, output: { res: 'telemetria', n: 1 }, cycle: 3 } },

  derretedor: { name: 'Derretedor', category: 'processamento', maxIn: 2, maxOut: 1, capacity: 10, kw: 8, recipe: { inputs: { gelo: 1 }, output: { res: 'agua', n: 1 }, cycle: 2 } },
  cartografo: { name: 'Cartógrafo', category: 'processamento', maxIn: 2, maxOut: 1, capacity: 10, kw: 6, recipe: { inputs: { telemetria: 10 }, output: { res: 'mapa', n: 1 }, cycle: 30 } },
  analista: { name: 'Analista', category: 'processamento', maxIn: 2, maxOut: 1, capacity: 10, kw: 6, recipe: { inputs: { telemetria: 2 }, output: { res: 'modelo', n: 1 }, cycle: 6 } },
  eletrolisador: { name: 'Eletrolisador', category: 'processamento', maxIn: 2, maxOut: 1, capacity: 10, kw: 10, recipe: { inputs: { agua: 3, modelo: 1 }, output: { res: 'o2', n: 3 }, cycle: 6 } },
  fundidor: { name: 'Fundidor', category: 'processamento', maxIn: 2, maxOut: 1, capacity: 10, kw: 10, recipe: { inputs: { minerio: 2 }, output: { res: 'lingote', n: 1 }, cycle: 4 } },
  prensa: { name: 'Prensa', category: 'processamento', maxIn: 2, maxOut: 1, capacity: 10, kw: 8, recipe: { inputs: { lingote: 1, regolito: 2 }, output: { res: 'painel', n: 1 }, cycle: 4 } },
  construtor: { name: 'Construtor', category: 'processamento', maxIn: 2, maxOut: 1, capacity: 10, kw: 12, recipe: { inputs: { painel: 5, o2: 10 }, output: { res: 'modulo', n: 1 }, cycle: 30 } },

  silo: { name: 'Silo', category: 'logistica', maxIn: 4, maxOut: 1, capacity: 200, kw: 0 },
  divisor: { name: 'Divisor', category: 'logistica', maxIn: 1, maxOut: 3, capacity: 2, kw: 0 },
  unificador: { name: 'Unificador', category: 'logistica', maxIn: 3, maxOut: 1, capacity: 2, kw: 0 },
  descarte: { name: 'Descarte', category: 'logistica', maxIn: 3, maxOut: 0, capacity: 0, kw: 0 },
  plataforma: { name: 'Plataforma de Carga', category: 'logistica', maxIn: 4, maxOut: 0, capacity: 0, kw: 0 },
  verificador: { name: 'Verificador', category: 'processamento', maxIn: 1, maxOut: 2, capacity: 4, kw: 6 },

  painel_solar: { name: 'Painel Solar', category: 'energia', maxIn: 0, maxOut: 0, capacity: 0, kw: 0, generates: 20 },
};

/** Consumo real de um agente (o Extrator de Minério gasta mais). */
export function agentKw(type: AgentType, resource: ResourceId | null): number {
  return type === 'extrator' && resource === 'minerio' ? 6 : AGENT_DEFS[type].kw;
}

/** Energia fixa da cápsula de pouso. */
export const CAPSULE_KW = 10;

/**
 * Peso dos defeitos herdados: chance de cada item sair bom =
 * confiabilidade × (fração de ingredientes bons)^INHERIT_EXPONENT.
 */
export const INHERIT_EXPONENT = 2;

/** Ingredientes: cada buffer guarda até 2 ciclos. */
export const INPUT_CYCLES = 2;

export const CATEGORIES: { id: Category; name: string; types: AgentType[] }[] = [
  { id: 'extracao', name: 'Extração', types: ['extrator', 'sensor'] },
  { id: 'processamento', name: 'Processamento', types: ['derretedor', 'cartografo', 'analista', 'eletrolisador', 'fundidor', 'prensa', 'construtor', 'verificador'] },
  { id: 'logistica', name: 'Logística', types: ['silo', 'divisor', 'unificador', 'descarte', 'plataforma'] },
  { id: 'energia', name: 'Energia', types: ['painel_solar'] },
];

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

/** Agentes que exigem o Tier 1 (os demais estão liberados desde o início). */
export const TIER1_TYPES: AgentType[] = ['analista', 'eletrolisador', 'fundidor', 'prensa', 'construtor'];
/** Recursos cujo nó só pode ser extraído no Tier 1. */
export const TIER1_NODES: ResourceId[] = ['minerio'];

/** Metas da Arca, em ordem. A Fase 0 libera o Tier 1. */
export const ARCA_PHASES: { res: ResourceId; n: number; title: string }[] = [
  { res: 'mapa', n: 20, title: 'Mapas de pouso' },
  { res: 'modulo', n: 50, title: 'Módulos de habitat' },
];

/** Sujeira por terreno (pp de confiabilidade perdidos por agentes de IA ali). */
export const BIOME_PENALTY: Record<string, number> = { planicie: 0, serra: 5, cratera: 10 };
export const BIOME_NAME: Record<string, string> = { planicie: 'Planície de Pouso', serra: 'Cordilheira Ferrosa', cratera: 'Crateras Polares' };

/** Verificador: itens inspecionados por minuto (× velocidade) e falsos positivos. */
export const VERIFIER = { ratePerMin: 30, falsePositive: 0.02, falsePositiveCareful: 0.01 };

/** Experiência: +1 pp a cada XP_PER_PP itens processados, até XP_MAX pp. */
export const XP_PER_PP = 500;
export const XP_MAX = 10;

/** Perda de confiabilidade das versões existentes quando o Tier 1 é liberado. */
export const DRIFT_PP = 5;

/** Tempo bloqueado (s) a partir do qual o agente fica vermelho. */
export const STALL_ALERT = 5;

/** Texto curto da receita, ex.: "3 Água + 1 Modelo químico → 3 O₂ (6 s)". */
export function recipeText(type: AgentType, resource: ResourceId | null = null): string {
  const r = AGENT_DEFS[type].recipe;
  if (type === 'verificador') return `Inspeciona ${VERIFIER.ratePerMin} itens/min: aprovados → 1ª saída, rejeitados → 2ª`;
  if (!r) return '';
  const ins = Object.entries(r.inputs).map(([k, n]) => `${n} ${RESOURCES[k as ResourceId].name}`);
  const outRes = r.output.res ?? resource;
  const out = outRes ? `${r.output.n} ${RESOURCES[outRes].name}` : `${r.output.n} do nó`;
  return `${ins.length ? ins.join(' + ') + ' → ' : ''}${out} (${r.cycle} s)`;
}

/** Itens por minuto de saída de uma receita. */
export function outputPerMin(type: AgentType): number {
  const r = AGENT_DEFS[type].recipe;
  return r ? (r.output.n * 60) / r.cycle : 0;
}
