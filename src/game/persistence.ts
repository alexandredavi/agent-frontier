import type { GameMap } from '../sim/map';
import { deserialize, serialize } from '../sim/save';
import type { World } from '../sim/world';

const KEY = 'agent-frontier:save:v1';

export function loadSave(map: GameMap): World | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? deserialize(JSON.parse(raw), map) : null;
  } catch {
    return null;
  }
}

export function writeSave(world: World): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(serialize(world)));
    return true;
  } catch {
    return false;
  }
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
