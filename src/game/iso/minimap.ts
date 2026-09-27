/** Minimapa isométrico em canvas: usado no HUD e nas miniaturas dos saves. */
import type { GameMap } from '../../sim/map';
import type { Agent } from '../../sim/types';
import { TH, TW, toIso } from './projection';
import type { Palette } from './terrain';

export interface MiniFrame {
  left: number;
  top: number;
  k: number;
  width: number;
  height: number;
}

/** Escala que cabe o losango do mapa em (w × h). */
export function miniFrame(map: GameMap, w: number, h: number): MiniFrame {
  const left = toIso(0, map.height).x, right = toIso(map.width, 0).x, top = toIso(0, 0).y, bottom = toIso(map.width, map.height).y;
  const k = Math.min(w / (right - left), h / (bottom - top));
  return { left, top, k, width: Math.ceil((right - left) * k), height: Math.ceil((bottom - top) * k) };
}

export function drawMiniTerrain(c: CanvasRenderingContext2D, map: GameMap, P: Palette, f: MiniFrame): void {
  const col: Record<string, string> = { planicie: P.plain[0], cratera: P.crater[1], serra: P.ridge[1], rocha: P.rock, nevoa: P.fog };
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const p = toIso(x + 0.5, y + 0.5);
      const px = (p.x - f.left) * f.k, py = (p.y - f.top) * f.k, hw = (TW * f.k) / 2 + 0.3, hh = (TH * f.k) / 2 + 0.3;
      c.fillStyle = col[map.terrainAt(x, y) ?? 'nevoa'];
      c.beginPath(); c.moveTo(px, py - hh); c.lineTo(px + hw, py); c.lineTo(px, py + hh); c.lineTo(px - hw, py); c.closePath(); c.fill();
    }
  }
}

const DOT: Record<string, string> = { ok: '#4ade80', ocioso: '#64748b', bloqueado: '#f5b041' };

export function drawMiniAgents(c: CanvasRenderingContext2D, agents: Iterable<Agent>, f: MiniFrame, size = 3): void {
  for (const a of agents) {
    const p = toIso(a.x + 1, a.y + 1);
    c.fillStyle = DOT[a.status] ?? '#4ade80';
    c.fillRect((p.x - f.left) * f.k - size / 2, (p.y - f.top) * f.k - size / 2, size, size);
  }
}
