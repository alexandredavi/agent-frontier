import { describe, expect, it } from 'vitest';
import { slotOfKey, watchOtherTabs } from './multitab';

describe('mesma colônia em outra aba', () => {
  it('reconhece a chave de um espaço de save', () => {
    expect(slotOfKey('agent-frontier:slot:3')).toBe(3);
    expect(slotOfKey('agent-frontier:slots:v2')).toBeNull();
    expect(slotOfKey('agent-frontier:last-slot')).toBeNull();
    expect(slotOfKey(null)).toBeNull();
  });

  it('avisa só quando outra aba grava o espaço em uso, no máximo uma vez por minuto', () => {
    const target = new EventTarget();
    let slot: number | null = 2;
    let t = 0;
    let warned = 0;
    watchOtherTabs(target as unknown as Window, () => slot, () => warned++, 60_000, () => t);
    const save = (key: string) => {
      const e = new Event('storage') as Event & { key: string };
      e.key = key;
      target.dispatchEvent(e);
    };
    save('agent-frontier:slot:5');
    save('agent-frontier:slots:v2');
    expect(warned).toBe(0);
    save('agent-frontier:slot:2');
    t = 10_000;
    save('agent-frontier:slot:2');
    expect(warned).toBe(1);
    t = 70_000;
    save('agent-frontier:slot:2');
    expect(warned).toBe(2);
    slot = null; // tela de abertura
    t = 200_000;
    save('agent-frontier:slot:2');
    expect(warned).toBe(2);
  });
});
