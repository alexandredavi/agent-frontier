/**
 * Arte dos agentes em isométrico, desenhada em Canvas 2D (mesmo código do mockup V0).
 * É usada na abertura do jogo para gerar os quadros de animação como texturas.
 *
 * Convenções: (0,0) do canvas = centro do chão da área 2x2 do agente; luz de cima à esquerda.
 * Animações usam `tt` em [0, PERIOD) e só frequências múltiplas de 1/PERIOD, para o laço ser perfeito.
 */
import { TH, TW } from './projection';

export type ArtType =
  | 'extrator' | 'sensor' | 'cartografo' | 'analista' | 'derretedor' | 'eletrolisador' | 'fundidor' | 'prensa' | 'construtor' | 'verificador'
  | 'silo' | 'unificador' | 'divisor' | 'descarte' | 'plataforma' | 'painel_solar';

export const PERIOD = 3;
const TAU = Math.PI * 2;
/** Frequência angular com n voltas por período. */
const w = (n: number) => (TAU * n) / PERIOD;
/** Fase linear [0,1) com n voltas por período. */
const lin = (tt: number, n: number, off = 0) => (((tt * n) / PERIOD + off) % 1 + 1) % 1;

type Ctx = CanvasRenderingContext2D;
interface P { x: number; y: number }

export const CATEGORY_COLOR = { extracao: '#e0a53f', processamento: '#60a5fa', logistica: '#4fd1c5', energia: '#facc15' };
export const ART_COLOR: Record<ArtType, string> = {
  extrator: CATEGORY_COLOR.extracao, sensor: CATEGORY_COLOR.extracao,
  cartografo: CATEGORY_COLOR.processamento, analista: CATEGORY_COLOR.processamento, derretedor: CATEGORY_COLOR.processamento,
  eletrolisador: CATEGORY_COLOR.processamento, fundidor: CATEGORY_COLOR.processamento, prensa: CATEGORY_COLOR.processamento,
  construtor: CATEGORY_COLOR.processamento, verificador: '#86efac',
  silo: '#a78bfa', unificador: CATEGORY_COLOR.logistica, divisor: CATEGORY_COLOR.logistica, descarte: '#f87171',
  plataforma: '#fb923c', painel_solar: CATEGORY_COLOR.energia,
};
/** Altura visual aproximada (px acima do chão), usada para caixas de seleção e oclusão. */
export const ART_HEIGHT: Record<ArtType, number> = {
  extrator: 78, sensor: 70, cartografo: 62, analista: 60, derretedor: 66, eletrolisador: 66, fundidor: 58, prensa: 72,
  construtor: 70, verificador: 66, silo: 58, unificador: 26, divisor: 26, descarte: 28, plataforma: 16, painel_solar: 36,
};
/** Posição do núcleo (esfera de status) em relação ao centro do chão. */
export const CORE_OFFSET = { x: -33, y: -1 };

// ---------- utilidades ----------
export const iso = (gx: number, gy: number, z = 0): P => ({ x: ((gx - gy) * TW) / 2, y: ((gx + gy) * TH) / 2 - z });
const rx0 = (r: number) => ((r * TW) / 2) * 1.41;
export function hash(x: number, y: number, s = 0): number {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const k = (v: number) => Math.max(0, Math.min(255, Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f))));
  return `rgb(${k(n >> 16)},${k((n >> 8) & 255)},${k(n & 255)})`;
}
export function diamond(c: Ctx, x: number, y: number, dw: number, dh: number): void {
  c.beginPath();
  c.moveTo(x, y - dh / 2);
  c.lineTo(x + dw / 2, y);
  c.lineTo(x, y + dh / 2);
  c.lineTo(x - dw / 2, y);
  c.closePath();
}
export function glow(c: Ctx, x: number, y: number, r: number, col: string, a = 0.9): void {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, col);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  c.globalAlpha = a;
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fill();
  c.globalAlpha = 1;
}
function box(c: Ctx, gx: number, gy: number, sx: number, sy: number, z0: number, h: number, top: string) {
  const A = iso(gx - sx, gy - sy, z0 + h), B = iso(gx + sx, gy - sy, z0 + h), C = iso(gx + sx, gy + sy, z0 + h), D = iso(gx - sx, gy + sy, z0 + h);
  const Bb = iso(gx + sx, gy - sy, z0), Cb = iso(gx + sx, gy + sy, z0), Db = iso(gx - sx, gy + sy, z0);
  c.fillStyle = shade(top, -0.28);
  c.beginPath(); c.moveTo(D.x, D.y); c.lineTo(C.x, C.y); c.lineTo(Cb.x, Cb.y); c.lineTo(Db.x, Db.y); c.closePath(); c.fill();
  c.fillStyle = shade(top, -0.5);
  c.beginPath(); c.moveTo(C.x, C.y); c.lineTo(B.x, B.y); c.lineTo(Bb.x, Bb.y); c.lineTo(Cb.x, Cb.y); c.closePath(); c.fill();
  c.fillStyle = top;
  c.beginPath(); c.moveTo(A.x, A.y); c.lineTo(B.x, B.y); c.lineTo(C.x, C.y); c.lineTo(D.x, D.y); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.08)'; c.lineWidth = 1; c.stroke();
  return { A, B, C, D };
}
function sphere(c: Ctx, x: number, y: number, r: number, col: string) {
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, shade(col, 0.45)); g.addColorStop(0.55, col); g.addColorStop(1, shade(col, -0.55));
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
}
function rod(c: Ctx, p: P, q: P, lw: number, col: string, alpha = 1) {
  c.globalAlpha = alpha; c.lineCap = 'round';
  c.strokeStyle = shade(col, -0.45); c.lineWidth = lw; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(q.x, q.y); c.stroke();
  c.strokeStyle = col; c.lineWidth = Math.max(1, lw * 0.55); c.beginPath(); c.moveTo(p.x - lw * 0.12, p.y - lw * 0.12); c.lineTo(q.x - lw * 0.12, q.y - lw * 0.12); c.stroke();
  c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = Math.max(0.8, lw * 0.18); c.beginPath(); c.moveTo(p.x - lw * 0.25, p.y - lw * 0.25); c.lineTo(q.x - lw * 0.25, q.y - lw * 0.25); c.stroke();
  c.lineCap = 'butt'; c.globalAlpha = 1;
}
function frustum(c: Ctx, gx: number, gy: number, rb: number, rt: number, z0: number, h: number, col: string, topCol?: string): P {
  const b = iso(gx, gy, z0), t = iso(gx, gy, z0 + h);
  const RB = rx0(rb), RT = rx0(rt);
  const g = c.createLinearGradient(b.x - Math.max(RB, RT), 0, b.x + Math.max(RB, RT), 0);
  g.addColorStop(0, shade(col, 0.05)); g.addColorStop(0.45, shade(col, -0.3)); g.addColorStop(1, shade(col, -0.62));
  c.fillStyle = g;
  c.beginPath(); c.ellipse(b.x, b.y, RB, RB / 2, 0, 0, Math.PI); c.lineTo(t.x - RT, t.y);
  if (RT > 0.5) c.ellipse(t.x, t.y, RT, RT / 2, 0, Math.PI, 0, true); else c.lineTo(t.x, t.y);
  c.closePath(); c.fill();
  if (RT > 0.5) { c.fillStyle = topCol || shade(col, 0.15); c.beginPath(); c.ellipse(t.x, t.y, RT, RT / 2, 0, 0, TAU); c.fill(); }
  return t;
}
function dome(c: Ctx, gx: number, gy: number, r: number, z0: number, col: string) {
  const b = iso(gx, gy, z0), R = rx0(r);
  const g = c.createRadialGradient(b.x - R * 0.35, b.y - R * 0.7, R * 0.1, b.x, b.y - R * 0.2, R * 1.1);
  g.addColorStop(0, shade(col, 0.4)); g.addColorStop(0.6, col); g.addColorStop(1, shade(col, -0.55));
  c.fillStyle = g;
  c.beginPath(); c.ellipse(b.x, b.y, R, R / 2, 0, 0, Math.PI); c.ellipse(b.x, b.y, R, R * 0.95, 0, Math.PI, 0); c.closePath(); c.fill();
  return { x: b.x, y: b.y - R * 0.95, R };
}
function baseBody(c: Ctx, col: string, h = 10): number {
  const sh = iso(0.35, 0.35, 0);
  c.globalAlpha = 0.38; c.fillStyle = '#000'; c.beginPath(); c.ellipse(sh.x, sh.y, 62, 28, 0, 0, TAU); c.fill(); c.globalAlpha = 1;
  box(c, 0, 0, 0.94, 0.94, 0, 4, '#262c3a');
  box(c, 0, 0, 0.84, 0.84, 4, 2, '#1c212c');
  const r = box(c, 0, 0, 0.74, 0.74, 6, h, shade(col, -0.58));
  c.strokeStyle = col; c.lineWidth = 2;
  c.beginPath(); c.moveTo(r.D.x, r.D.y); c.lineTo(r.C.x, r.C.y); c.lineTo(r.B.x, r.B.y); c.stroke();
  return 6 + h;
}

const RES_COL: Record<string, string> = { regolito: '#d08c5b', gelo: '#9fe3ff', minerio: '#c3ccd9' };
const M = '#8b95a7';

/** Desenha um agente (sem o núcleo, que é uma peça separada colorida pelo estado). */
export function drawAgentArt(c: Ctx, t: ArtType, tt: number, res = 'regolito'): void {
  const col = ART_COLOR[t];
  const top = (h: number) => iso(0, 0, h);
  switch (t) {
    case 'extrator': {
      const z = baseBody(c, col, 8);
      const H = 56, s0 = 0.36, s1 = 0.2;
      const leg = (dx: number, dy: number): [P, P] => [iso(dx * s0, dy * s0, z), iso(dx * s1, dy * s1, z + H)];
      const L = { bl: leg(-1, -1), br: leg(1, -1), fl: leg(-1, 1), fr: leg(1, 1) };
      rod(c, L.bl[0], L.bl[1], 3.2, M); rod(c, L.br[0], L.br[1], 3.2, M);
      const bob = Math.sin(tt * w(2)) * 5;
      const shaftTop = top(z + H - 4), bitTop = top(z + 26 + bob), tip = top(z + 4 + bob);
      rod(c, shaftTop, bitTop, 4, '#b8c0cc');
      c.fillStyle = shade(col, -0.35); c.beginPath(); c.moveTo(bitTop.x, bitTop.y - 2); c.lineTo(bitTop.x + 9, bitTop.y); c.lineTo(tip.x, tip.y); c.closePath(); c.fill();
      c.fillStyle = col; c.beginPath(); c.moveTo(bitTop.x, bitTop.y - 2); c.lineTo(bitTop.x - 9, bitTop.y); c.lineTo(tip.x, tip.y); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 1.4;
      for (let k = 0; k < 4; k++) { const f = lin(tt, 5, k / 4); const y = bitTop.y + (tip.y - bitTop.y) * f, hw = 9 * (1 - f); c.beginPath(); c.moveTo(bitTop.x - hw, y); c.lineTo(bitTop.x + hw, y - 3); c.stroke(); }
      const dust = RES_COL[res] ?? RES_COL.regolito;
      for (let k = 0; k < 5; k++) { const f = lin(tt, 3, k / 5); c.globalAlpha = (1 - f) * 0.7; c.fillStyle = dust; c.beginPath(); c.arc(tip.x + Math.cos(k * 2.3) * (6 + f * 18), tip.y + 2 - f * 8, 1.5 + f * 2, 0, TAU); c.fill(); }
      c.globalAlpha = 1;
      for (const f of [0.35, 0.7]) {
        const lerp = (p: P, q: P): P => ({ x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f });
        rod(c, lerp(...L.fl), lerp(...L.fr), 1.6, M, 0.9); rod(c, lerp(...L.bl), lerp(...L.fl), 1.6, M, 0.9); rod(c, lerp(...L.br), lerp(...L.fr), 1.6, M, 0.9);
      }
      rod(c, L.fl[0], L.fl[1], 3.4, M); rod(c, L.fr[0], L.fr[1], 3.4, M);
      box(c, 0, 0, 0.24, 0.24, z + H - 2, 10, col);
      return;
    }
    case 'sensor': {
      const z = baseBody(c, col, 10);
      box(c, 0, 0, 0.3, 0.3, z, 5, '#3a4152');
      frustum(c, 0, 0, 0.1, 0.07, z + 5, 29, '#9aa4b5');
      const joint = top(z + 34);
      const sweep = Math.sin(tt * w(1)) * 0.5;
      const dc = { x: joint.x + Math.cos(sweep) * 6, y: joint.y - 12 };
      const rX = 30, rY = 17, ang = -0.55 + sweep * 0.4;
      c.fillStyle = shade(col, -0.45); c.beginPath(); c.ellipse(dc.x + 2, dc.y + 2, rX, rY, ang, 0, TAU); c.fill();
      const g = c.createRadialGradient(dc.x - 6, dc.y - 4, 2, dc.x, dc.y, rX);
      g.addColorStop(0, shade(col, 0.5)); g.addColorStop(0.7, shade(col, 0.05)); g.addColorStop(1, shade(col, -0.25));
      c.fillStyle = g; c.beginPath(); c.ellipse(dc.x, dc.y, rX - 2, rY - 2, ang, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1; c.beginPath(); c.ellipse(dc.x, dc.y, rX * 0.55, rY * 0.55, ang, 0, TAU); c.stroke();
      sphere(c, joint.x, joint.y, 5, '#b8c0cc');
      rod(c, joint, dc, 3, '#9aa4b5');
      const focus = { x: dc.x - 14 * Math.cos(ang + 1.2), y: dc.y - 18 };
      rod(c, dc, focus, 1.8, '#c8d0dc');
      sphere(c, focus.x, focus.y, 3.2, '#f472b6');
      c.strokeStyle = 'rgba(244,114,182,0.75)'; c.lineWidth = 1.6;
      for (let k = 0; k < 3; k++) { const r = lin(tt, 2, k / 3) * 33; c.globalAlpha = 1 - r / 33; c.beginPath(); c.arc(focus.x, focus.y, 5 + r, -2.3, -0.8); c.stroke(); }
      c.globalAlpha = 1;
      return;
    }
    case 'cartografo': {
      const z = baseBody(c, col, 10);
      frustum(c, 0, 0, 0.64, 0.62, z, 8, '#343b4c', '#2a3040');
      const d = dome(c, 0, 0, 0.58, z + 8, '#c9d2de');
      const th = tt * w(1);
      const sx = Math.sin(th);
      if (Math.cos(th) > -0.2) {
        const b = iso(0, 0, z + 8);
        c.fillStyle = '#0d1420';
        const x = b.x + sx * d.R * 0.7, sw = 7 * Math.max(0.3, Math.cos(th));
        c.beginPath(); c.moveTo(x - sw, b.y + 2); c.quadraticCurveTo(x - sw * 0.6, d.y + 8, b.x + sx * 4, d.y + 2); c.quadraticCurveTo(x + sw * 0.6, d.y + 8, x + sw, b.y + 2); c.closePath(); c.fill();
        const bob = Math.sin(tt * w(2)) * 3;
        const hx = x * 0.6 + b.x * 0.4, hy = d.y - 16 + bob;
        glow(c, hx, hy, 22, 'rgba(253,230,138,0.7)', 0.6);
        c.fillStyle = 'rgba(253,230,138,0.85)'; diamond(c, hx, hy, 26, 13); c.fill();
        c.strokeStyle = 'rgba(160,110,30,0.8)'; c.lineWidth = 1; c.beginPath(); c.moveTo(hx - 8, hy - 2); c.lineTo(hx - 1, hy + 2); c.lineTo(hx + 7, hy - 1); c.stroke();
        c.fillStyle = '#ef4444'; c.beginPath(); c.arc(hx + 4, hy - 2, 1.8, 0, TAU); c.fill();
        c.strokeStyle = 'rgba(253,230,138,0.35)'; c.beginPath(); c.moveTo(x, b.y); c.lineTo(hx, hy); c.stroke();
      }
      return;
    }
    case 'analista': {
      const z = baseBody(c, col, 10);
      box(c, 0.15, -0.35, 0.34, 0.14, z, 6, '#3a4152');
      const tubes = [-0.3, 0, 0.3].map((d, i) => ({ gx: 0.15 + d, gy: -0.35, i }));
      for (const tb of tubes) {
        const b = iso(tb.gx, tb.gy, z + 6), tp = iso(tb.gx, tb.gy, z + 36);
        c.fillStyle = 'rgba(192,132,252,0.75)'; c.fillRect(b.x - 4, b.y - 16, 8, 16);
        c.beginPath(); c.ellipse(b.x, b.y, 4, 2, 0, 0, TAU); c.fill();
        c.fillStyle = 'rgba(220,235,255,0.18)'; c.fillRect(tp.x - 4, tp.y, 8, b.y - tp.y);
        c.strokeStyle = 'rgba(220,235,255,0.6)'; c.lineWidth = 1; c.strokeRect(tp.x - 4, tp.y, 8, b.y - tp.y);
        for (let k = 0; k < 2; k++) { const f = lin(tt, 3, k / 2 + tb.i * 0.3); c.fillStyle = 'rgba(255,255,255,0.8)'; c.beginPath(); c.arc(b.x + Math.sin(f * 9) * 1.5, b.y - 2 - f * 14, 1.1, 0, TAU); c.fill(); }
      }
      const base = iso(-0.45, 0.25, z);
      sphere(c, base.x, base.y - 3, 6, '#9aa4b5');
      const k = (Math.sin(tt * w(1)) + 1) / 2;
      const target = tubes[Math.round(k * 2)];
      const head = iso(target.gx - 0.05, target.gy + 0.25, z + 46);
      const j1 = { x: base.x - 4, y: base.y - 38 };
      rod(c, { x: base.x, y: base.y - 4 }, j1, 4.2, '#9aa4b5');
      sphere(c, j1.x, j1.y, 4.5, '#b8c0cc');
      rod(c, j1, head, 3.6, '#9aa4b5');
      box(c, target.gx - 0.05, target.gy + 0.25, 0.1, 0.1, z + 38, 10, col);
      const lens = iso(target.gx - 0.05, target.gy + 0.25, z + 36);
      rod(c, { x: lens.x, y: lens.y - 2 }, { x: lens.x, y: lens.y + 6 }, 4, '#2b3342');
      glow(c, lens.x, lens.y + 8, 8, 'rgba(192,132,252,0.9)', 0.6);
      return;
    }
    case 'derretedor': {
      const z = baseBody(c, col, 6);
      for (const [dx, dy] of [[-0.3, 0.3], [0.3, -0.3], [0.3, 0.3]]) rod(c, iso(dx, dy, z), iso(dx * 0.9, dy * 0.9, z + 8), 3, M);
      const ch = frustum(c, 0.28, -0.28, 0.1, 0.09, z + 30, 26, '#6b7385', '#1a1d24');
      for (let k = 0; k < 4; k++) { const f = lin(tt, 2, k / 4); c.globalAlpha = (1 - f) * 0.55; c.fillStyle = '#e5edf7'; c.beginPath(); c.arc(ch.x + Math.sin(f * 5 + k) * 6, ch.y - 4 - f * 34, 3 + f * 7, 0, TAU); c.fill(); }
      c.globalAlpha = 1;
      const tp = frustum(c, 0, 0, 0.5, 0.5, z + 8, 30, '#a3adbd');
      c.globalAlpha = 0.55; c.strokeStyle = '#2b3140'; c.lineWidth = 2;
      for (const f of [0.25, 0.75]) { const m = iso(0, 0, z + 8 + 30 * f); c.beginPath(); c.ellipse(m.x, m.y, rx0(0.5), rx0(0.5) / 2, 0, 0, Math.PI); c.stroke(); }
      c.globalAlpha = 1;
      const wn = iso(-0.05, 0.5, z + 18);
      const fl = 0.6 + 0.4 * Math.sin(tt * w(11)) * Math.sin(tt * w(7));
      c.fillStyle = '#1a1d24'; c.beginPath(); c.ellipse(wn.x - 8, wn.y, 9, 7, 0, 0, TAU); c.fill();
      const fg = c.createRadialGradient(wn.x - 8, wn.y + 2, 1, wn.x - 8, wn.y, 8);
      fg.addColorStop(0, '#fff3c4'); fg.addColorStop(0.4, '#fb923c'); fg.addColorStop(1, '#7c2d12');
      c.fillStyle = fg; c.beginPath(); c.ellipse(wn.x - 8, wn.y, 7, 5.5, 0, 0, TAU); c.fill();
      glow(c, wn.x - 8, wn.y, 22, 'rgba(251,146,60,0.9)', 0.45 * fl);
      sphere(c, tp.x, tp.y, 4, '#c8d0dc');
      return;
    }
    case 'eletrolisador': {
      const z = baseBody(c, col, 8);
      const cols: [number, number][] = [[0.05, -0.4], [-0.4, 0.05]];
      const tops: P[] = [];
      for (const [cx, cy] of cols) {
        frustum(c, cx, cy, 0.2, 0.2, z, 5, '#4b5364');
        const b = iso(cx, cy, z + 5), tp = iso(cx, cy, z + 45), R = rx0(0.17);
        c.fillStyle = 'rgba(59,130,246,0.35)'; c.fillRect(b.x - R, tp.y, R * 2, b.y - tp.y);
        c.fillStyle = 'rgba(147,197,253,0.25)'; c.fillRect(b.x - R, tp.y, R * 0.6, b.y - tp.y);
        c.strokeStyle = 'rgba(200,225,255,0.55)'; c.lineWidth = 1; c.strokeRect(b.x - R, tp.y, R * 2, b.y - tp.y);
        c.strokeStyle = '#cbd5e1'; c.lineWidth = 2; c.beginPath(); c.moveTo(b.x, b.y - 2); c.lineTo(b.x, tp.y + 6); c.stroke();
        for (let k = 0; k < 4; k++) { const f = lin(tt, 2, k / 4 + cx); c.fillStyle = 'rgba(255,255,255,0.85)'; c.beginPath(); c.arc(b.x + Math.sin(f * 11 + k) * (R - 3), b.y - 4 - f * (b.y - tp.y - 8), 1.4, 0, TAU); c.fill(); }
        tops.push(frustum(c, cx, cy, 0.2, 0.2, z + 45, 5, '#6b7385'));
      }
      c.strokeStyle = '#1f2937'; c.lineWidth = 3;
      const mid = { x: (tops[0].x + tops[1].x) / 2, y: Math.min(tops[0].y, tops[1].y) - 18 };
      c.beginPath(); c.moveTo(tops[0].x, tops[0].y); c.quadraticCurveTo(mid.x, mid.y, tops[1].x, tops[1].y); c.stroke();
      const frame = Math.floor(lin(tt, 1) * 24);
      if (frame % 6 < 2) {
        c.strokeStyle = '#a5f3fc'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(tops[0].x, tops[0].y - 3);
        for (let k = 1; k <= 5; k++) { const f = k / 6; c.lineTo(tops[0].x + (tops[1].x - tops[0].x) * f + (hash(k, frame) - 0.5) * 8, tops[0].y - 3 + (tops[1].y - tops[0].y) * f - Math.sin(f * Math.PI) * 14); }
        c.lineTo(tops[1].x, tops[1].y - 3); c.stroke();
        glow(c, mid.x, mid.y + 6, 20, 'rgba(165,243,252,0.9)', 0.6);
      }
      return;
    }
    case 'fundidor': {
      const z = baseBody(c, col, 8);
      rod(c, iso(-0.5, -0.1, z), iso(-0.42, -0.1, z + 26), 4, M);
      rod(c, iso(-0.1, -0.5, z), iso(-0.1, -0.42, z + 26), 4, M);
      box(c, 0.45, 0.3, 0.16, 0.16, z, 5, '#3a4152');
      const tp = frustum(c, -0.1, -0.1, 0.32, 0.52, z + 6, 30, '#7c6f64', '#2a1a12');
      const pulse = 0.75 + 0.25 * Math.sin(tt * w(2));
      const mg = c.createRadialGradient(tp.x, tp.y, 1, tp.x, tp.y, rx0(0.46));
      mg.addColorStop(0, '#fff7cc'); mg.addColorStop(0.35, '#fdba74'); mg.addColorStop(1, '#c2410c');
      c.fillStyle = mg; c.beginPath(); c.ellipse(tp.x, tp.y, rx0(0.46), rx0(0.46) / 2, 0, 0, TAU); c.fill();
      glow(c, tp.x, tp.y - 6, 40, 'rgba(251,146,60,0.9)', 0.45 * pulse);
      const sp0 = iso(0.25, 0.1, z + 34), sp1 = iso(0.45, 0.3, z + 26);
      rod(c, sp0, sp1, 5, '#7c6f64');
      const f = lin(tt, 3), mold = iso(0.45, 0.3, z + 5);
      c.fillStyle = '#fdba74'; c.beginPath(); c.arc(sp1.x, sp1.y + (mold.y - sp1.y) * f, 2.4, 0, TAU); c.fill();
      glow(c, mold.x, mold.y - 2, 10, 'rgba(251,146,60,0.9)', 0.5);
      return;
    }
    case 'prensa': {
      const z = baseBody(c, col, 8);
      box(c, 0, 0, 0.34, 0.34, z, 6, '#4b5364');
      const plate = iso(0, 0, z + 6);
      c.fillStyle = '#e2b36a'; diamond(c, plate.x, plate.y, 30, 15); c.fill();
      const H = 58;
      const pl: [number, number] = [-0.5, 0.05], pr: [number, number] = [0.05, -0.5];
      box(c, pr[0], pr[1], 0.12, 0.12, z, H, '#5b6474');
      const ph = lin(tt, 2);
      const drop = ph < 0.18 ? ph / 0.18 : 1 - (ph - 0.18) / 0.82;
      const hz = z + 8 + (1 - drop) * 26;
      rod(c, iso(-0.12, -0.12, z + H - 4), iso(-0.12, -0.12, hz + 12), 5, '#cbd5e1');
      rod(c, iso(0.12, 0.12, z + H - 4), iso(0.12, 0.12, hz + 12), 5, '#cbd5e1');
      box(c, 0, 0, 0.3, 0.3, hz, 12, col);
      if (ph < 0.24 && ph > 0.14) glow(c, plate.x, plate.y, 30, 'rgba(255,240,200,0.9)', 0.7);
      box(c, pl[0], pl[1], 0.12, 0.12, z, H, '#5b6474');
      rod(c, iso(pl[0], pl[1], z + H + 3), iso(pr[0], pr[1], z + H + 3), 9, '#6b7385');
      return;
    }
    case 'construtor': {
      const z = baseBody(c, col, 8);
      const mg: [number, number] = [0.38, 0.3];
      box(c, mg[0], mg[1], 0.2, 0.2, z, 10, '#1f5f47');
      const mt = iso(mg[0], mg[1], z + 10);
      c.globalAlpha = 0.5 + 0.5 * Math.sin(tt * w(4)); c.fillStyle = '#34d399'; diamond(c, mt.x, mt.y, 22, 11); c.fill(); c.globalAlpha = 1;
      const tz = frustum(c, -0.25, -0.25, 0.28, 0.24, z, 10, '#4b5364');
      const phi = Math.sin(tt * w(1)) * 0.9 + 0.8;
      const j0 = { x: tz.x, y: tz.y - 2 };
      const j1 = iso(-0.25 + Math.cos(phi) * 0.15, -0.25 + Math.sin(phi) * 0.15, z + 50);
      const tip = iso(mg[0] + Math.cos(tt * w(1)) * 0.06, mg[1], z + 24 + Math.sin(tt * w(2)) * 4);
      rod(c, j0, j1, 7, col);
      sphere(c, j0.x, j0.y, 6, '#9aa4b5');
      sphere(c, j1.x, j1.y, 5.5, '#9aa4b5');
      rod(c, j1, tip, 5.5, col);
      const open = 3 + Math.sin(tt * w(3)) * 2;
      rod(c, tip, { x: tip.x - open, y: tip.y + 9 }, 2.4, '#cbd5e1');
      rod(c, tip, { x: tip.x + open, y: tip.y + 9 }, 2.4, '#cbd5e1');
      sphere(c, tip.x, tip.y, 3.6, '#b8c0cc');
      return;
    }
    case 'verificador': {
      const z = baseBody(c, col, 8);
      const H = 52;
      const L: [number, number] = [-0.52, 0.08], R: [number, number] = [0.08, -0.52];
      box(c, R[0], R[1], 0.11, 0.11, z, H, '#3b4556');
      const lt = iso(L[0], L[1], z + H), rt = iso(R[0], R[1], z + H);
      const s = (Math.sin(tt * w(2)) + 1) / 2;
      const caught = lin(tt, 1) > 0.8;
      const bc = caught ? '248,113,113' : '134,239,172';
      const bz = z + 6 + s * (H - 10);
      const bl = iso(L[0], L[1], bz), br = iso(R[0], R[1], bz);
      const g = c.createLinearGradient(0, bl.y - 12, 0, bl.y + 12);
      g.addColorStop(0, `rgba(${bc},0)`); g.addColorStop(0.5, `rgba(${bc},0.45)`); g.addColorStop(1, `rgba(${bc},0)`);
      c.fillStyle = g; c.beginPath(); c.moveTo(bl.x, bl.y - 12); c.lineTo(br.x, br.y - 12); c.lineTo(br.x, br.y + 12); c.lineTo(bl.x, bl.y + 12); c.fill();
      c.strokeStyle = `rgba(${bc},0.95)`; c.lineWidth = 1.6; c.beginPath(); c.moveTo(bl.x, bl.y); c.lineTo(br.x, br.y); c.stroke();
      box(c, L[0], L[1], 0.11, 0.11, z, H, '#3b4556');
      c.strokeStyle = '#5b6678'; c.lineWidth = 7; c.lineCap = 'round';
      const apex = { x: (lt.x + rt.x) / 2, y: Math.min(lt.y, rt.y) - 16 };
      c.beginPath(); c.moveTo(lt.x, lt.y); c.quadraticCurveTo(apex.x, apex.y - 8, rt.x, rt.y); c.stroke();
      c.strokeStyle = col; c.lineWidth = 2; c.beginPath(); c.moveTo(lt.x, lt.y - 2); c.quadraticCurveTo(apex.x, apex.y - 10, rt.x, rt.y - 2); c.stroke();
      c.lineCap = 'butt';
      sphere(c, apex.x, apex.y + 2, 7, '#1f2937');
      glow(c, apex.x, apex.y + 4, 14, `rgba(${bc},0.9)`, 0.8);
      sphere(c, apex.x, apex.y + 4, 3.5, caught ? '#f87171' : '#86efac');
      return;
    }
    case 'silo': {
      const z = baseBody(c, col, 4);
      frustum(c, 0, 0, 0.6, 0.6, z, 44, col);
      c.globalAlpha = 0.5; c.strokeStyle = '#1a1d24'; c.lineWidth = 2;
      for (const f of [0.3, 0.62]) { const m = iso(0, 0, z + 44 * f); c.beginPath(); c.ellipse(m.x, m.y, rx0(0.6), rx0(0.6) / 2, 0, 0, Math.PI); c.stroke(); }
      c.globalAlpha = 1;
      dome(c, 0, 0, 0.6, z + 44, shade(col, 0.2));
      const l0 = iso(-0.1, 0.6, z), l1 = iso(-0.1, 0.6, z + 44);
      c.strokeStyle = 'rgba(20,20,30,0.7)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(l0.x - 12, l0.y); c.lineTo(l1.x - 12, l1.y); c.moveTo(l0.x - 6, l0.y); c.lineTo(l1.x - 6, l1.y); c.stroke();
      for (let k = 0; k < 8; k++) { const y = l0.y + (l1.y - l0.y) * (k / 8); c.beginPath(); c.moveTo(l0.x - 12, y); c.lineTo(l0.x - 6, y); c.stroke(); }
      return;
    }
    case 'unificador':
    case 'divisor': {
      const z = baseBody(c, col, 8);
      const hub = frustum(c, 0, 0, 0.3, 0.22, z, 12, '#4b5364');
      const pts = t === 'unificador' ? [[-0.6, 0.1], [-0.6, -0.3], [0.1, -0.6]] : [[0.6, -0.1], [0.6, 0.3], [-0.1, 0.6]];
      for (const [dx, dy] of pts) { const p = iso(dx, dy, z + 6); rod(c, p, iso(0, 0, z + 6), 5, col); sphere(c, p.x, p.y, 4, shade(col, -0.2)); }
      glow(c, hub.x, hub.y, 12, col, 0.5);
      return;
    }
    case 'descarte': {
      const z = baseBody(c, col, 6);
      const tp = frustum(c, 0, 0, 0.5, 0.44, z, 14, '#3b3f4d', '#14161c');
      c.strokeStyle = 'rgba(248,113,113,0.8)'; c.lineWidth = 1.2;
      for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(tp.x - rx0(0.36) + 4, tp.y + k * 3); c.lineTo(tp.x + rx0(0.36) - 4, tp.y + k * 3); c.stroke(); }
      glow(c, tp.x, tp.y, 22, 'rgba(248,113,113,0.8)', 0.35 + 0.25 * Math.sin(tt * w(4)));
      return;
    }
    case 'plataforma': {
      const z = baseBody(c, '#fb923c', 4);
      const tp = frustum(c, 0, 0, 0.8, 0.78, z, 6, '#3b3f4d', '#2a2d38');
      c.strokeStyle = '#fb923c'; c.lineWidth = 2;
      c.beginPath(); c.ellipse(tp.x, tp.y, rx0(0.6), rx0(0.6) / 2, 0, 0, TAU); c.stroke();
      c.setLineDash([6, 6]); c.lineDashOffset = -lin(tt, 1) * 60; c.beginPath(); c.ellipse(tp.x, tp.y, rx0(0.38), rx0(0.38) / 2, 0, 0, TAU); c.stroke(); c.setLineDash([]);
      for (const [dx, dy] of [[-0.62, 0], [0, -0.62], [0.62, 0], [0, 0.62]]) { const p = iso(dx, dy, z + 6); rod(c, p, { x: p.x, y: p.y - 12 }, 2.4, '#6b7385'); sphere(c, p.x, p.y - 13, 2.6, '#fb923c'); }
      return;
    }
    case 'painel_solar': {
      const z = baseBody(c, col, 4);
      frustum(c, 0, 0, 0.1, 0.08, z, 16, '#6b7385');
      const A = iso(-0.88, -0.72, z + 34), B = iso(0.72, -0.88, z + 34), C = iso(0.88, 0.72, z + 14), D = iso(-0.72, 0.88, z + 14);
      c.fillStyle = '#10182a'; c.beginPath(); c.moveTo(A.x, A.y + 3); c.lineTo(B.x, B.y + 3); c.lineTo(C.x, C.y + 3); c.lineTo(D.x, D.y + 3); c.closePath(); c.fill();
      const g = c.createLinearGradient(A.x, A.y, C.x, C.y); g.addColorStop(0, '#2f5590'); g.addColorStop(0.5, '#213d66'); g.addColorStop(1, '#172b49');
      c.fillStyle = g; c.beginPath(); c.moveTo(A.x, A.y); c.lineTo(B.x, B.y); c.lineTo(C.x, C.y); c.lineTo(D.x, D.y); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(250,204,21,0.6)'; c.lineWidth = 1.2; c.stroke();
      c.strokeStyle = 'rgba(160,200,255,0.25)'; c.lineWidth = 1;
      for (let k = 1; k < 4; k++) {
        const f = k / 4;
        c.beginPath(); c.moveTo(A.x + (D.x - A.x) * f, A.y + (D.y - A.y) * f); c.lineTo(B.x + (C.x - B.x) * f, B.y + (C.y - B.y) * f); c.stroke();
        c.beginPath(); c.moveTo(A.x + (B.x - A.x) * f, A.y + (B.y - A.y) * f); c.lineTo(D.x + (C.x - D.x) * f, D.y + (C.y - D.y) * f); c.stroke();
      }
      const sheen = (Math.sin(tt * w(1)) + 1) / 2;
      glow(c, A.x + (C.x - A.x) * sheen, A.y + (C.y - A.y) * sheen, 18, 'rgba(255,255,255,0.35)', 0.5);
      return;
    }
  }
}

/** Esfera do núcleo em branco (é colorida pelo estado com tint). `adv` = maior e mais brilhante. */
export function drawCoreArt(c: Ctx, adv: boolean): void {
  const r = adv ? 6 : 3.6;
  glow(c, 0, 0, adv ? 26 : 16, 'rgba(255,255,255,0.9)', adv ? 0.75 : 0.55);
  const g = c.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, '#e5e5e5'); g.addColorStop(1, '#8a8a8a');
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();
}

/** Anel do Núcleo Avançado (elipse), girado pelo jogo. */
export function drawRingArt(c: Ctx): void {
  c.strokeStyle = 'rgba(255,255,255,0.9)';
  c.lineWidth = 1.4;
  c.beginPath(); c.ellipse(0, 0, 10, 3.5, 0, 0, TAU); c.stroke();
}
