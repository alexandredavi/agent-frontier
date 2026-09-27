import type { GameMap } from '../sim/map';
import { deserialize, serialize } from '../sim/save';
import type { World } from '../sim/world';
import { ARCA_PHASES } from '../sim/defs';

/** Save único das versões antigas (descartado: os 10 espaços começam do zero). */
const LEGACY_KEY = 'agent-frontier:save:v1';
const SLOT_KEY = (i: number) => `agent-frontier:slot:${i}`;
const INDEX_KEY = 'agent-frontier:slots:v2';
const LAST_KEY = 'agent-frontier:last-slot';
export const SLOT_COUNT = 10;

export interface SlotMeta {
  name: string;
  savedAt: number;
  /** Tempo de jogo em segundos. */
  time: number;
  arca: string;
  agents: number;
  stage: number;
  /** Miniatura do mapa (data URL). */
  thumb?: string;
}

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function readIndex(): (SlotMeta | null)[] {
  const out: (SlotMeta | null)[] = Array(SLOT_COUNT).fill(null);
  try {
    const raw = JSON.parse(storage()?.getItem(INDEX_KEY) ?? '[]');
    if (Array.isArray(raw)) raw.slice(0, SLOT_COUNT).forEach((m, i) => (out[i] = m && typeof m === 'object' && typeof m.name === 'string' ? m : null));
  } catch {
    /* índice corrompido: trata como vazio */
  }
  return out;
}

function writeIndex(idx: (SlotMeta | null)[]): void {
  storage()?.setItem(INDEX_KEY, JSON.stringify(idx));
}

/** Remove o save único antigo (uma vez). */
export function clearLegacySave(): void {
  try {
    storage()?.removeItem(LEGACY_KEY);
  } catch {
    /* nada */
  }
}

export function listSlots(): (SlotMeta | null)[] {
  return readIndex();
}

export function freeSlot(): number {
  return readIndex().findIndex((m) => m === null);
}

export function metaOf(world: World, name: string, thumb?: string): SlotMeta {
  const a = world.arca;
  const arca = a.done ? 'Arca concluída' : `Arca fase ${a.phase + 1} · ${a.delivered}/${ARCA_PHASES[a.phase].n}`;
  return { name, savedAt: Date.now(), time: Math.round(world.time), arca, agents: world.agents.size, stage: a.done ? 2 : Math.min(1, a.phase), thumb };
}

export function loadSlot(i: number, map: GameMap): World | null {
  try {
    const raw = storage()?.getItem(SLOT_KEY(i));
    return raw ? deserialize(JSON.parse(raw), map) : null;
  } catch {
    return null;
  }
}

/** Grava o mundo num espaço (nome/miniatura mantidos se não vierem). Retorna false se faltar espaço no navegador. */
export function writeSlot(i: number, world: World, opts: { name?: string; thumb?: string } = {}): boolean {
  const st = storage();
  if (!st || i < 0 || i >= SLOT_COUNT) return false;
  const idx = readIndex();
  const prev = idx[i];
  const meta = metaOf(world, opts.name ?? prev?.name ?? `Colônia ${i + 1}`, opts.thumb ?? prev?.thumb);
  try {
    st.setItem(SLOT_KEY(i), JSON.stringify(serialize(world)));
    idx[i] = meta;
    writeIndex(idx);
    return true;
  } catch {
    return false;
  }
}

export function deleteSlot(i: number): void {
  const st = storage();
  if (!st) return;
  st.removeItem(SLOT_KEY(i));
  const idx = readIndex();
  idx[i] = null;
  writeIndex(idx);
  if (lastSlot() === i) st.removeItem(LAST_KEY);
}

export function renameSlot(i: number, name: string): void {
  const idx = readIndex();
  const m = idx[i];
  if (!m) return;
  idx[i] = { ...m, name: name.trim().slice(0, 40) || m.name };
  writeIndex(idx);
}

/** Copia um espaço para o primeiro livre. Retorna o índice novo, ou -1 se não houver espaço livre. */
export function duplicateSlot(i: number): number {
  const st = storage();
  const idx = readIndex();
  const to = idx.findIndex((m) => m === null);
  const src = idx[i];
  const raw = st?.getItem(SLOT_KEY(i));
  if (!st || to < 0 || !src || !raw) return -1;
  try {
    st.setItem(SLOT_KEY(to), raw);
    idx[to] = { ...src, name: `${src.name} (cópia)`.slice(0, 40), savedAt: Date.now() };
    writeIndex(idx);
    return to;
  } catch {
    return -1;
  }
}

export function lastSlot(): number | null {
  const v = Number(storage()?.getItem(LAST_KEY) ?? 'NaN');
  return Number.isInteger(v) && v >= 0 && v < SLOT_COUNT && readIndex()[v] ? v : null;
}

export function setLastSlot(i: number): void {
  storage()?.setItem(LAST_KEY, String(i));
}

// ---------- espaço em uso (salvamento automático) ----------

let current: number | null = null;
let currentThumb: (() => string | undefined) | null = null;

/** Define o espaço onde o jogo salva sozinho (null = tela de abertura, não salva). */
export function setCurrentSlot(i: number | null, thumb?: () => string | undefined): void {
  current = i;
  if (thumb) currentThumb = thumb;
}

export function currentSlot(): number | null {
  return current;
}

/** Salva no espaço atual (sem espaço atual, não faz nada). */
export function writeSave(world: World): boolean {
  if (current === null) return false;
  return writeSlot(current, world, { thumb: currentThumb?.() });
}

export function exportSave(world: World): void {
  const blob = new Blob([JSON.stringify(serialize(world), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  a.href = url;
  a.download = `agent-frontier-${stamp}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Abre o seletor de arquivo e devolve o mundo carregado (ou rejeita se o arquivo for inválido). */
export function importSave(map: GameMap): Promise<World> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return reject(new Error('Nenhum arquivo'));
      try {
        resolve(deserialize(JSON.parse(await file.text()), map));
      } catch (e) {
        reject(e);
      }
    };
    input.click();
  });
}

/** Exporta o Diário de sessão (playtest) como JSON. Nada sai do computador: é um download local. */
export function exportDiary(world: World): void {
  const t = Math.round(world.time);
  const data = {
    jogo: 'Agent Frontier',
    versao: 'MVP (Etapa 7)',
    exportadoEm: new Date().toISOString(),
    resumo: {
      tempoDeJogoSeg: t,
      tier: world.tier,
      arca: world.arca,
      agentes: world.agents.size,
      versoesCriadas: [...world.designs.values()].filter((d) => !d.factory).length,
      tutorial: world.tutorial,
    },
    diario: world.diary,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `agent-frontier-diario-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
