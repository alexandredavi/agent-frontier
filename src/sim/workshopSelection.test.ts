import { describe, expect, it } from 'vitest';
import { factoryDesign, factoryId } from './designs';
import { deserialize, serialize } from './save';
import { openMap } from './testMaps';
import { initialWorkshopDesign } from './workshopSelection';
import { World } from './world';

describe('versão em que a Oficina abre', () => {
  it('no Tier 0 cai no Cartógrafo da barra em vez do Analista travado', () => {
    const w = new World(openMap(40, 10));
    expect(w.designUnlocked(w.designs.get(factoryId('analista'))!)).toBe(false);
    expect(initialWorkshopDesign(w, null, factoryId('analista'))).toBe(factoryId('cartografo'));
    expect(initialWorkshopDesign(w, null, null)).toBe(factoryId('cartografo'));
  });

  it('usa a versão do Cartógrafo que está na barra, não só a de fábrica', () => {
    const w = new World(openMap(40, 10));
    const v2 = { ...factoryDesign('cartografo'), id: 'u-carto-2', name: 'Cartógrafo v2', version: 2, factory: false };
    w.addDesign(v2);
    w.setActive(v2.id);
    expect(initialWorkshopDesign(w, null, null)).toBe('u-carto-2');
  });

  it('mantém a seleção atual quando ela existe e está liberada', () => {
    const w = new World(openMap(40, 10));
    expect(initialWorkshopDesign(w, null, factoryId('sensor'))).toBe(factoryId('sensor'));
    w.unlockTier1(false);
    expect(initialWorkshopDesign(w, null, factoryId('analista'))).toBe(factoryId('analista'));
  });

  it('descarta seleção que não existe mais', () => {
    const w = new World(openMap(40, 10));
    expect(initialWorkshopDesign(w, null, 'nao-existe')).toBe(factoryId('cartografo'));
  });

  it('o agente fixado tem prioridade; pin de agente que sumiu é ignorado', () => {
    const w = new World(openMap(40, 10));
    const r = w.place('sensor', 2, 4);
    if (!r.ok) throw new Error(r.reason);
    expect(initialWorkshopDesign(w, r.agent.id, factoryId('cartografo'))).toBe(factoryId('sensor'));
    expect(initialWorkshopDesign(w, 9999, factoryId('sensor'))).toBe(factoryId('sensor'));
  });
});

describe('semente no Diário', () => {
  it('sobrevive ao save e fica fora das contagens', () => {
    const w = new World(openMap(40, 10));
    w.diary.seed = 0xdeadbeef;
    w.rng.state = 0xdeadbeef | 0;
    const copy = deserialize(serialize(w), openMap(40, 10));
    expect(copy.diary.seed).toBe(0xdeadbeef);
    expect(copy.diary.counts).not.toHaveProperty('semente');
    expect(copy.rng.state).toBe(w.rng.state);
  });

  it('saves antigos continuam sem semente', () => {
    const w = new World(openMap(40, 10));
    const copy = deserialize(serialize(w), openMap(40, 10));
    expect(copy.diary.seed).toBeUndefined();
  });
});
