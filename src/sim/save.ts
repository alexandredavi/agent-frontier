import { AGENT_DEFS, LINK } from './defs';
import type { GameMap } from './map';
import type { AgentType, ResourceId } from './types';
import { World } from './world';

export const SAVE_VERSION = 2;

export interface SaveData {
  version: typeof SAVE_VERSION;
  time: number;
  agents: { id: number; type: AgentType; x: number; y: number; produced: number; acc: number; buffer: ResourceId[] }[];
  connections: { from: number; to: number; items: { res: ResourceId; pos: number }[] }[];
}

export function serialize(world: World): SaveData {
  return {
    version: SAVE_VERSION,
    time: world.time,
    agents: [...world.agents.values()].map(({ id, type, x, y, produced, acc, buffer }) => ({ id, type, x, y, produced, acc, buffer: [...buffer] })),
    connections: [...world.connections.values()].map(({ from, to, items }) => ({ from, to, items: items.map((i) => ({ ...i })) })),
  };
}

const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const isRes = (v: unknown): v is ResourceId => v === 'gelo' || v === 'regolito';
const isType = (v: unknown): v is AgentType => typeof v === 'string' && v in AGENT_DEFS;

/**
 * Reconstrói o mundo a partir de um save (v2, ou v1 do M1 — migrado).
 * Lança erro se o formato for inválido.
 */
export function deserialize(data: unknown, map: GameMap): World {
  const d = data as Record<string, unknown> | null;
  if (!d || typeof d !== 'object' || !Array.isArray(d.agents) || (d.version !== 1 && d.version !== 2)) {
    throw new Error('Save inválido ou de outra versão');
  }
  const world = new World(map);
  world.time = num(d.time);
  const idMap = new Map<number, number>();

  for (const raw of d.agents as Record<string, unknown>[]) {
    if (!isType(raw.type)) continue;
    const res = world.place(raw.type, num(raw.x, -1), num(raw.y, -1));
    if (!res.ok) continue;
    const a = res.agent;
    a.produced = num(raw.produced);
    a.acc = Math.min(1, num(raw.acc));
    if (Array.isArray(raw.buffer)) a.buffer = raw.buffer.filter(isRes).slice(0, AGENT_DEFS[a.type].capacity);
    if (typeof raw.id === 'number') idMap.set(raw.id, a.id);
  }

  // v1 (M1) não tinha conexões; o estoque global antigo é descartado.
  if (d.version === 2 && Array.isArray(d.connections)) {
    for (const raw of d.connections as Record<string, unknown>[]) {
      const from = idMap.get(num(raw.from, -1));
      const to = idMap.get(num(raw.to, -1));
      if (from === undefined || to === undefined) continue;
      const res = world.connect(from, to);
      if (!res.ok || !Array.isArray(raw.items)) continue;
      const items = (raw.items as Record<string, unknown>[])
        .filter((i) => isRes(i.res))
        .map((i) => ({ res: i.res as ResourceId, pos: Math.min(res.connection.length, Math.max(0, num(i.pos))) }))
        .sort((x, y) => y.pos - x.pos);
      // Garante o espaçamento mínimo depois de carregar
      let limit = res.connection.length;
      for (const it of items) {
        it.pos = Math.min(it.pos, limit);
        limit = it.pos - LINK.gap;
      }
      res.connection.items = items.filter((i) => i.pos >= 0);
    }
  }
  return world;
}
