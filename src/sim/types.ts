export type ResourceId =
  | 'gelo'
  | 'regolito'
  | 'minerio'
  | 'telemetria'
  | 'agua'
  | 'modelo'
  | 'o2'
  | 'lingote'
  | 'painel'
  | 'modulo'
  | 'mapa';

/** Terreno base de uma célula. `nevoa` = área ainda sem sinal (não construível). */
export type Terrain = 'planicie' | 'cratera' | 'serra' | 'rocha' | 'nevoa';

export interface Tile {
  terrain: Terrain;
  /** Recurso extraível nesta célula, se houver um nó. */
  node: ResourceId | null;
}

export type AgentType =
  | 'extrator'
  | 'sensor'
  | 'derretedor'
  | 'cartografo'
  | 'analista'
  | 'eletrolisador'
  | 'fundidor'
  | 'prensa'
  | 'construtor'
  | 'silo'
  | 'divisor'
  | 'unificador'
  | 'descarte'
  | 'verificador'
  | 'plataforma'
  | 'painel_solar';

/** ok = funcionando · bloqueado = saída travada/cheio · ocioso = sem nada para fazer */
export type AgentStatus = 'ok' | 'bloqueado' | 'ocioso';

/** Um item físico ou de dados. `bad` = defeituoso (alucinação): parece normal, mas estraga quem o consome. */
export interface Item {
  res: ResourceId;
  bad: boolean;
}

export interface Agent {
  id: number;
  type: AgentType;
  /** Canto superior esquerdo, em células. */
  x: number;
  y: number;
  /** Recurso extraído (só Extrator). */
  resource: ResourceId | null;
  /** Versão montada na Oficina (só agentes de IA). */
  designId: string | null;
  /** Total de itens produzidos (ou destruídos, no Descarte). */
  produced: number;
  /** Progresso do ciclo atual (0..1). */
  progress: number;
  /** Se há um ciclo em andamento (ingredientes já consumidos). */
  running: boolean;
  /** Ingredientes recebidos e ainda não consumidos (máquinas com receita). */
  inputs: Partial<Record<ResourceId, number>>;
  /** Quantos desses ingredientes são defeituosos. */
  badInputs: Partial<Record<ResourceId, number>>;
  /** Qualidade herdada do ciclo atual: (fração de ingredientes bons)². 1 = todos bons. */
  quality: number;
  /** Itens defeituosos por alucinação do próprio agente. */
  defects: number;
  /** Itens defeituosos por culpa de ingredientes defeituosos (defeitos herdados). */
  inherited: number;
  /** Itens guardados: buffer de saída (máquinas/Divisor/Unificador) ou estoque (Silo). */
  buffer: Item[];
  /** Verificador: itens aguardando inspeção e itens rejeitados aguardando saída. */
  queue: Item[];
  rejects: Item[];
  /** Verificador: defeituosos pegos, bons rejeitados por engano, defeituosos que passaram. */
  caught: number;
  falsePos: number;
  missed: number;
  /** Sujeira do bioma onde o agente está (pp de confiabilidade). */
  biome: number;
  status: AgentStatus;
  /** Segundos seguidos em estado bloqueado. */
  stalledFor: number;
  /** Segundos desde o último item enviado para uma linha. */
  sinceOut: number;
  /** Item que chegou e esta máquina não usa (trava a linha), se houver. */
  refusing: ResourceId | null;
  /** Índices de rodízio para entradas e saídas. */
  rrIn: number;
  rrOut: number;
}

export interface ItemOnLine {
  res: ResourceId;
  bad: boolean;
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

export interface PowerState {
  /** kW disponíveis (cápsula + painéis). */
  supply: number;
  /** kW pedidos pelos agentes que querem trabalhar. */
  demand: number;
  /** Fração de velocidade aplicada (0..1). */
  factor: number;
}

export interface ArcaState {
  /** Fase atual (índice em ARCA_PHASES). */
  phase: number;
  delivered: number;
  rejected: number;
  /** Todas as fases concluídas. */
  done: boolean;
}
