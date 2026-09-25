import { AGENT_DEFS, AGENT_SIZE } from './defs';
import type { GameMap } from './map';
import type { Agent, AgentType, ResourceId } from './types';

export type PlaceError =
  | 'fora-do-mapa'
  | 'sinal-fraco'
  | 'terreno'
  | 'ocupado'
  | 'sem-no'
  | 'nos-misturados';

export const PLACE_ERROR_TEXT: Record<PlaceError, string> = {
  'fora-do-mapa': 'Fora do mapa',
  'sinal-fraco': 'Área sem sinal — ainda não mapeada',
  terreno: 'Terreno rochoso — não dá para construir',
  ocupado: 'Já existe um agente aqui',
  'sem-no': 'O Extrator precisa ficar sobre um nó de recurso',
  'nos-misturados': 'Cobre dois recursos diferentes',
};

export type PlaceCheck = { ok: true; resource: ResourceId } | { ok: false; reason: PlaceError };

export class World {
  readonly agents = new Map<number, Agent>();
  readonly stock: Record<ResourceId, number> = { gelo: 0, regolito: 0 };
  /** Tempo de jogo decorrido, em segundos. */
  time = 0;

  private readonly occupancy: Int32Array;
  private nextId = 1;

  constructor(readonly map: GameMap) {
    this.occupancy = new Int32Array(map.width * map.height);
  }

  canPlace(_type: AgentType, x: number, y: number): PlaceCheck {
    const found = new Set<ResourceId>();
    for (let dy = 0; dy < AGENT_SIZE; dy++) {
      for (let dx = 0; dx < AGENT_SIZE; dx++) {
        const cx = x + dx;
        const cy = y + dy;
        const tile = this.map.get(cx, cy);
        if (!tile) return { ok: false, reason: 'fora-do-mapa' };
        if (tile.terrain === 'nevoa') return { ok: false, reason: 'sinal-fraco' };
        if (tile.terrain === 'rocha') return { ok: false, reason: 'terreno' };
        if (this.occupancy[cy * this.map.width + cx] !== 0) return { ok: false, reason: 'ocupado' };
        if (tile.node) found.add(tile.node);
      }
    }
    if (found.size === 0) return { ok: false, reason: 'sem-no' };
    if (found.size > 1) return { ok: false, reason: 'nos-misturados' };
    return { ok: true, resource: [...found][0] };
  }

  place(type: AgentType, x: number, y: number): { ok: true; agent: Agent } | { ok: false; reason: PlaceError } {
    const check = this.canPlace(type, x, y);
    if (!check.ok) return check;
    const agent: Agent = { id: this.nextId++, type, x, y, resource: check.resource, produced: 0, acc: 0 };
    this.agents.set(agent.id, agent);
    this.fill(agent, agent.id);
    return { ok: true, agent };
  }

  remove(id: number): Agent | undefined {
    const agent = this.agents.get(id);
    if (!agent) return undefined;
    this.fill(agent, 0);
    this.agents.delete(id);
    return agent;
  }

  agentAt(x: number, y: number): Agent | undefined {
    if (!this.map.inBounds(x, y)) return undefined;
    const id = this.occupancy[y * this.map.width + x];
    return id ? this.agents.get(id) : undefined;
  }

  /** Avança a simulação em `dt` segundos de jogo. */
  tick(dt: number): void {
    this.time += dt;
    for (const agent of this.agents.values()) {
      const def = AGENT_DEFS[agent.type];
      agent.acc += (def.ratePerMin / 60) * dt;
      while (agent.acc >= 1 - 1e-9) {
        agent.acc -= 1;
        agent.produced++;
        this.stock[agent.resource]++;
      }
    }
  }

  private fill(agent: Agent, value: number): void {
    for (let dy = 0; dy < AGENT_SIZE; dy++) {
      for (let dx = 0; dx < AGENT_SIZE; dx++) {
        this.occupancy[(agent.y + dy) * this.map.width + agent.x + dx] = value;
      }
    }
  }
}
