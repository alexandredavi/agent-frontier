import type { World } from '../sim/world';
import { drawMiniAgents, drawMiniTerrain, miniFrame } from './iso/minimap';
import { PALETTES, terraStage } from './iso/terrain';

/** Miniatura do mapa para a lista de saves (PNG pequeno em data URL). */
export function makeThumb(world: World, w = 132, h = 70): string | undefined {
  try {
    const f = miniFrame(world.map, w - 4, h - 4);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const c = canvas.getContext('2d')!;
    c.translate(Math.round((w - f.width) / 2), Math.round((h - f.height) / 2));
    drawMiniTerrain(c, world.map, PALETTES[terraStage(world.arca)], f);
    drawMiniAgents(c, world.agents.values(), f, 3);
    return canvas.toDataURL('image/png');
  } catch {
    return undefined;
  }
}
