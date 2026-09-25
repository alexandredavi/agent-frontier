import type Phaser from 'phaser';
import type { AgentType } from '../sim/types';

const DARK = 0x1a1d24;

/** Desenha o ícone vetorial de um agente centrado em (cx, cy) com raio aproximado r. */
export function drawAgentIcon(g: Phaser.GameObjects.Graphics, type: AgentType, cx: number, cy: number, r: number, color: number): void {
  const lw = Math.max(1.5, r * 0.14);
  switch (type) {
    case 'extrator': {
      // Broca: corpo + ponta + roscas
      g.fillStyle(color, 1);
      g.fillRect(cx - r * 0.45, cy - r, r * 0.9, r * 0.8);
      g.fillTriangle(cx - r * 0.45, cy - r * 0.2, cx + r * 0.45, cy - r * 0.2, cx, cy + r);
      g.lineStyle(lw, DARK, 0.9);
      g.lineBetween(cx - r * 0.3, cy + r * 0.05, cx + r * 0.3, cy - r * 0.05);
      g.lineBetween(cx - r * 0.18, cy + r * 0.4, cx + r * 0.18, cy + r * 0.3);
      break;
    }
    case 'silo': {
      // Cilindro: corpo + tampa elíptica + faixas
      g.fillStyle(color, 1);
      g.fillRect(cx - r * 0.7, cy - r * 0.65, r * 1.4, r * 1.45);
      g.fillEllipse(cx, cy + r * 0.8, r * 1.4, r * 0.5);
      g.fillStyle(0xd4c4ff, 1);
      g.fillEllipse(cx, cy - r * 0.65, r * 1.4, r * 0.5);
      g.lineStyle(lw, DARK, 0.6);
      g.lineBetween(cx - r * 0.7, cy - r * 0.05, cx + r * 0.7, cy - r * 0.05);
      g.lineBetween(cx - r * 0.7, cy + r * 0.4, cx + r * 0.7, cy + r * 0.4);
      break;
    }
    case 'divisor': {
      // Uma entrada à esquerda abrindo em três saídas
      g.lineStyle(lw * 1.6, color, 1);
      g.lineBetween(cx - r, cy, cx - r * 0.1, cy);
      g.lineBetween(cx - r * 0.1, cy, cx + r * 0.7, cy - r * 0.75);
      g.lineBetween(cx - r * 0.1, cy, cx + r * 0.7, cy);
      g.lineBetween(cx - r * 0.1, cy, cx + r * 0.7, cy + r * 0.75);
      g.fillStyle(color, 1);
      for (const dy of [-0.75, 0, 0.75]) g.fillCircle(cx + r * 0.8, cy + r * dy, r * 0.2);
      break;
    }
    case 'unificador': {
      // Três entradas convergindo numa saída
      g.lineStyle(lw * 1.6, color, 1);
      g.lineBetween(cx - r * 0.7, cy - r * 0.75, cx + r * 0.1, cy);
      g.lineBetween(cx - r * 0.7, cy, cx + r * 0.1, cy);
      g.lineBetween(cx - r * 0.7, cy + r * 0.75, cx + r * 0.1, cy);
      g.lineBetween(cx + r * 0.1, cy, cx + r, cy);
      g.fillStyle(color, 1);
      for (const dy of [-0.75, 0, 0.75]) g.fillCircle(cx - r * 0.8, cy + r * dy, r * 0.2);
      break;
    }
  }
}
