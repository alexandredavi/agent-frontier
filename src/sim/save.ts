import { AGENT_DEFS, INPUT_CYCLES, LINK, RESOURCES } from './defs';
import { CARDS, CORES, type CardId, type CoreId, type Design, TOOLS, type ToolId, isMachine } from './designs';
import type { GameMap } from './map';
import { ARCA_PHASES } from './defs';
import type { AgentType, ArcaState, Item, ResourceId } from './types';
import { World } from './world';

export const SAVE_VERSION = 5;

export interface SaveData {
  version: typeof SAVE_VERSION;
  time: number;
  rng: number;
  tier: number;
  arca: ArcaState;
  /** Drift pendente por versão (inclui as de fábrica, que não são salvas em `designs`). */
  drift: Record<string, number>;
  designs: Design[];
  active: Partial<Record<AgentType, string>>;
  agents: {
    id: number;
    type: AgentType;
    x: number;
    y: number;
    designId: string | null;
    produced: number;
    progress: number;
    running: boolean;
    quality: number;
    defects: number;
    inherited: number;
    inputs: Partial<Record<ResourceId, number>>;
    badInputs: Partial<Record<ResourceId, number>>;
    buffer: Item[];
    queue: Item[];
    rejects: Item[];
    caught: number;
    falsePos: number;
    missed: number;
  }[];
  connections: { from: number; to: number; items: { res: ResourceId; bad: boolean; pos: number }[] }[];
}

export function serialize(world: World): SaveData {
  return {
    version: SAVE_VERSION,
    time: world.time,
    rng: world.rng.state,
    tier: world.tier,
    arca: { ...world.arca },
    drift: Object.fromEntries([...world.designs.values()].filter((d) => d.drift).map((d) => [d.id, d.drift!])),
    designs: [...world.designs.values()].filter((d) => !d.factory).map((d) => ({ ...d, cards: [...d.cards] })),
    active: { ...world.activeDesign },
    agents: [...world.agents.values()].map((a) => ({
      id: a.id,
      type: a.type,
      x: a.x,
      y: a.y,
      designId: a.designId,
      produced: a.produced,
      progress: a.progress,
      running: a.running,
      quality: a.quality,
      defects: a.defects,
      inherited: a.inherited,
      inputs: { ...a.inputs },
      badInputs: { ...a.badInputs },
      buffer: a.buffer.map((i) => ({ ...i })),
      queue: a.queue.map((i) => ({ ...i })),
      rejects: a.rejects.map((i) => ({ ...i })),
      caught: a.caught,
      falsePos: a.falsePos,
      missed: a.missed,
    })),
    connections: [...world.connections.values()].map(({ from, to, items }) => ({ from, to, items: items.map((i) => ({ ...i })) })),
  };
}

const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const isRes = (v: unknown): v is ResourceId => typeof v === 'string' && v in RESOURCES;
const isType = (v: unknown): v is AgentType => typeof v === 'string' && v in AGENT_DEFS;

/** Aceita item novo ({res, bad}) ou antigo (só o id do recurso). */
function toItem(v: unknown): Item | null {
  if (isRes(v)) return { res: v, bad: false };
  const o = v as { res?: unknown; bad?: unknown } | null;
  return o && isRes(o.res) ? { res: o.res, bad: o.bad === true } : null;
}

function readDesign(raw: Record<string, unknown>): Design | null {
  if (typeof raw.id !== 'string' || !isType(raw.role) || !isMachine(raw.role)) return null;
  const core = raw.core as CoreId;
  const tool = raw.tool as ToolId;
  if (!(core in CORES) || !(tool in TOOLS) || !TOOLS[tool].roles.includes(raw.role)) return null;
  const cards = (Array.isArray(raw.cards) ? raw.cards : []).filter((c): c is CardId => typeof c === 'string' && c in CARDS).slice(0, CORES[core].slots);
  return {
    id: raw.id,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.slice(0, 40) : `${AGENT_DEFS[raw.role].name} v${num(raw.version, 2)}`,
    role: raw.role,
    core,
    tool,
    cards,
    version: Math.max(2, Math.floor(num(raw.version, 2))),
    factory: false,
  };
}

/**
 * Reconstrói o mundo a partir de um save (v4; v1–v3 são migrados — agentes viram "v1 de fábrica").
 * Lança erro se o formato for inválido.
 */
export function deserialize(data: unknown, map: GameMap): World {
  const d = data as Record<string, unknown> | null;
  if (!d || typeof d !== 'object' || !Array.isArray(d.agents) || ![1, 2, 3, 4, 5].includes(d.version as number)) {
    throw new Error('Save inválido ou de outra versão');
  }
  const world = new World(map);
  world.time = num(d.time);
  if (typeof d.rng === 'number') world.rng.state = d.rng | 0;
  // Saves de antes do M5 já tinham agentes de Tier 1: começam com o Tier 1 liberado e sem drift.
  world.tier = d.version === 5 ? Math.max(0, Math.min(1, num(d.tier))) : 1;
  const arca = d.arca as Partial<ArcaState> | undefined;
  if (d.version === 5 && arca && typeof arca === 'object') {
    const phase = Math.max(0, Math.min(ARCA_PHASES.length - 1, Math.floor(num(arca.phase))));
    world.arca = { phase, delivered: Math.max(0, Math.floor(num(arca.delivered))), rejected: Math.max(0, Math.floor(num(arca.rejected))), done: arca.done === true };
  }

  if (Array.isArray(d.designs)) {
    for (const raw of d.designs as Record<string, unknown>[]) {
      const design = readDesign(raw);
      if (design) world.addDesign(design);
    }
  }
  if (d.drift && typeof d.drift === 'object') {
    for (const [id, v] of Object.entries(d.drift as Record<string, unknown>)) {
      const design = world.designs.get(id);
      if (design) design.drift = Math.max(0, num(v));
    }
  }
  if (d.active && typeof d.active === 'object') {
    for (const id of Object.values(d.active as Record<string, unknown>)) if (typeof id === 'string') world.setActive(id);
  }

  const idMap = new Map<number, number>();
  for (const raw of d.agents as Record<string, unknown>[]) {
    if (!isType(raw.type)) continue;
    const designId = typeof raw.designId === 'string' && world.designs.get(raw.designId)?.role === raw.type ? raw.designId : undefined;
    // Sem versão válida → a de fábrica (não a ativa), para não mudar agentes antigos
    const res = world.place(raw.type, num(raw.x, -1), num(raw.y, -1), designId ?? (isMachine(raw.type) ? `f-${raw.type}` : undefined));
    if (!res.ok) continue;
    const a = res.agent;
    const def = AGENT_DEFS[a.type];
    a.produced = num(raw.produced);
    a.defects = num(raw.defects);
    a.inherited = num(raw.inherited ?? raw.wasted);
    // v1/v2 guardavam a fração do próximo item em `acc`
    a.progress = Math.min(1, Math.max(0, num(raw.progress ?? raw.acc)));
    a.running = raw.running === true && !!def.recipe;
    // Saves antigos do M4 marcavam o ciclo como "contaminado" (perdido); vira qualidade 0,5
    a.quality = a.running ? Math.min(1, Math.max(0, num(raw.quality, raw.contaminated === true ? 0.5 : 1))) : 1;
    if (!a.running && Object.keys(def.recipe?.inputs ?? {}).length > 0) a.progress = 0;
    const items = (v: unknown, max: number) => (Array.isArray(v) ? v.map(toItem).filter((i): i is Item => !!i).slice(0, max) : []);
    if (Array.isArray(raw.buffer)) a.buffer = items(raw.buffer, def.capacity);
    if (a.type === 'verificador') {
      a.queue = items(raw.queue, 2);
      a.rejects = items(raw.rejects, def.capacity);
      a.caught = num(raw.caught);
      a.falsePos = num(raw.falsePos);
      a.missed = num(raw.missed);
    }
    if (def.recipe) {
      for (const [field, target] of [['inputs', a.inputs], ['badInputs', a.badInputs]] as const) {
        const src = raw[field];
        if (!src || typeof src !== 'object') continue;
        for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
          const need = def.recipe.inputs[k as ResourceId];
          if (isRes(k) && need) target[k] = Math.min(need * INPUT_CYCLES, Math.max(0, Math.floor(num(v))));
        }
      }
      for (const k of Object.keys(a.badInputs) as ResourceId[]) a.badInputs[k] = Math.min(a.badInputs[k]!, a.inputs[k] ?? 0);
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
        .map((i) => ({ res: i.res as ResourceId, bad: i.bad === true, pos: Math.min(res.connection.length, Math.max(0, num(i.pos))) }))
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
