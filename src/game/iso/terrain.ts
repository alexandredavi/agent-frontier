/**
 * Terreno isométrico pré-renderizado num canvas (uma textura só para o mapa inteiro).
 * O relevo é só visual: a Cordilheira sobe em degraus e as Crateras afundam; as regras continuam planas.
 */
import type { GameMap } from '../../sim/map';
import { diamond, hash, iso, shade } from './art';
import { TH, TW } from './projection';

export interface Palette {
  plain: string[];
  plainSideL: string;
  plainSideR: string;
  crater: string[];
  craterRim: string;
  ridge: string[];
  ridgeSideL: string;
  ridgeSideR: string;
  fog: string;
  rock: string;
  lichen: boolean;
  water: boolean;
}

/** Paleta árida (Fase 1). A evolução com a terraformação chega no V2. */
export const PALETTE_START: Palette = {
  plain: ['#5b3c31', '#634236', '#56382e'],
  plainSideL: '#3f2821',
  plainSideR: '#2d1d18',
  crater: ['#2b3848', '#2f3d4f', '#27333f'],
  craterRim: '#45566b',
  ridge: ['#4b3431', '#533a36', '#45302d'],
  ridgeSideL: '#35231f',
  ridgeSideR: '#241715',
  fog: '#0b0e14',
  rock: '#6e655c',
  lichen: false,
  water: false,
};

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

export function renderTerrain(map: GameMap, P: Palette = PALETTE_START): TerrainImage {
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

  for (let sum = 0; sum < map.width + map.height; sum++) {
    for (let x = 0; x < map.width; x++) {
      const y = sum - x;
      if (y < 0 || y >= map.height) continue;
      const tile = map.get(x, y)!;
      const p0 = iso(x + 0.5, y + 0.5, 0);

      // Névoa (sem sinal): losango escuro com hachura
      if (tile.terrain === 'nevoa') {
        diamond(c, p0.x, p0.y, TW + 1, TH + 1);
        c.fillStyle = P.fog;
        c.fill();
        c.strokeStyle = 'rgba(60,70,90,0.18)';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(p0.x - 12, p0.y + 4);
        c.lineTo(p0.x + 4, p0.y - 4);
        c.moveTo(p0.x - 2, p0.y + 7);
        c.lineTo(p0.x + 14, p0.y - 1);
        c.stroke();
        continue;
      }

      const h = H(x, y);
      const n = hash(x, y);
      const isCrater = tile.terrain === 'cratera';
      const isRidge = tile.terrain === 'serra' || (tile.terrain === 'rocha' && h > 0);
      const topCol = (isCrater ? P.crater : isRidge ? P.ridge : P.plain)[Math.floor(n * 3)];
      const p = iso(x + 0.5, y + 0.5, h);

      // Laterais do degrau quando o vizinho da frente é mais baixo (ou névoa)
      const fogR = map.terrainAt(x + 1, y) === 'nevoa' || x + 1 >= map.width;
      const fogD = map.terrainAt(x, y + 1) === 'nevoa' || y + 1 >= map.height;
      const hR = fogR ? -14 : H(x + 1, y);
      const hD = fogD ? -14 : H(x, y + 1);
      if (h > hR || h > hD) {
        const low = Math.min(hR, hD) - 2;
        const L = iso(x, y + 1, h), R = iso(x + 1, y, h), B = iso(x + 1, y + 1, h);
        const Lb = iso(x, y + 1, low), Rb = iso(x + 1, y, low), Bb = iso(x + 1, y + 1, low);
        if (h > hD) {
          c.fillStyle = isRidge ? P.ridgeSideL : P.plainSideL;
          c.beginPath(); c.moveTo(L.x, L.y); c.lineTo(B.x, B.y); c.lineTo(Bb.x, Bb.y); c.lineTo(Lb.x, Lb.y); c.fill();
        }
        if (h > hR) {
          c.fillStyle = isRidge ? P.ridgeSideR : P.plainSideR;
          c.beginPath(); c.moveTo(B.x, B.y); c.lineTo(R.x, R.y); c.lineTo(Rb.x, Rb.y); c.lineTo(Bb.x, Bb.y); c.fill();
        }
      }

      diamond(c, p.x, p.y, TW + 0.6, TH + 0.6);
      c.fillStyle = topCol;
      c.fill();

      if (isCrater) {
        const up = (t?: string) => t === 'planicie' || t === 'serra';
        if (up(map.terrainAt(x - 1, y)) || up(map.terrainAt(x, y - 1))) {
          c.strokeStyle = P.craterRim; c.lineWidth = 2;
          const A = iso(x, y, h), B = iso(x + 1, y, h), D = iso(x, y + 1, h);
          c.beginPath(); c.moveTo(D.x, D.y); c.lineTo(A.x, A.y); c.lineTo(B.x, B.y); c.stroke();
        }
      }

      // Grão do chão
      c.fillStyle = 'rgba(255,255,255,0.05)';
      for (let k = 0; k < 3; k++) c.fillRect(p.x + (hash(x, y, k + 1) - 0.5) * 34, p.y + (hash(x, y, k + 7) - 0.5) * 12, 2, 1);
      // Grade sutil
      diamond(c, p.x, p.y, TW, TH);
      c.strokeStyle = 'rgba(255,255,255,0.035)'; c.lineWidth = 1; c.stroke();

      // Nós de recurso: cristais
      if (tile.node) {
        const col = RES_COL[tile.node] ?? '#ffffff';
        for (let k = 0; k < 3; k++) {
          const a = hash(x, y, k + 40), b = hash(x, y, k + 50);
          const cx = p.x + (a - 0.5) * 30, cy = p.y + (b - 0.5) * 10, hh = 8 + a * 10, cw = 5 + b * 3;
          c.fillStyle = shade(col, -0.35); c.beginPath(); c.moveTo(cx, cy - hh); c.lineTo(cx + cw, cy - 2); c.lineTo(cx, cy + 2); c.fill();
          c.fillStyle = col; c.beginPath(); c.moveTo(cx, cy - hh); c.lineTo(cx - cw, cy - 2); c.lineTo(cx, cy + 2); c.fill();
        }
      }
      // Rochas em volume
      if (tile.terrain === 'rocha') {
        c.fillStyle = shade(P.rock, -0.35); c.beginPath(); c.ellipse(p.x + 4, p.y - 2, 16, 8, 0, 0, 7); c.fill();
        c.fillStyle = P.rock; c.beginPath(); c.ellipse(p.x - 2, p.y - 7, 13, 9, 0, 0, 7); c.fill();
        c.fillStyle = shade(P.rock, 0.18); c.beginPath(); c.ellipse(p.x - 5, p.y - 11, 6, 3, 0, 0, 7); c.fill();
      }
    }
  }
  return { canvas, left, top };
}
