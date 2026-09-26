/** Projeção isométrica 2:1 (losango de 64×32). Sem dependência do Phaser, para ser testável. */
export const TW = 64;
export const TH = 32;

export interface Pt {
  x: number;
  y: number;
}

/** Grade (células, podendo ser fracionária) + altura em px → coordenadas de mundo em px. */
export function toIso(gx: number, gy: number, z = 0): Pt {
  return { x: ((gx - gy) * TW) / 2, y: ((gx + gy) * TH) / 2 - z };
}

/** Coordenadas de mundo em px (no chão, z = 0) → grade fracionária. */
export function fromIso(x: number, y: number): { gx: number; gy: number } {
  const a = x / (TW / 2);
  const b = y / (TH / 2);
  return { gx: (a + b) / 2, gy: (b - a) / 2 };
}

/** Célula inteira sob um ponto do chão. */
export function cellAt(x: number, y: number): { x: number; y: number } {
  const g = fromIso(x, y);
  return { x: Math.floor(g.gx), y: Math.floor(g.gy) };
}

/**
 * Canto superior esquerdo de uma área 2x2 centrada no ponto (para construir/mover
 * com o cursor no meio do agente).
 */
export function footprintAt(x: number, y: number, size = 2): { x: number; y: number } {
  const g = fromIso(x, y);
  return { x: Math.round(g.gx - size / 2), y: Math.round(g.gy - size / 2) };
}

/** Profundidade de desenho: quem tem maior soma x+y (canto da frente) fica por cima. */
export function depthOf(x: number, y: number, size = 2): number {
  return x + y + size;
}

/** Semieixos, em px, da elipse que representa um círculo de raio r (células) na grade. */
export function isoCircle(r: number): { rx: number; ry: number } {
  return { rx: (r * TW) / Math.SQRT2, ry: (r * TH) / Math.SQRT2 };
}

export interface Pickable {
  id: number;
  x: number;
  y: number;
  /** Retângulo de tela (mundo) ocupado pelo desenho. */
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Entre os agentes cujo desenho contém o ponto, escolhe o mais à frente. */
export function pickFrontmost(items: Pickable[], px: number, py: number, contains?: (it: Pickable) => boolean): Pickable | undefined {
  let best: Pickable | undefined;
  for (const it of items) {
    if (px < it.left || px > it.right || py < it.top || py > it.bottom) continue;
    if (contains && !contains(it)) continue;
    if (!best || depthOf(it.x, it.y) > depthOf(best.x, best.y)) best = it;
  }
  return best;
}
