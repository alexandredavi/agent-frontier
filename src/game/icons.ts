import type Phaser from 'phaser';
import { RESOURCES } from '../sim/defs';
import type { AgentType, ResourceId } from '../sim/types';

const DARK = 0x1a1d24;

/** Desenha um item: matéria = círculo, dados = losango. */
export function drawItem(g: Phaser.GameObjects.Graphics, res: ResourceId, x: number, y: number, r: number, color: number): void {
  if (RESOURCES[res].kind === 'dados') {
    g.fillStyle(0x0b0d12, 1);
    g.fillPoints([{ x, y: y - r - 1.5 }, { x: x + r + 1.5, y }, { x, y: y + r + 1.5 }, { x: x - r - 1.5, y }], true);
    g.fillStyle(color, 1);
    g.fillPoints([{ x, y: y - r }, { x: x + r, y }, { x, y: y + r }, { x: x - r, y }], true);
  } else {
    g.fillStyle(0x0b0d12, 1);
    g.fillCircle(x, y, r + 1.5);
    g.fillStyle(color, 1);
    g.fillCircle(x, y, r);
  }
}

/** Desenha o ícone vetorial de um agente centrado em (cx, cy) com raio aproximado r. */
export function drawAgentIcon(g: Phaser.GameObjects.Graphics, type: AgentType, cx: number, cy: number, r: number, color: number): void {
  const lw = Math.max(1.5, r * 0.14);
  switch (type) {
    case 'extrator': {
      g.fillStyle(color, 1);
      g.fillRect(cx - r * 0.45, cy - r, r * 0.9, r * 0.8);
      g.fillTriangle(cx - r * 0.45, cy - r * 0.2, cx + r * 0.45, cy - r * 0.2, cx, cy + r);
      g.lineStyle(lw, DARK, 0.9);
      g.lineBetween(cx - r * 0.3, cy + r * 0.05, cx + r * 0.3, cy - r * 0.05);
      g.lineBetween(cx - r * 0.18, cy + r * 0.4, cx + r * 0.18, cy + r * 0.3);
      break;
    }
    case 'sensor': {
      // Antena com ondas
      g.lineStyle(lw * 1.4, color, 1);
      g.lineBetween(cx, cy - r * 0.2, cx, cy + r);
      g.lineBetween(cx - r * 0.5, cy + r, cx + r * 0.5, cy + r);
      g.fillStyle(color, 1);
      g.fillCircle(cx, cy - r * 0.3, r * 0.22);
      g.beginPath();
      g.arc(cx, cy - r * 0.3, r * 0.6, Math.PI * 1.15, Math.PI * 1.85);
      g.strokePath();
      g.beginPath();
      g.arc(cx, cy - r * 0.3, r * 0.95, Math.PI * 1.2, Math.PI * 1.8);
      g.strokePath();
      break;
    }
    case 'derretedor': {
      // Gota sobre chama
      g.fillStyle(color, 1);
      g.fillTriangle(cx, cy - r, cx - r * 0.55, cy, cx + r * 0.55, cy);
      g.fillCircle(cx, cy + r * 0.05, r * 0.55);
      g.fillStyle(0xf97316, 1);
      g.fillTriangle(cx - r * 0.6, cy + r, cx - r * 0.3, cy + r * 0.55, cx, cy + r);
      g.fillTriangle(cx, cy + r, cx + r * 0.3, cy + r * 0.55, cx + r * 0.6, cy + r);
      break;
    }
    case 'cartografo': {
      // Mapa dobrado com marcador
      g.fillStyle(color, 1);
      g.fillRect(cx - r * 0.9, cy - r * 0.6, r * 1.8, r * 1.3);
      g.lineStyle(lw, DARK, 0.7);
      g.lineBetween(cx - r * 0.3, cy - r * 0.6, cx - r * 0.3, cy + r * 0.7);
      g.lineBetween(cx + r * 0.3, cy - r * 0.6, cx + r * 0.3, cy + r * 0.7);
      g.fillStyle(0xf87171, 1);
      g.fillCircle(cx + r * 0.55, cy - r * 0.1, r * 0.22);
      break;
    }
    case 'analista': {
      // Lupa
      g.lineStyle(lw * 1.6, color, 1);
      g.strokeCircle(cx - r * 0.2, cy - r * 0.2, r * 0.55);
      g.lineBetween(cx + r * 0.2, cy + r * 0.2, cx + r * 0.85, cy + r * 0.85);
      break;
    }
    case 'eletrolisador': {
      // Raio + bolhas
      g.fillStyle(color, 1);
      g.fillTriangle(cx + r * 0.1, cy - r, cx - r * 0.5, cy + r * 0.1, cx + r * 0.05, cy + r * 0.1);
      g.fillTriangle(cx - r * 0.1, cy + r, cx + r * 0.5, cy - r * 0.1, cx - r * 0.05, cy - r * 0.1);
      g.lineStyle(lw, color, 1);
      g.strokeCircle(cx + r * 0.7, cy - r * 0.6, r * 0.2);
      g.strokeCircle(cx - r * 0.7, cy + r * 0.6, r * 0.15);
      break;
    }
    case 'fundidor': {
      // Lingote (trapézio) com brilho
      g.fillStyle(color, 1);
      g.fillPoints([{ x: cx - r * 0.9, y: cy + r * 0.5 }, { x: cx + r * 0.9, y: cy + r * 0.5 }, { x: cx + r * 0.55, y: cy - r * 0.2 }, { x: cx - r * 0.55, y: cy - r * 0.2 }], true);
      g.fillStyle(0xf97316, 1);
      g.fillTriangle(cx - r * 0.2, cy - r * 0.35, cx, cy - r, cx + r * 0.2, cy - r * 0.35);
      break;
    }
    case 'prensa': {
      // Martelo descendo sobre base
      g.fillStyle(color, 1);
      g.fillRect(cx - r * 0.6, cy - r, r * 1.2, r * 0.5);
      g.fillRect(cx - r * 0.12, cy - r * 0.5, r * 0.24, r * 0.6);
      g.fillRect(cx - r * 0.9, cy + r * 0.55, r * 1.8, r * 0.35);
      g.lineStyle(lw, color, 0.8);
      g.lineBetween(cx - r * 0.5, cy + r * 0.35, cx + r * 0.5, cy + r * 0.35);
      break;
    }
    case 'construtor': {
      // Casinha (habitat)
      g.fillStyle(color, 1);
      g.fillTriangle(cx - r, cy - r * 0.05, cx, cy - r, cx + r, cy - r * 0.05);
      g.fillRect(cx - r * 0.7, cy - r * 0.05, r * 1.4, r * 0.95);
      g.fillStyle(DARK, 1);
      g.fillRect(cx - r * 0.18, cy + r * 0.35, r * 0.36, r * 0.55);
      break;
    }
    case 'silo': {
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
      g.lineStyle(lw * 1.6, color, 1);
      g.lineBetween(cx - r * 0.7, cy - r * 0.75, cx + r * 0.1, cy);
      g.lineBetween(cx - r * 0.7, cy, cx + r * 0.1, cy);
      g.lineBetween(cx - r * 0.7, cy + r * 0.75, cx + r * 0.1, cy);
      g.lineBetween(cx + r * 0.1, cy, cx + r, cy);
      g.fillStyle(color, 1);
      for (const dy of [-0.75, 0, 0.75]) g.fillCircle(cx - r * 0.8, cy + r * dy, r * 0.2);
      break;
    }
    case 'descarte': {
      // Lixeira com X
      g.lineStyle(lw * 1.4, color, 1);
      g.strokeRect(cx - r * 0.55, cy - r * 0.55, r * 1.1, r * 1.4);
      g.lineBetween(cx - r * 0.8, cy - r * 0.7, cx + r * 0.8, cy - r * 0.7);
      g.lineBetween(cx - r * 0.3, cy - r * 0.2, cx + r * 0.3, cy + r * 0.5);
      g.lineBetween(cx + r * 0.3, cy - r * 0.2, cx - r * 0.3, cy + r * 0.5);
      break;
    }
    case 'verificador': {
      // Escudo com visto (o juiz)
      g.fillStyle(color, 1);
      g.fillPoints([{ x: cx - r * 0.8, y: cy - r * 0.8 }, { x: cx + r * 0.8, y: cy - r * 0.8 }, { x: cx + r * 0.8, y: cy }, { x: cx, y: cy + r }, { x: cx - r * 0.8, y: cy }], true);
      g.lineStyle(lw * 1.6, DARK, 1);
      g.lineBetween(cx - r * 0.4, cy - r * 0.1, cx - r * 0.1, cy + r * 0.25);
      g.lineBetween(cx - r * 0.1, cy + r * 0.25, cx + r * 0.45, cy - r * 0.4);
      break;
    }
    case 'plataforma': {
      // Plataforma com seta para cima (envio à Arca)
      g.lineStyle(lw * 1.2, color, 1);
      g.strokeEllipse(cx, cy + r * 0.6, r * 1.9, r * 0.6);
      g.fillStyle(color, 1);
      g.fillTriangle(cx, cy - r, cx - r * 0.5, cy - r * 0.35, cx + r * 0.5, cy - r * 0.35);
      g.fillRect(cx - r * 0.18, cy - r * 0.4, r * 0.36, r * 0.9);
      break;
    }
    case 'painel_solar': {
      // Grade de células solares
      g.fillStyle(color, 1);
      g.fillRect(cx - r * 0.9, cy - r * 0.7, r * 1.8, r * 1.2);
      g.lineStyle(lw * 0.8, DARK, 0.8);
      g.lineBetween(cx - r * 0.3, cy - r * 0.7, cx - r * 0.3, cy + r * 0.5);
      g.lineBetween(cx + r * 0.3, cy - r * 0.7, cx + r * 0.3, cy + r * 0.5);
      g.lineBetween(cx - r * 0.9, cy - r * 0.1, cx + r * 0.9, cy - r * 0.1);
      g.fillStyle(color, 1);
      g.fillRect(cx - r * 0.1, cy + r * 0.5, r * 0.2, r * 0.45);
      break;
    }
  }
}
