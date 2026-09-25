import type Phaser from 'phaser';
import type { AgentType } from '../sim/types';

/** Desenha o ícone vetorial de um agente centrado em (cx, cy) com raio aproximado r. */
export function drawAgentIcon(g: Phaser.GameObjects.Graphics, type: AgentType, cx: number, cy: number, r: number, color: number): void {
  switch (type) {
    case 'extrator': {
      // Broca: corpo retangular + ponta triangular + roscas
      g.fillStyle(color, 1);
      g.fillRect(cx - r * 0.45, cy - r, r * 0.9, r * 0.8);
      g.fillTriangle(cx - r * 0.45, cy - r * 0.2, cx + r * 0.45, cy - r * 0.2, cx, cy + r);
      g.lineStyle(Math.max(1.5, r * 0.12), 0x1a1d24, 0.9);
      g.lineBetween(cx - r * 0.3, cy + r * 0.05, cx + r * 0.3, cy - r * 0.05);
      g.lineBetween(cx - r * 0.18, cy + r * 0.4, cx + r * 0.18, cy + r * 0.3);
      break;
    }
  }
}
