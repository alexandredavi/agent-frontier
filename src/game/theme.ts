import type { Category } from '../sim/defs';
import type { AgentType, ResourceId, Terrain } from '../sim/types';

export const TILE = 32;

export const FONT = 'Inter, "Segoe UI", system-ui, sans-serif';

export const TERRAIN_COLOR: Record<Terrain, number> = {
  planicie: 0x3b3430,
  cratera: 0x28313c,
  serra: 0x4a3533,
  rocha: 0x575049,
  nevoa: 0x0e1016,
};

/** Matéria = círculos; dados = losangos (ver RESOURCES[...].kind). */
export const RESOURCE_COLOR: Record<ResourceId, number> = {
  gelo: 0x7fdcff,
  regolito: 0xd08c5b,
  minerio: 0xc3ccd9,
  telemetria: 0xf472b6,
  agua: 0x3b82f6,
  modelo: 0xc084fc,
  o2: 0xa5f3fc,
  lingote: 0x8b9bb0,
  painel: 0xe2b36a,
  modulo: 0x34d399,
  mapa: 0xfde68a,
};

export const CATEGORY_COLOR: Record<Category, number> = {
  extracao: 0xe0a53f,
  processamento: 0x60a5fa,
  logistica: 0x4fd1c5,
  energia: 0xfacc15,
};

/** Cor da borda/ícone de cada agente (por categoria, com exceções). */
export const AGENT_COLOR: Record<AgentType, number> = {
  extrator: CATEGORY_COLOR.extracao,
  sensor: CATEGORY_COLOR.extracao,
  derretedor: CATEGORY_COLOR.processamento,
  cartografo: CATEGORY_COLOR.processamento,
  analista: CATEGORY_COLOR.processamento,
  eletrolisador: CATEGORY_COLOR.processamento,
  fundidor: CATEGORY_COLOR.processamento,
  prensa: CATEGORY_COLOR.processamento,
  construtor: CATEGORY_COLOR.processamento,
  silo: 0xa78bfa,
  divisor: CATEGORY_COLOR.logistica,
  unificador: CATEGORY_COLOR.logistica,
  descarte: 0xf87171,
  verificador: 0x86efac,
  plataforma: 0xfb923c,
  painel_solar: CATEGORY_COLOR.energia,
};

export const LINK_COLOR = 0x6b7a94;
export const WARN = 0xf5b041;

export const UI = {
  panel: 0x141821,
  panelAlpha: 0.92,
  stroke: 0x2c3444,
  text: '#e8ecf3',
  muted: '#8b95a7',
  accent: 0x5ec8ff,
  accentText: '#5ec8ff',
  ok: 0x4ade80,
  bad: 0xf87171,
  badText: '#f87171',
};

export const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
