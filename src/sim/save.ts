import type { GameMap } from './map';
import type { AgentType, ResourceId } from './types';
import { World } from './world';

export const SAVE_VERSION = 1;

export interface SaveData {
  version: typeof SAVE_VERSION;
  time: number;
  stock: Record<ResourceId, number>;
  agents: { type: AgentType; x: number; y: number; produced: number; acc: number }[];
}

export function serialize(world: World): SaveData {
  return {
    version: SAVE_VERSION,
    time: world.time,
    stock: { ...world.stock },
    agents: [...world.agents.values()].map(({ type, x, y, produced, acc }) => ({ type, x, y, produced, acc })),
  };
}

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** Reconstrói o mundo a partir de um save. Lança erro se o formato for inválido. */
export function deserialize(data: unknown, map: GameMap): World {
  const d = data as Partial<SaveData> | null;
  if (!d || typeof d !== 'object' || d.version !== SAVE_VERSION || !Array.isArray(d.agents)) {
    throw new Error('Save inválido ou de outra versão');
  }
  const world = new World(map);
  world.time = num(d.time);
  world.stock.gelo = num(d.stock?.gelo);
  world.stock.regolito = num(d.stock?.regolito);
  for (const a of d.agents) {
    const res = world.place(a.type, num(a.x, -1), num(a.y, -1));
    if (res.ok) {
      res.agent.produced = num(a.produced);
      res.agent.acc = num(a.acc);
    }
  }
  return world;
}
