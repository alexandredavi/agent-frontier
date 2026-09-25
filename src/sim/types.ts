export type ResourceId = 'gelo' | 'regolito';

/** Terreno base de uma célula. `nevoa` = área ainda sem sinal (não construível). */
export type Terrain = 'planicie' | 'cratera' | 'rocha' | 'nevoa';

export interface Tile {
  terrain: Terrain;
  /** Recurso extraível nesta célula, se houver um nó. */
  node: ResourceId | null;
}

export type AgentType = 'extrator';

export interface Agent {
  id: number;
  type: AgentType;
  /** Canto superior esquerdo, em células. */
  x: number;
  y: number;
  resource: ResourceId;
  /** Total produzido desde a construção. */
  produced: number;
  /** Fração acumulada do próximo item (0..1). */
  acc: number;
}
