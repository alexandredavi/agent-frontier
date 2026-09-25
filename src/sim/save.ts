import { AGENT_DEFS, INPUT_CYCLES, LINK, RESOURCES } from './defs';
import type { GameMap } from './map';
import type { AgentType, ResourceId } from './types';
import { World } from './world';

export const SAVE_VERSION = 3;

export interface SaveData {
  version: typeof SAVE_VERSION;
  time: number;
  agents: {
    id: number;
    type: AgentType;
    x: number;
    y: number;
    produced: number;
    progress: number;
    running: boolean;
    inputs: Partial<Record<ResourceId, number>>;
    buffer: ResourceId[];
  }[];
  connections: { from: number; to: number; items: { res: ResourceId; pos: number }[] }[];
}

export function serialize(world: World): SaveData {
  return {
    version: SAVE_VERSION,
    time: world.time,
    agents: [...world.agents.values()].map(({ id, type, x, y, produced, progress, running, inputs, buffer }) => ({
      id,
      type,
      x,
      y,
      produced,
      progress,
      running,
      inputs: { ...inputs },
      buffer: [...buffer],
    })),
    connections: [...world.connections.values()].map(({ from, to, items }) => ({ from, to, items: items.map((i) => ({ ...i })) })),
  };
}

const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const isRes = (v: unknown): v is ResourceId => typeof v === 'string' && v in RESOURCES;
const isType = (v: unknown): v is AgentType => typeof v === 'string' && v in AGENT_DEFS;

/**
 * Reconstrói o mundo a partir de um save (v3; v2 do M2 e v1 do M1 são migrados).
 * Lança erro se o formato for inválido.
 */
export function deserialize(data: unknown, map: GameMap): World {
  const d = data as Record<string, unknown> | null;
  if (!d || typeof d !== 'object' || !Array.isArray(d.agents) || ![1, 2, 3].includes(d.version as number)) {
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
    const def = AGENT_DEFS[a.type];
    a.produced = num(raw.produced);
    // v1/v2 guardavam a fração do próximo item em `acc`
    a.progress = Math.min(1, Math.max(0, num(raw.progress ?? raw.acc)));
    a.running = raw.running === true && !!def.recipe;
    if (!a.running && Object.keys(def.recipe?.inputs ?? {}).length > 0) a.progress = 0;
    if (Array.isArray(raw.buffer)) a.buffer = raw.buffer.filter(isRes).slice(0, def.capacity);
    if (raw.inputs && typeof raw.inputs === 'object' && def.recipe) {
      for (const [k, v] of Object.entries(raw.inputs as Record<string, unknown>)) {
        const need = def.recipe.inputs[k as ResourceId];
        if (isRes(k) && need) a.inputs[k] = Math.min(need * INPUT_CYCLES, Math.max(0, Math.floor(num(v))));
      }
    }
    if (typeof raw.id === 'number') idMap.set(raw.id, a.id);
  }

  // v1 (M1) não tinha conexões; o estoque global antigo é descartado.
  if (d.version !== 1 && Array.isArray(d.connections)) {
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
