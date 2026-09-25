import { GameMap } from './map';
import { World } from './world';

/** Mapa aberto de planície para testes, com nós 2x2 em posições dadas. */
export function openMap(width: number, height: number, nodes: { x: number; y: number; c: 'r' | 'i' }[] = []): GameMap {
  const g = Array.from({ length: height }, () => Array.from({ length: width }, () => '.'));
  for (const n of nodes) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) g[n.y + dy][n.x + dx] = n.c;
  return GameMap.fromAscii(g.map((r) => r.join('')));
}

/** Mundo de teste já com o Tier 1 liberado (os testes anteriores ao M5 não tratam de tiers). */
export function testWorld(map: GameMap): World {
  const w = new World(map);
  w.tier = 1;
  return w;
}
