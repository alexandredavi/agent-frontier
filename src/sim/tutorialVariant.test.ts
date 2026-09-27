import { describe, expect, it } from 'vitest';
import type { AgentType } from './types';
import { deserialize, serialize } from './save';
import { openMap } from './testMaps';
import { TUTORIAL_ORDER, TUTORIAL_STEPS, World, tutorialSteps, tutorialVariantFromSearch } from './world';

const place = (w: World, type: AgentType, x: number) => {
  const r = w.place(type, x, 2);
  if (!r.ok) throw new Error(r.reason);
  return r.agent;
};

describe('variantes do tutorial (A/B do playtest)', () => {
  it('B tem os mesmos passos de A, com o Verificador antes da bancada', () => {
    expect([...TUTORIAL_ORDER.b].sort()).toEqual([...TUTORIAL_STEPS].sort());
    expect(TUTORIAL_ORDER.b.indexOf('verificador')).toBeLessThan(TUTORIAL_ORDER.b.indexOf('bancada'));
    expect(TUTORIAL_ORDER.a).toBe(TUTORIAL_STEPS);
    expect(tutorialSteps(null)).toBe(TUTORIAL_STEPS);
  });

  it('a variante vem da URL (?tut=b); qualquer outra coisa é A', () => {
    expect(tutorialVariantFromSearch('')).toBe('a');
    expect(tutorialVariantFromSearch('?tut=b')).toBe('b');
    expect(tutorialVariantFromSearch('?x=1&tut=B')).toBe('b');
    expect(tutorialVariantFromSearch('?tut=c')).toBe('a');
  });

  it('na variante B o jogo pede o Verificador logo depois do 1º Mapa e só então a bancada', () => {
    const w = new World(openMap(40, 10));
    w.tutorial!.variant = 'b';
    const s = place(w, 'sensor', 2);
    const c = place(w, 'cartografo', 8);
    w.connect(s.id, c.id);
    const p = place(w, 'plataforma', 14);
    w.connect(c.id, p.id);
    w.mark('primeiro_mapa');
    w.checkTutorial();
    expect(tutorialSteps(w.tutorial)[w.tutorial!.step]).toBe('verificador');
    w.mark('primeira_bancada'); // testar na Oficina antes da hora não pula o Verificador
    w.checkTutorial();
    expect(tutorialSteps(w.tutorial)[w.tutorial!.step]).toBe('verificador');
    w.disconnect([...w.connections.values()].find((x) => x.to === p.id)!.id);
    const v = place(w, 'verificador', 20);
    w.connect(c.id, v.id);
    w.connect(v.id, p.id);
    w.checkTutorial(); // Verificador feito; a bancada já tinha sido rodada → termina
    expect(w.tutorial!.done).toBe(true);
  });

  it('a variante fica no save (continuar a partida mantém a ordem); saves antigos seguem em A', () => {
    const w = new World(openMap(10, 10));
    w.tutorial = { step: 5, skipped: false, done: false, variant: 'b' };
    const back = deserialize(JSON.parse(JSON.stringify(serialize(w))), openMap(10, 10));
    expect(back.tutorial).toEqual({ step: 5, skipped: false, done: false, variant: 'b' });
    const old = serialize(new World(openMap(10, 10))) as unknown as { tutorial: Record<string, unknown> };
    delete old.tutorial.variant;
    expect(deserialize(JSON.parse(JSON.stringify(old)), openMap(10, 10)).tutorial).toEqual({ step: 0, skipped: false, done: false });
  });
});

describe('Diário depois de carregar', () => {
  it('carregar no meio de um minuto não cria amostra extra', () => {
    const w = new World(openMap(10, 10));
    for (let i = 0; i < 1805; i++) w.tick(0.1); // ~180,5 s: amostras em 60, 120, 180
    const back = deserialize(JSON.parse(JSON.stringify(serialize(w))), openMap(10, 10));
    for (let i = 0; i < 300; i++) back.tick(0.1);
    expect(back.diary.samples.map((s) => s.game)).toEqual([60, 120, 180]);
    for (let i = 0; i < 310; i++) back.tick(0.1);
    expect(back.diary.samples.at(-1)!.game).toBe(240);
  });
});
