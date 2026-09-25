import type { AgentType, ResourceId, Terrain } from '../sim/types';

export const TILE = 32;

export const FONT = 'Inter, "Segoe UI", system-ui, sans-serif';

export const TERRAIN_COLOR: Record<Terrain, number> = {
  planicie: 0x3b3430,
  cratera: 0x28313c,
  rocha: 0x575049,
  nevoa: 0x0e1016,
};

export const RESOURCE_COLOR: Record<ResourceId, number> = {
  gelo: 0x7fdcff,
  regolito: 0xd08c5b,
};

/** Cor por função de agente: extração = âmbar, armazenamento = violeta, logística = verde-água. */
export const AGENT_COLOR: Record<AgentType, number> = {
  extrator: 0xe0a53f,
  silo: 0xa78bfa,
  divisor: 0x4fd1c5,
  unificador: 0x4fd1c5,
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
};

export const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
