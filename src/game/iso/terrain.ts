/**
 * Terreno isométrico pré-renderizado num canvas (uma textura só para o mapa inteiro).
 * O relevo é só visual: a Cordilheira sobe em degraus e as Crateras afundam; as regras continuam planas.
 * A paleta muda com a terraformação (estágios ligados às fases da Arca).
 */
import type { GameMap } from '../../sim/map';
import { diamond, hash, iso, shade } from './art';
import { TH, TW } from './projection';

export interface Palette {
  name: string;
  plain: string[];
  plainSideL: string;
  plainSideR: string;
  crater: string[];
  craterRim: string;
  ice: string;
  ridge: string[];
  ridgeSideL: string;
  ridgeSideR: string;
  vein: string;
  fog: string;
  rock: string;
  /** Céu (fundo da tela): topo e horizonte. */
  skyTop: string;
  skyBottom: string;
  stars: number;
  /** Poças de água derretida nas crateras. */
  water: boolean;
  /** Véu de névoa fina sobre o chão (0 = nenhum). */
  haze: number;
  hazeColor: string;
}

/** Estágio 0 — Pouso: rocha, ferrugem e gelo; sem atmosfera, céu negro e estrelado. */
export const PALETTE_POUSO: Palette = {
  name: 'Pouso',
  plain: ['#57403a', '#5e453e', '#523b35'],
  plainSideL: '#3d2b26',
  plainSideR: '#2b1e1b',
  crater: ['#44566a', '#4a5d72', '#405164'],
  craterRim: '#8da2b8',
  ice: '#c8d7e6',
  ridge: ['#4a3633', '#523c38', '#44312e'],
  ridgeSideL: '#34241f',
  ridgeSideR: '#231815',
  vein: '#9a5b3c',
  fog: '#090c12',
  rock: '#6e655c',
  skyTop: '#05060a',
  skyBottom: '#10131c',
  stars: 1,
  water: false,
  haze: 0,
  hazeColor: '#000000',
};

/** Estágio 1 — Posto avançado: o gelo começa a ceder, o chão esquenta, o céu ganha um tom violeta. */
export const PALETTE_POSTO: Palette = {
  name: 'Posto avançado',
  plain: ['#654538', '#6c4b3d', '#5f4034'],
  plainSideL: '#442e25',
  plainSideR: '#301f1a',
  crater: ['#465d73', '#4d657c', '#42576c'],
  craterRim: '#93aec6',
  ice: '#b9d3e8',
  ridge: ['#553b34', '#5d423a', '#4e362f'],
  ridgeSideL: '#3a2620',
  ridgeSideR: '#271915',
  vein: '#b0643d',
  fog: '#0b0c14',
  rock: '#766a5f',
  skyTop: '#0a0816',
  skyBottom: '#241a33',
  stars: 0.55,
  water: false,
  haze: 0,
  hazeColor: '#000000',
};

/** Estágio 2 — Base: névoa fina e céu alaranjado; surgem as primeiras poças nas crateras. */
export const PALETTE_BASE: Palette = {
  name: 'Base',
  plain: ['#77503a', '#7f5740', '#704a35'],
  plainSideL: '#4e3325',
  plainSideR: '#37231a',
  crater: ['#4d6474', '#546c7d', '#485e6d'],
  craterRim: '#a3b9c7',
  ice: '#bcd4e2',
  ridge: ['#634336', '#6b4a3c', '#5b3d31'],
  ridgeSideL: '#422a20',
  ridgeSideR: '#2d1c15',
  vein: '#c46e3e',
  fog: '#140e10',
  rock: '#857564',
  skyTop: '#1c1016',
  skyBottom: '#7a3f22',
  stars: 0.15,
  water: true,
  haze: 0.5,
  hazeColor: '#e0925a',
};

export const PALETTES: Palette[] = [PALETTE_POUSO, PALETTE_POSTO, PALETTE_BASE];
export const PALETTE_START = PALETTE_POUSO;

/** Estágio de terraformação a partir da Arca: 0 Pouso, 1 Posto avançado, 2 Base (todas as fases entregues). */
export function terraStage(arca: { phase: number; done: boolean }): number {
  if (arca.done) return 2;
  return Math.max(0, Math.min(1, Math.floor(arca.phase)));
}

const RES_COL: Record<string, string> = { regolito: '#d08c5b', gelo: '#9fe3ff', minerio: '#c3ccd9' };

/** Altura decorativa (px) de uma célula. */
export function visualHeight(map: GameMap, x: number, y: number): number {
  const t = map.terrainAt(x, y);
  const ridgeish = (xx: number, yy: number) => {
    const tt = map.terrainAt(xx, yy);
    return tt === 'serra' || (tt === 'rocha' && map.terrainAt(xx - 1, yy) === 'serra');
  };
  if (ridgeish(x, y)) {
    let d = 0;
    for (let k = 1; k <= 6; k++) if (ridgeish(x - k, y + k)) d++;
    else break;
    return Math.min(3, 1 + Math.floor(d / 2)) * 9;
  }
  if (t === 'cratera') return -7;
  return 0;
}

export interface TerrainImage {
  canvas: HTMLCanvasElement;
  /** Posição, em px de mundo, do canto superior esquerdo do canvas. */
  left: number;
  top: number;
}

type Ctx = CanvasRenderingContext2D;

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Polígono irregular dentro do losango da célula (placas de gelo, poças). */
function blob(c: Ctx, cx: number, cy: number, rx: number, ry: number, seedX: number, seedY: number, seed: number): void {
  const n = 9;
  c.beginPath();
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const r = 0.7 + hash(seedX, seedY, seed + k) * 0.3;
    const px = cx + Math.cos(a) * rx * r;
    const py = cy + Math.sin(a) * ry * r;
    if (k === 0) c.moveTo(px, py);
    else c.lineTo(px, py);
  }
  c.closePath();
}

export function renderTerrain(map: GameMap, P: Palette = PALETTE_START, landing?: { x: number; y: number }): TerrainImage {
  const pad = 80;
  const left = iso(0, map.height).x - pad;
  const right = iso(map.width, 0).x + pad;
  const top = iso(0, 0).y - pad;
  const bottom = iso(map.width, map.height).y + pad;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(right - left);
  canvas.height = Math.ceil(bottom - top);
  const c = canvas.getContext('2d')!;
  c.translate(-left, -top);
  const H = (x: number, y: number) => visualHeight(map, x, y);
  const isFog = (x: number, y: number) => !map.inBounds(x, y) || map.terrainAt(x, y) === 'nevoa';

  // Borda do recorte do mapa: uma laje grossa, para o mapa "flutuar" sobre o céu
  const slab = 26;
  for (let x = 0; x < map.width; x++) {
    const L = iso(x, map.height), B = iso(x + 1, map.height);
    c.fillStyle = shade(P.fog, 0.06);
    c.beginPath(); c.moveTo(L.x, L.y); c.lineTo(B.x, B.y); c.lineTo(B.x, B.y + slab); c.lineTo(L.x, L.y + slab); c.fill();
  }
  for (let y = 0; y < map.height; y++) {
    const R = iso(map.width, y), B = iso(map.width, y + 1);
    c.fillStyle = shade(P.fog, 0.02);
    c.beginPath(); c.moveTo(B.x, B.y); c.lineTo(R.x, R.y); c.lineTo(R.x, R.y + slab); c.lineTo(B.x, B.y + slab); c.fill();
  }

  // ——— 1ª passada: chão visível ———
  for (let sum = 0; sum < map.width + map.height; sum++) {
    for (let x = 0; x < map.width; x++) {
      const y = sum - x;
      if (y < 0 || y >= map.height) continue;
      const tile = map.get(x, y)!;
      if (tile.terrain === 'nevoa') continue;

      const h = H(x, y);
      const n = hash(x, y);
      const isCrater = tile.terrain === 'cratera';
      const isRidge = tile.terrain === 'serra' || (tile.terrain === 'rocha' && h > 0);
      const topCol = (isCrater ? P.crater : isRidge ? P.ridge : P.plain)[Math.floor(n * 3)];
      const p = iso(x + 0.5, y + 0.5, h);

      // Laterais do degrau quando o vizinho da frente é mais baixo (ou névoa)
      const fogR = isFog(x + 1, y);
      const fogD = isFog(x, y + 1);
      const hR = fogR ? -14 : H(x + 1, y);
      const hD = fogD ? -14 : H(x, y + 1);
      if (h > hR || h > hD) {
        const low = Math.min(hR, hD) - 2;
        const L = iso(x, y + 1, h), R = iso(x + 1, y, h), B = iso(x + 1, y + 1, h);
        const Lb = iso(x, y + 1, low), Rb = iso(x + 1, y, low), Bb = iso(x + 1, y + 1, low);
        if (h > hD) {
          c.fillStyle = isRidge ? P.ridgeSideL : P.plainSideL;
          c.beginPath(); c.moveTo(L.x, L.y); c.lineTo(B.x, B.y); c.lineTo(Bb.x, Bb.y); c.lineTo(Lb.x, Lb.y); c.fill();
          // estratos na encosta
          if (isRidge && h - low > 10) {
            c.strokeStyle = 'rgba(0,0,0,0.18)'; c.lineWidth = 1;
            for (let s = 9; s < h - low; s += 9) {
              const a = iso(x, y + 1, h - s), b = iso(x + 1, y + 1, h - s);
              c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
            }
          }
        }
        if (h > hR) {
          c.fillStyle = isRidge ? P.ridgeSideR : P.plainSideR;
          c.beginPath(); c.moveTo(B.x, B.y); c.lineTo(R.x, R.y); c.lineTo(Rb.x, Rb.y); c.lineTo(Bb.x, Bb.y); c.fill();
          if (isRidge && h - low > 10) {
            c.strokeStyle = 'rgba(0,0,0,0.2)'; c.lineWidth = 1;
            for (let s = 9; s < h - low; s += 9) {
              const a = iso(x + 1, y + 1, h - s), b = iso(x + 1, y, h - s);
              c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
            }
          }
        }
      }

      // Topo
      diamond(c, p.x, p.y, TW + 0.6, TH + 0.6);
      c.fillStyle = topCol;
      c.fill();
      // Sombreado suave em diagonal (luz vinda do alto à esquerda)
      const g = c.createLinearGradient(p.x - TW / 2, p.y - TH / 2, p.x + TW / 2, p.y + TH / 2);
      g.addColorStop(0, 'rgba(255,255,255,0.045)');
      g.addColorStop(1, 'rgba(0,0,0,0.06)');
      diamond(c, p.x, p.y, TW, TH);
      c.fillStyle = g;
      c.fill();

      // Borda iluminada nas quinas altas da Cordilheira
      if (isRidge && (H(x - 1, y) < h || H(x, y - 1) < h)) {
        c.strokeStyle = 'rgba(255,220,190,0.16)'; c.lineWidth = 1.2;
        const A = iso(x, y, h), B = iso(x + 1, y, h), D = iso(x, y + 1, h);
        c.beginPath();
        if (H(x, y - 1) < h) { c.moveTo(A.x, A.y); c.lineTo(B.x, B.y); }
        if (H(x - 1, y) < h) { c.moveTo(D.x, D.y); c.lineTo(A.x, A.y); }
        c.stroke();
      }

      if (isCrater) {
        // Borda da cratera (onde o chão ao redor é mais alto)
        const up = (t?: string) => t === 'planicie' || t === 'serra' || t === 'rocha';
        if (up(map.terrainAt(x - 1, y)) || up(map.terrainAt(x, y - 1))) {
          c.strokeStyle = rgba(P.craterRim, 0.55); c.lineWidth = 1.6;
          const A = iso(x, y, h), B = iso(x + 1, y, h), D = iso(x, y + 1, h);
          c.beginPath();
          if (up(map.terrainAt(x - 1, y))) { c.moveTo(D.x, D.y); c.lineTo(A.x, A.y); }
          if (up(map.terrainAt(x, y - 1))) { c.moveTo(A.x, A.y); c.lineTo(B.x, B.y); }
          c.stroke();
        }
        // Placas de gelo com brilho e rachaduras
        if (hash(x, y, 3) < 0.3) {
          const bx = p.x + (hash(x, y, 4) - 0.5) * 16, by = p.y + (hash(x, y, 5) - 0.5) * 6;
          const rx = 14 + hash(x, y, 6) * 12, ry = rx * 0.42;
          blob(c, bx, by, rx, ry, x, y, 60);
          c.fillStyle = rgba(P.ice, 0.16 + hash(x, y, 7) * 0.14);
          c.fill();
          // reflexo
          c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1;
          c.beginPath(); c.moveTo(bx - rx * 0.45, by - ry * 0.2); c.lineTo(bx - rx * 0.05, by - ry * 0.45); c.stroke();
          // rachadura
          c.strokeStyle = 'rgba(20,30,45,0.35)'; c.lineWidth = 0.7;
          c.beginPath(); c.moveTo(bx - rx * 0.3, by + ry * 0.3); c.lineTo(bx + rx * 0.05, by); c.lineTo(bx + rx * 0.4, by + ry * 0.15); c.stroke();
        }
        // Poças de água derretida (estágio Base)
        if (P.water && hash(x, y, 9) < 0.14 && !tile.node) {
          const bx = p.x + (hash(x, y, 10) - 0.5) * 10, by = p.y + (hash(x, y, 11) - 0.5) * 4;
          blob(c, bx, by, 11, 5, x, y, 80);
          c.fillStyle = 'rgba(40,110,150,0.75)'; c.fill();
          c.strokeStyle = 'rgba(160,215,235,0.55)'; c.lineWidth = 0.8; c.stroke();
          c.fillStyle = 'rgba(255,220,180,0.35)';
          c.fillRect(bx - 4, by - 1.5, 5, 1);
        }
      } else if (isRidge) {
        // Veios de ferro
        if (hash(x, y, 12) < 0.5) {
          c.strokeStyle = rgba(P.vein, 0.55); c.lineWidth = 1.2;
          const sx = p.x + (hash(x, y, 13) - 0.5) * 24, sy = p.y + (hash(x, y, 14) - 0.5) * 8;
          c.beginPath(); c.moveTo(sx - 8, sy + 3); c.lineTo(sx - 1, sy - 1); c.lineTo(sx + 7, sy + 1); c.stroke();
        }
        // Seixos
        for (let k = 0; k < 2; k++) {
          if (hash(x, y, 20 + k) < 0.5) continue;
          const sx = p.x + (hash(x, y, 22 + k) - 0.5) * 30, sy = p.y + (hash(x, y, 24 + k) - 0.5) * 10;
          c.fillStyle = shade(P.rock, -0.25); c.beginPath(); c.ellipse(sx, sy, 3.2, 1.8, 0, 0, 7); c.fill();
          c.fillStyle = shade(P.rock, 0.1); c.beginPath(); c.ellipse(sx - 0.6, sy - 0.8, 2, 1.1, 0, 0, 7); c.fill();
        }
      } else {
        // Planície: pequenas crateras de impacto e cascalho
        if (hash(x, y, 30) < 0.035 && !tile.node && tile.terrain !== 'rocha') {
          const r = 7 + hash(x, y, 31) * 5;
          c.fillStyle = 'rgba(0,0,0,0.14)'; c.beginPath(); c.ellipse(p.x, p.y, r, r * 0.5, 0, 0, 7); c.fill();
          c.strokeStyle = 'rgba(255,225,200,0.12)'; c.lineWidth = 1.2;
          c.beginPath(); c.ellipse(p.x, p.y + 0.5, r, r * 0.5, 0, 0.1, Math.PI - 0.1); c.stroke();
        }
      }

      // Grão do chão
      c.fillStyle = 'rgba(255,255,255,0.05)';
      for (let k = 0; k < 3; k++) c.fillRect(p.x + (hash(x, y, k + 1) - 0.5) * 34, p.y + (hash(x, y, k + 7) - 0.5) * 12, 2, 1);
      c.fillStyle = 'rgba(0,0,0,0.08)';
      for (let k = 0; k < 2; k++) c.fillRect(p.x + (hash(x, y, k + 15) - 0.5) * 30, p.y + (hash(x, y, k + 17) - 0.5) * 10, 2, 1);
      // Grade sutil
      diamond(c, p.x, p.y, TW, TH);
      c.strokeStyle = 'rgba(255,255,255,0.035)'; c.lineWidth = 1; c.stroke();

      // Nós de recurso: halo no chão + cristais
      if (tile.node) {
        const col = RES_COL[tile.node] ?? '#ffffff';
        const hg = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, 26);
        hg.addColorStop(0, rgba(col, 0.28));
        hg.addColorStop(1, rgba(col, 0));
        c.save(); c.translate(p.x, p.y); c.scale(1, 0.5); c.translate(-p.x, -p.y);
        c.fillStyle = hg; c.beginPath(); c.arc(p.x, p.y, 26, 0, 7); c.fill();
        c.restore();
        for (let k = 0; k < 3; k++) {
          const a = hash(x, y, k + 40), b = hash(x, y, k + 50);
          const cx = p.x + (a - 0.5) * 30, cy = p.y + (b - 0.5) * 10, hh = 8 + a * 10, cw = 5 + b * 3;
          c.fillStyle = shade(col, -0.35); c.beginPath(); c.moveTo(cx, cy - hh); c.lineTo(cx + cw, cy - 2); c.lineTo(cx, cy + 2); c.fill();
          c.fillStyle = col; c.beginPath(); c.moveTo(cx, cy - hh); c.lineTo(cx - cw, cy - 2); c.lineTo(cx, cy + 2); c.fill();
          c.fillStyle = 'rgba(255,255,255,0.45)'; c.beginPath(); c.moveTo(cx, cy - hh); c.lineTo(cx - cw * 0.35, cy - hh * 0.45); c.lineTo(cx, cy - hh * 0.5); c.fill();
        }
      }
      // Rochas em volume
      if (tile.terrain === 'rocha') {
        c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.ellipse(p.x + 6, p.y + 2, 17, 7, 0, 0, 7); c.fill();
        c.fillStyle = shade(P.rock, -0.35); c.beginPath(); c.ellipse(p.x + 4, p.y - 2, 16, 8, 0, 0, 7); c.fill();
        c.fillStyle = P.rock; c.beginPath(); c.ellipse(p.x - 2, p.y - 7, 13, 9, 0, 0, 7); c.fill();
        c.fillStyle = shade(P.rock, 0.18); c.beginPath(); c.ellipse(p.x - 5, p.y - 11, 6, 3, 0, 0, 7); c.fill();
        if (hash(x, y, 70) < 0.5) {
          c.fillStyle = shade(P.rock, -0.15); c.beginPath(); c.ellipse(p.x + 12, p.y + 3, 5, 3, 0, 0, 7); c.fill();
        }
      }
    }
  }

  // Marca de pouso: chão chamuscado em volta da cápsula
  if (landing) {
    const p = iso(landing.x + 1, landing.y + 1, 0);
    c.save(); c.translate(p.x, p.y); c.scale(1, 0.5);
    const bg = c.createRadialGradient(0, 0, 20, 0, 0, 120);
    bg.addColorStop(0, 'rgba(10,6,4,0.32)');
    bg.addColorStop(1, 'rgba(10,6,4,0)');
    c.fillStyle = bg; c.beginPath(); c.arc(0, 0, 120, 0, 7); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.18)'; c.lineWidth = 2;
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + hash(k, 1) * 0.4;
      c.beginPath(); c.moveTo(Math.cos(a) * 50, Math.sin(a) * 50); c.lineTo(Math.cos(a) * (95 + hash(k, 2) * 30), Math.sin(a) * (95 + hash(k, 2) * 30)); c.stroke();
    }
    c.restore();
  }

  // ——— 2ª passada: névoa com borda suave por cima do chão ———
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (!isFog(x, y)) continue;
      // Só as células de névoa vizinhas de chão visível precisam do degradê
      let edge = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        if (!isFog(x + dx, y + dy)) { edge = true; break; }
      }
      const p = iso(x + 0.5, y + 0.5, 0);
      if (edge) {
        c.save(); c.translate(p.x, p.y); c.scale(1, 0.5);
        const fg = c.createRadialGradient(0, 0, TW * 0.35, 0, 0, TW * 1.05);
        fg.addColorStop(0, rgba(P.fog, 0.95));
        fg.addColorStop(1, rgba(P.fog, 0));
        c.fillStyle = fg; c.beginPath(); c.arc(0, 0, TW * 1.05, 0, 7); c.fill();
        c.restore();
      }
      diamond(c, p.x, p.y, TW + 1, TH + 1);
      c.fillStyle = P.fog;
      c.fill();
    }
  }
  // Textura de "sem sinal": ruído de estática fraco sobre a névoa
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (!isFog(x, y)) continue;
      const p = iso(x + 0.5, y + 0.5, 0);
      c.fillStyle = 'rgba(120,140,170,0.05)';
      for (let k = 0; k < 4; k++) {
        if (hash(x, y, 90 + k) < 0.5) continue;
        c.fillRect(p.x + (hash(x, y, 94 + k) - 0.5) * 36, p.y + (hash(x, y, 98 + k) - 0.5) * 14, 6 + hash(x, y, 102 + k) * 8, 1);
      }
    }
  }
  return { canvas, left, top };
}

/** Céu de fundo (tela inteira, atrás do mapa). */
export function renderSky(P: Palette, w = 1024, h = 640): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext('2d')!;
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, P.skyTop);
  g.addColorStop(1, P.skyBottom);
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  if (P.stars > 0) {
    for (let k = 0; k < 260; k++) {
      const x = hash(k, 7) * w, y = hash(k, 11) * h;
      const b = hash(k, 13);
      c.fillStyle = `rgba(255,255,255,${(0.15 + b * 0.6) * P.stars * (1 - (y / h) * 0.6)})`;
      c.fillRect(x, y, b > 0.9 ? 2 : 1, b > 0.9 ? 2 : 1);
    }
  }
  return canvas;
}

/** Textura de névoa fina (tileável) usada como véu sobre o chão no estágio Base. */
export function renderHaze(P: Palette, size = 512): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const c = canvas.getContext('2d')!;
  for (let k = 0; k < 40; k++) {
    const x = hash(k, 3) * size, y = hash(k, 5) * size, r = 60 + hash(k, 9) * 110;
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        const g = c.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        g.addColorStop(0, rgba(P.hazeColor, 0.22));
        g.addColorStop(1, rgba(P.hazeColor, 0));
        c.fillStyle = g;
        c.beginPath(); c.arc(x + ox, y + oy, r, 0, 7); c.fill();
      }
    }
  }
  return canvas;
}
