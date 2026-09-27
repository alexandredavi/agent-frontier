import { factoryId } from './designs';
import type { World } from './world';

/**
 * Versão em que a Oficina abre: a do agente fixado (se houver); senão mantém `currentId`
 * se ele existir e estiver liberado; senão a do Cartógrafo na barra (passo 'bancada' da MERIDIAN).
 */
export function initialWorkshopDesign(world: World, pinnedAgentId: number | null, currentId: string | null): string {
  const pinned = pinnedAgentId !== null ? world.agents.get(pinnedAgentId) : undefined;
  if (pinned?.designId && world.designs.has(pinned.designId)) return pinned.designId;
  const cur = currentId !== null ? world.designs.get(currentId) : undefined;
  if (cur && world.designUnlocked(cur)) return cur.id;
  return world.activeDesign.cartografo ?? factoryId('cartografo');
}
