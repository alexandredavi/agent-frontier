import { describe, expect, it } from 'vitest';
import { AGENT_DEFS, INPUT_CYCLES, LINK } from '../defs';
import { Rng } from '../rng';
import { deserialize, serialize } from '../save';
import type { AgentType, ResourceId } from '../types';
import type { World } from '../world';
import { KORA4, buildFase0, newWorld, run } from './bots';

const TYPES = Object.keys(AGENT_DEFS) as AgentType[];

/** Invariantes que nenhuma sequência de ações do jogador pode quebrar. Retorna a lista de violações. */
function violations(w: World): string[] {
  const out: string[] = [];
  const cells = new Map<number, number>();
  for (let y = 0; y < KORA4.height; y++)
    for (let x = 0; x < KORA4.width; x++) {
      const a = w.agentAt(x, y);
      if (a) cells.set(a.id, (cells.get(a.id) ?? 0) + 1);
    }
  for (const a of w.agents.values()) {
    const def = AGENT_DEFS[a.type];
    if (cells.get(a.id) !== 4) out.push(`${a.type}#${a.id} ocupa ${cells.get(a.id) ?? 0} células`);
    if (!Number.isFinite(a.progress) || a.progress < -1e-9 || a.progress > 1 + 1e-6) out.push(`${a.type}#${a.id} progresso ${a.progress}`);
    const held = a.type === 'verificador' ? a.buffer.length + a.rejects.length : a.buffer.length;
    if (held > def.capacity) out.push(`${a.type}#${a.id} guarda ${held}/${def.capacity}`);
    for (const [k, n] of Object.entries(def.recipe?.inputs ?? {})) {
      const have = a.inputs[k as ResourceId] ?? 0;
      if (have < 0 || have > n! * INPUT_CYCLES) out.push(`${a.type}#${a.id} ${k}=${have}`);
      if ((a.badInputs[k as ResourceId] ?? 0) > have) out.push(`${a.type}#${a.id} defeituosos > ingredientes`);
    }
    if (w.outputsOf(a.id).length > def.maxOut || w.inputsOf(a.id).length > def.maxIn) out.push(`${a.type}#${a.id} conexões acima do limite`);
  }
  for (const c of w.connections.values()) {
    if (!w.agents.has(c.from) || !w.agents.has(c.to)) out.push(`conexão ${c.id} órfã`);
    c.items.forEach((it, i) => {
      if (it.pos < -1e-6 || it.pos > c.length + 1e-6) out.push(`item fora da linha ${c.id}`);
      if (i > 0 && c.items[i - 1].pos - it.pos < LINK.gap - 1e-6) out.push(`itens sobrepostos na linha ${c.id}`);
    });
  }
  if (!(w.power.factor >= 0 && w.power.factor <= 1)) out.push(`energia ${w.power.factor}`);
  return out;
}

describe('fuzzer · ações aleatórias do jogador', () => {
  it('construir, ligar, mover, demolir e salvar/carregar à toa não quebra o estado', () => {
    const R = new Rng(424242);
    const found = new Set<string>();
    for (let game = 0; game < 6; game++) {
      let w = newWorld(game + 1);
      if (game % 2) w.tier = 1;
      for (let step = 0; step < 1500; step++) {
        const r = R.next();
        const ids = [...w.agents.keys()];
        const pick = () => ids[Math.floor(R.next() * ids.length)];
        if (r < 0.35) w.place(TYPES[Math.floor(R.next() * TYPES.length)], Math.floor(R.next() * KORA4.width), Math.floor(R.next() * KORA4.height));
        else if (r < 0.6 && ids.length > 1) w.connect(pick(), pick());
        else if (r < 0.66 && ids.length) w.move(pick(), Math.floor(R.next() * KORA4.width), Math.floor(R.next() * KORA4.height));
        else if (r < 0.7 && ids.length) w.remove(pick());
        else if (r < 0.72 && w.connections.size) w.disconnect([...w.connections.keys()][0]);
        else if (r < 0.73) w = deserialize(JSON.parse(JSON.stringify(serialize(w))), KORA4);
        else for (let k = 0; k < 10; k++) w.tick(0.1);
        for (const v of violations(w)) if (found.size < 10) found.add(`jogo ${game}, passo ${step}: ${v}`);
      }
    }
    expect([...found]).toEqual([]);
  });

  it('salvar e carregar no meio não muda o resultado (determinismo)', () => {
    const a = newWorld(77);
    buildFase0(a, 3, 1);
    run(a, 300);
    const snap = JSON.parse(JSON.stringify(serialize(a)));
    run(a, 300);
    const b = deserialize(snap, KORA4);
    run(b, 300);
    const sig = (w: World) => [...w.agents.values()].map((x) => `${x.type}:${x.produced}:${x.defects}:${x.buffer.length}`).join('|');
    expect(sig(b)).toBe(sig(a));
    expect(b.arca).toEqual(a.arca);
  });
});
