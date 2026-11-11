/**
 * Jogadores automáticos para os testes de regressão de balanceamento.
 * Jogam no mapa real de Kora-4 usando só a API pública do World (a mesma que a interface usa).
 * Não é importado pelo jogo.
 */
import { LINK } from '../defs';
import { GameMap } from '../map';
import { LANDING_POINT, MAP_ROWS } from '../mapData';
import type { Agent, AgentType, Item, ResourceId } from '../types';
import { World, agentCenter } from '../world';

export const KORA4 = GameMap.fromAscii(MAP_ROWS);

export function newWorld(seed: number): World {
  const w = new World(KORA4);
  w.rng.state = seed | 0;
  return w;
}

/** Avança em passos de 0,1 s (o passo fixo do jogo) até `seconds` ou até `stop()`. */
export function run(w: World, seconds: number, stop?: () => boolean): void {
  const n = Math.round(seconds / 0.1);
  for (let i = 0; i < n; i++) {
    w.tick(0.1);
    if (stop?.()) return;
  }
}

interface PlaceOpts {
  near?: Agent[];
  res?: ResourceId;
  designId?: string;
}

/** Constrói no lugar válido mais próximo de (tx, ty), no alcance de conexão de `near`. */
export function placeNear(w: World, type: AgentType, tx: number, ty: number, opts: PlaceOpts = {}): Agent {
  for (let r = 0; r < 40; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = tx + dx;
        const y = ty + dy;
        const c = w.canPlace(type, x, y);
        if (!c.ok || (opts.res && c.resource !== opts.res)) continue;
        const me = agentCenter({ x, y });
        const inRange = (opts.near ?? []).every((o) => {
          const p = agentCenter(o);
          return Math.hypot(p.x - me.x, p.y - me.y) <= LINK.range;
        });
        if (!inRange) continue;
        const placed = w.place(type, x, y, opts.designId);
        if (placed.ok) return placed.agent;
      }
    }
  }
  throw new Error(`sem lugar para ${type} perto de ${tx},${ty}`);
}

export function link(w: World, a: Agent, b: Agent): void {
  const r = w.connect(a.id, b.id);
  if (!r.ok) throw new Error(`conectar ${a.type}#${a.id} → ${b.type}#${b.id}: ${r.reason}`);
}

/** Liga `a` a `b`, pondo Silos no caminho quando a distância passa do alcance. */
function chain(w: World, a: Agent, b: Agent): void {
  const pa = agentCenter(a);
  const pb = agentCenter(b);
  if (Math.hypot(pb.x - pa.x, pb.y - pa.y) <= LINK.range) return link(w, a, b);
  const mid = placeNear(w, 'silo', Math.round((pa.x + pb.x) / 2 - 1), Math.round((pa.y + pb.y) / 2 - 1), { near: [a] });
  link(w, a, mid);
  chain(w, mid, b);
}

/** Conta entregas à Arca por fase (arca.rejected zera quando a fase muda). */
export function trackArca(w: World): { good: number[]; bad: number[] } {
  const t = { good: [0, 0], bad: [0, 0] };
  const inner = w as unknown as { deliver: (item: Item) => void };
  const orig = inner.deliver.bind(w);
  inner.deliver = (item: Item) => {
    const { phase, surplus, done } = w.arca;
    orig(item);
    if (done || (w.arca.phase === phase && w.arca.surplus > surplus)) return;
    (item.bad ? t.bad : t.good)[phase]++;
  };
  return t;
}

/** Só o que o tutorial da MERIDIAN pede: 1 Sensor → 1 Cartógrafo → 1 Plataforma, sem energia extra. */
export function buildNovato(w: World): void {
  const L = LANDING_POINT;
  const s = placeNear(w, 'sensor', L.x, L.y);
  const c = placeNear(w, 'cartografo', L.x + 3, L.y, { near: [s] });
  link(w, s, c);
  const p = placeNear(w, 'plataforma', L.x + 6, L.y, { near: [c] });
  link(w, c, p);
}

/** `lines` linhas Sensor → Cartógrafo numa Plataforma e `solar` Painéis Solares. */
export function buildFase0(w: World, lines: number, solar: number): void {
  const L = LANDING_POINT;
  const p = placeNear(w, 'plataforma', L.x, L.y);
  for (let i = 0; i < lines; i++) {
    const ang = (i / lines) * Math.PI * 2;
    const c = placeNear(w, 'cartografo', Math.round(L.x + Math.cos(ang) * 5), Math.round(L.y + Math.sin(ang) * 5), { near: [p] });
    const s = placeNear(w, 'sensor', Math.round(L.x + Math.cos(ang) * 9), Math.round(L.y + Math.sin(ang) * 9), { near: [c] });
    link(w, s, c);
    link(w, c, p);
  }
  for (let i = 0; i < solar; i++) placeNear(w, 'painel_solar', L.x - 10, L.y - 8 + i * 2);
}

/**
 * Fábrica de Módulos (Tier 1): Minério→Fundidor→Prensa (+Regolito), Gelo→Derretedor→Eletrolisador (+Analista←Sensor),
 * Construtor → Plataforma. Com `verifiers`, Painéis e O₂ passam por Verificadores (rejeitos → Descarte).
 */
export function buildFase1(w: World, verifiers: boolean): void {
  const exM = placeNear(w, 'extrator', 48, 17, { res: 'minerio' });
  const fund = placeNear(w, 'fundidor', 46, 20, { near: [exM] });
  link(w, exM, fund);
  const cons = placeNear(w, 'construtor', 42, 21);
  const prensa = placeNear(w, 'prensa', 44, 22, { near: [fund, cons] });
  link(w, fund, prensa);
  chain(w, placeNear(w, 'extrator', 22, 17, { res: 'regolito' }), prensa);
  const exG = placeNear(w, 'extrator', 39, 19, { res: 'gelo' });
  const der = placeNear(w, 'derretedor', 38, 22, { near: [exG] });
  link(w, exG, der);
  const ele = placeNear(w, 'eletrolisador', 40, 24, { near: [der, cons] });
  link(w, der, ele);
  const ana = placeNear(w, 'analista', 36, 26, { near: [ele] });
  link(w, ana, ele);
  link(w, placeNear(w, 'sensor', 34, 28, { near: [ana] }), ana);
  for (const src of [prensa, ele]) {
    if (!verifiers) {
      link(w, src, cons);
      continue;
    }
    const v = placeNear(w, 'verificador', src.x + 1, src.y - 2, { near: [src, cons] });
    const d = placeNear(w, 'descarte', v.x + 2, v.y - 2, { near: [v] });
    link(w, src, v);
    link(w, v, cons);
    link(w, v, d);
  }
  link(w, cons, placeNear(w, 'plataforma', 42, 25, { near: [cons] }));
  // Energia: Painéis Solares até cobrir o consumo de todos trabalhando
  let demand = 0;
  for (const a of w.agents.values()) if (a.designId) demand += w.agentPower(a);
  const solar = Math.ceil(Math.max(0, demand - w.powerSupply()) / 20);
  for (let i = 0; i < solar; i++) placeNear(w, 'painel_solar', 12, 22 + i * 2);
}

export const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
