export type ResourceId = 'gelo' | 'regolito';

/** Terreno base de uma célula. `nevoa` = área ainda sem sinal (não construível). */
export type Terrain = 'planicie' | 'cratera' | 'rocha' | 'nevoa';

export interface Tile {
  terrain: Terrain;
  /** Recurso extraível nesta célula, se houver um nó. */
  node: ResourceId | null;
}

export type AgentType = 'extrator' | 'silo' | 'divisor' | 'unificador';

/** ok = funcionando · bloqueado = saída travada/cheio · ocioso = sem nada para fazer */
export type AgentStatus = 'ok' | 'bloqueado' | 'ocioso';

export interface Agent {
  id: number;
  type: AgentType;
  /** Canto superior esquerdo, em células. */
  x: number;
  y: number;
  /** Recurso extraído (só Extrator). */
  resource: ResourceId | null;
  /** Total produzido desde a construção (Extrator). */
  produced: number;
  /** Fração acumulada do próximo item (0..1). */
  acc: number;
  /** Itens guardados: buffer de saída (Extrator/Divisor/Unificador) ou estoque (Silo). */
  buffer: ResourceId[];
  status: AgentStatus;
  /** Segundos seguidos em estado bloqueado. */
  stalledFor: number;
  /** Segundos desde o último item enviado para uma linha. */
  sinceOut: number;
  /** Índices de rodízio para entradas e saídas. */
  rrIn: number;
  rrOut: number;
}

export interface ItemOnLine {
  res: ResourceId;
  /** Distância percorrida desde o início da linha, em células. */
  pos: number;
}

export interface Connection {
  id: number;
  from: number;
  to: number;
  /** Comprimento percorrido pelos itens, em células. */
  length: number;
  /** Itens na linha, do mais adiantado (índice 0) para o mais recente. */
  items: ItemOnLine[];
  /** Segundos até a linha aceitar o próximo item (limita a vazão). */
  cooldown: number;
}
