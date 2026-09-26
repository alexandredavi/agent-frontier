import type Phaser from 'phaser';
import { type ArtType, PERIOD, drawAgentArt, drawCoreArt, drawRingArt } from './art';

/** Tamanho de cada quadro e âncora (centro do chão do agente dentro do quadro). */
export const FRAME_W = 176;
export const FRAME_H = 170;
export const ANCHOR_X = 88;
export const ANCHOR_Y = 128;
export const FRAMES = 24;
const COLS = 6;

/** Agentes de IA têm animação; infraestrutura é estática no V1 (efeitos chegam no V4). */
const ANIMATED: ArtType[] = ['extrator', 'sensor', 'cartografo', 'analista', 'derretedor', 'eletrolisador', 'fundidor', 'prensa', 'construtor', 'verificador'];
const STATIC: ArtType[] = ['silo', 'unificador', 'divisor', 'descarte', 'plataforma', 'painel_solar'];
const EXTRACTOR_RES = ['regolito', 'gelo', 'minerio'];

/** Chave da textura de um agente (o Extrator tem uma por recurso, por causa da poeira). */
export function artKey(type: ArtType, res?: string | null): string {
  return type === 'extrator' ? `art-extrator-${res ?? 'regolito'}` : `art-${type}`;
}

export function frameCount(type: ArtType): number {
  return ANIMATED.includes(type) ? FRAMES : 1;
}

function sheet(scene: Phaser.Scene, key: string, frames: number, draw: (c: CanvasRenderingContext2D, tt: number) => void): void {
  if (scene.textures.exists(key)) return;
  const cols = Math.min(COLS, frames);
  const rows = Math.ceil(frames / cols);
  const canvas = document.createElement('canvas');
  canvas.width = cols * FRAME_W;
  canvas.height = rows * FRAME_H;
  const c = canvas.getContext('2d')!;
  for (let i = 0; i < frames; i++) {
    const fx = (i % cols) * FRAME_W;
    const fy = Math.floor(i / cols) * FRAME_H;
    c.save();
    c.beginPath();
    c.rect(fx, fy, FRAME_W, FRAME_H);
    c.clip();
    c.translate(fx + ANCHOR_X, fy + ANCHOR_Y);
    draw(c, (i / frames) * PERIOD);
    c.restore();
  }
  const tex = scene.textures.addCanvas(key, canvas)!;
  for (let i = 0; i < frames; i++) tex.add(i, 0, (i % cols) * FRAME_W, Math.floor(i / cols) * FRAME_H, FRAME_W, FRAME_H);
}

function small(scene: Phaser.Scene, key: string, size: number, draw: (c: CanvasRenderingContext2D) => void): void {
  if (scene.textures.exists(key)) return;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const c = canvas.getContext('2d')!;
  c.translate(size / 2, size / 2);
  draw(c);
  scene.textures.addCanvas(key, canvas);
}

/** Gera todas as texturas de agentes. Retorna o tempo gasto (ms) e a memória estimada (MB). */
export function bakeArt(scene: Phaser.Scene): { ms: number; mb: number } {
  const t0 = performance.now();
  let bytes = 0;
  const count = (frames: number) => {
    const cols = Math.min(COLS, frames);
    bytes += cols * FRAME_W * Math.ceil(frames / cols) * FRAME_H * 4;
  };
  for (const res of EXTRACTOR_RES) {
    sheet(scene, artKey('extrator', res), FRAMES, (c, tt) => drawAgentArt(c, 'extrator', tt, res));
    count(FRAMES);
  }
  for (const t of ANIMATED) {
    if (t === 'extrator') continue;
    sheet(scene, artKey(t), FRAMES, (c, tt) => drawAgentArt(c, t, tt));
    count(FRAMES);
  }
  for (const t of STATIC) {
    sheet(scene, artKey(t), 1, (c) => drawAgentArt(c, t, 0));
    count(1);
  }
  small(scene, 'core-basic', 40, (c) => drawCoreArt(c, false));
  small(scene, 'core-adv', 60, (c) => drawCoreArt(c, true));
  small(scene, 'core-ring', 28, (c) => drawRingArt(c));
  return { ms: Math.round(performance.now() - t0), mb: Math.round(bytes / 1024 / 1024) };
}
