import { beforeEach, describe, expect, it } from 'vitest';
import { GameMap } from '../sim/map';
import { MAP_ROWS } from '../sim/mapData';
import { World } from '../sim/world';
import {
  SLOT_COUNT, clearLegacySave, currentSlot, deleteSlot, duplicateSlot, freeSlot, lastSlot, listSlots, loadSlot, onSaveError, renameSlot, setCurrentSlot, setLastSlot, writeSave, writeSlot,
} from './persistence';

class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  get length() { return this.m.size; }
}

const map = GameMap.fromAscii(MAP_ROWS);

describe('10 espaços de save', () => {
  let mem: MemStorage;
  beforeEach(() => {
    mem = new MemStorage();
    (globalThis as { localStorage?: unknown }).localStorage = mem;
    setCurrentSlot(null);
  });

  it('começa vazio e o save antigo é descartado', () => {
    mem.setItem('agent-frontier:save:v1', '{}');
    clearLegacySave();
    expect(mem.getItem('agent-frontier:save:v1')).toBeNull();
    expect(listSlots()).toHaveLength(SLOT_COUNT);
    expect(listSlots().every((m) => m === null)).toBe(true);
    expect(freeSlot()).toBe(0);
    expect(lastSlot()).toBeNull();
  });

  it('grava, lista, carrega, renomeia, duplica e apaga', () => {
    const w = new World(map);
    w.place('sensor', 14, 12);
    expect(writeSlot(3, w, { name: 'Base Norte' })).toBe(true);
    const meta = listSlots()[3]!;
    expect(meta.name).toBe('Base Norte');
    expect(meta.agents).toBe(1);
    expect(meta.arca).toContain('fase 1');
    expect(loadSlot(3, map)!.agents.size).toBe(1);

    renameSlot(3, '  Base Sul  ');
    expect(listSlots()[3]!.name).toBe('Base Sul');

    const copy = duplicateSlot(3);
    expect(copy).toBe(0);
    expect(listSlots()[0]!.name).toBe('Base Sul (cópia)');
    expect(loadSlot(0, map)!.agents.size).toBe(1);

    setLastSlot(3);
    expect(lastSlot()).toBe(3);
    deleteSlot(3);
    expect(listSlots()[3]).toBeNull();
    expect(loadSlot(3, map)).toBeNull();
    expect(lastSlot()).toBeNull();
  });

  it('com os 10 ocupados não há espaço livre nem cópia', () => {
    const w = new World(map);
    for (let i = 0; i < SLOT_COUNT; i++) writeSlot(i, w, { name: `C${i}` });
    expect(freeSlot()).toBe(-1);
    expect(duplicateSlot(0)).toBe(-1);
  });

  it('salvamento automático só grava no espaço em uso', () => {
    const w = new World(map);
    expect(writeSave(w)).toBe(false);
    setCurrentSlot(5);
    expect(currentSlot()).toBe(5);
    expect(writeSave(w)).toBe(true);
    expect(listSlots()[5]!.name).toBe('Colônia 6');
    w.place('sensor', 14, 12);
    writeSave(w);
    expect(listSlots()[5]!.agents).toBe(1);
    expect(listSlots()[5]!.name).toBe('Colônia 6');
  });

  it('índice corrompido é tratado como vazio', () => {
    mem.setItem('agent-frontier:slots:v2', '{oops');
    expect(listSlots().every((m) => m === null)).toBe(true);
  });

  it('avisa quando o navegador recusa gravar (armazenamento cheio)', () => {
    let errors = 0;
    onSaveError(() => errors++);
    mem.setItem = () => {
      throw new DOMException('quota', 'QuotaExceededError');
    };
    expect(writeSlot(0, new World(map), { name: 'Cheio' })).toBe(false);
    expect(errors).toBe(1);
    onSaveError(null);
  });
});
