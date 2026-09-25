import { AGENT_DEFS, AGENT_SIZE, LINK } from './defs';
import type { GameMap } from './map';
import type { Agent, AgentType, Connection, ResourceId } from './types';

export type PlaceError = 'fora-do-mapa' | 'sinal-fraco' | 'terreno' | 'ocupado' | 'sem-no' | 'nos-misturados';

export const PLACE_ERROR_TEXT: Record<PlaceError, string> = {
  'fora-do-mapa': 'Fora do mapa',
  'sinal-fraco': 'Área sem sinal — ainda não mapeada',
  terreno: 'Terreno rochoso — não dá para construir',
  ocupado: 'Já existe um agente aqui',
  'sem-no': 'O Extrator precisa ficar sobre um nó de recurso',
  'nos-misturados': 'Cobre dois recursos diferentes',
};

export type ConnectError = 'mesmo-agente' | 'longe-demais' | 'sem-saida' | 'saidas-cheias' | 'sem-entrada' | 'entradas-cheias' | 'ja-conectado';

export const CONNECT_ERROR_TEXT: Record<ConnectError, string> = {
  'mesmo-agente': 'Solte sobre outro agente',
  'longe-demais': `Longe demais — alcance máximo ${LINK.range} células`,
  'sem-saida': 'Este agente não tem saída',
  'saidas-cheias': 'Todas as saídas deste agente já estão ligadas',
  'sem-entrada': 'O destino não recebe itens',
  'entradas-cheias': 'Todas as entradas do destino já estão ligadas',
  'ja-conectado': 'Já existe essa conexão',
};

export type PlaceCheck = { ok: true; resource: ResourceId | null } | { ok: false; reason: PlaceError };
export type ConnectCheck = { ok: true; length: number } | { ok: false; reason: ConnectError };

const EPS = 1e-9;

/** Centro de um agente em coordenadas de célula. */
export function agentCenter(a: { x: number; y: number }): { x: number; y: number } {
  return { x: a.x + AGENT_SIZE / 2, y: a.y + AGENT_SIZE / 2 };
}

export class World {
  readonly agents = new Map<number, Agent>();
  readonly connections = new Map<number, Connection>();
  /** Tempo de jogo decorrido, em segundos. */
  time = 0;

  private readonly occupancy: Int32Array;
  private nextId = 1;

  constructor(readonly map: GameMap) {
    this.occupancy = new Int32Array(map.width * map.height);
  }

  // ---------- agentes ----------

  canPlace(type: AgentType, x: number, y: number): PlaceCheck {
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
    if (!AGENT_DEFS[type].needsNode) return { ok: true, resource: null };
    if (found.size === 0) return { ok: false, reason: 'sem-no' };
    if (found.size > 1) return { ok: false, reason: 'nos-misturados' };
    return { ok: true, resource: [...found][0] };
  }

  place(type: AgentType, x: number, y: number): { ok: true; agent: Agent } | { ok: false; reason: PlaceError } {
    const check = this.canPlace(type, x, y);
    if (!check.ok) return check;
    const agent: Agent = {
      id: this.nextId++,
      type,
      x,
      y,
      resource: check.resource,
      produced: 0,
      acc: 0,
      buffer: [],
      status: 'ocioso',
      stalledFor: 0,
      sinceOut: 0,
      rrIn: 0,
      rrOut: 0,
    };
    this.agents.set(agent.id, agent);
    this.fill(agent, agent.id);
    return { ok: true, agent };
  }

  /** Remove o agente e todas as suas conexões (itens nas linhas se perdem). */
  remove(id: number): Agent | undefined {
    const agent = this.agents.get(id);
    if (!agent) return undefined;
    for (const c of [...this.connections.values()]) {
      if (c.from === id || c.to === id) this.connections.delete(c.id);
    }
    this.fill(agent, 0);
    this.agents.delete(id);
    return agent;
  }

  agentAt(x: number, y: number): Agent | undefined {
    if (!this.map.inBounds(x, y)) return undefined;
    const id = this.occupancy[y * this.map.width + x];
    return id ? this.agents.get(id) : undefined;
  }

  // ---------- conexões ----------

  outputsOf(id: number): Connection[] {
    return [...this.connections.values()].filter((c) => c.from === id).sort((a, b) => a.id - b.id);
  }

  inputsOf(id: number): Connection[] {
    return [...this.connections.values()].filter((c) => c.to === id).sort((a, b) => a.id - b.id);
  }

  canConnect(fromId: number, toId: number): ConnectCheck {
    const from = this.agents.get(fromId);
    const to = this.agents.get(toId);
    if (!from || !to || fromId === toId) return { ok: false, reason: 'mesmo-agente' };
    const fd = AGENT_DEFS[from.type];
    const td = AGENT_DEFS[to.type];
    if (fd.maxOut === 0) return { ok: false, reason: 'sem-saida' };
    if (td.maxIn === 0) return { ok: false, reason: 'sem-entrada' };
    if ([...this.connections.values()].some((c) => c.from === fromId && c.to === toId)) return { ok: false, reason: 'ja-conectado' };
    if (this.outputsOf(fromId).length >= fd.maxOut) return { ok: false, reason: 'saidas-cheias' };
    if (this.inputsOf(toId).length >= td.maxIn) return { ok: false, reason: 'entradas-cheias' };
    const a = agentCenter(from);
    const b = agentCenter(to);
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    if (dist > LINK.range + EPS) return { ok: false, reason: 'longe-demais' };
    // Os itens viajam de borda a borda (meio agente de cada lado)
    return { ok: true, length: Math.max(LINK.gap, dist - AGENT_SIZE) };
  }

  connect(fromId: number, toId: number): { ok: true; connection: Connection } | { ok: false; reason: ConnectError } {
    const check = this.canConnect(fromId, toId);
    if (!check.ok) return check;
    const connection: Connection = { id: this.nextId++, from: fromId, to: toId, length: check.length, items: [], cooldown: 0 };
    this.connections.set(connection.id, connection);
    return { ok: true, connection };
  }

  disconnect(id: number): Connection | undefined {
    const c = this.connections.get(id);
    if (c) this.connections.delete(id);
    return c;
  }

  /** Conexão mais próxima de um ponto (em células), se estiver a menos de `tolerance` da linha. */
  connectionNear(px: number, py: number, tolerance = 0.4): Connection | undefined {
    let best: Connection | undefined;
    let bestD = tolerance;
    for (const c of this.connections.values()) {
      const a = agentCenter(this.agents.get(c.from)!);
      const b = agentCenter(this.agents.get(c.to)!);
      const d = distToSegment(px, py, a.x, a.y, b.x, b.y);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  // ---------- estoque ----------

  /** Estoque total = tudo que está guardado em Silos. */
  stockTotals(): Record<ResourceId, number> {
    const totals: Record<ResourceId, number> = { gelo: 0, regolito: 0 };
    for (const a of this.agents.values()) {
      if (a.type !== 'silo') continue;
      for (const r of a.buffer) totals[r]++;
    }
    return totals;
  }

  // ---------- simulação ----------

  /** Avança a simulação em `dt` segundos de jogo. */
  tick(dt: number): void {
    this.time += dt;
    const interval = 60 / LINK.ratePerMin;

    // 1. Relógio das linhas
    for (const c of this.connections.values()) c.cooldown = Math.max(0, c.cooldown - dt);

    // 2. Produção
    for (const a of this.agents.values()) {
      if (a.type !== 'extrator' || !a.resource) continue;
      const def = AGENT_DEFS.extrator;
      if (a.buffer.length >= def.capacity) {
        a.acc = Math.min(a.acc, 1);
        continue;
      }
      a.acc += (def.ratePerMin! / 60) * dt;
      while (a.acc >= 1 - EPS && a.buffer.length < def.capacity) {
        a.acc -= 1;
        a.produced++;
        a.buffer.push(a.resource);
      }
    }

    // 3. Movimento dos itens nas linhas (com fila quando a frente trava)
    for (const c of this.connections.values()) {
      let limit = c.length;
      for (const item of c.items) {
        item.pos = Math.min(item.pos + LINK.speed * dt, limit);
        limit = item.pos - LINK.gap;
      }
    }

    // 4. Entregas: cada destino atende suas entradas em rodízio
    for (const a of this.agents.values()) {
      const ins = this.inputsOf(a.id);
      if (ins.length === 0) continue;
      const cap = AGENT_DEFS[a.type].capacity;
      let delivered = true;
      while (delivered && a.buffer.length < cap) {
        delivered = false;
        for (let k = 0; k < ins.length; k++) {
          const idx = (a.rrIn + k) % ins.length;
          const c = ins[idx];
          const front = c.items[0];
          if (front && front.pos >= c.length - EPS && a.buffer.length < cap) {
            c.items.shift();
            a.buffer.push(front.res);
            a.rrIn = (idx + 1) % ins.length;
            delivered = true;
            break;
          }
        }
      }
    }

    // 5. Saídas: buffers alimentam as linhas (Divisor em rodízio, pulando linhas travadas)
    for (const a of this.agents.values()) {
      a.sinceOut += dt;
      const outs = this.outputsOf(a.id);
      if (outs.length === 0) continue;
      let sent = true;
      while (sent && a.buffer.length > 0) {
        sent = false;
        for (let k = 0; k < outs.length; k++) {
          const idx = (a.rrOut + k) % outs.length;
          const c = outs[idx];
          const last = c.items[c.items.length - 1];
          if (c.cooldown <= EPS && (!last || last.pos >= LINK.gap - EPS)) {
            c.items.push({ res: a.buffer.shift()!, pos: 0 });
            c.cooldown = interval;
            a.rrOut = (idx + 1) % outs.length;
            a.sinceOut = 0;
            sent = true;
            break;
          }
        }
      }
    }

    // 6. Estado de cada agente
    for (const a of this.agents.values()) {
      a.status = this.computeStatus(a);
      a.stalledFor = a.status === 'bloqueado' ? a.stalledFor + dt : 0;
    }
  }

  private computeStatus(a: Agent): Agent['status'] {
    const def = AGENT_DEFS[a.type];
    // Cheio só conta como bloqueado se também não conseguiu enviar nada há um tempo
    // (com fluxo no limite da linha, o buffer enche por instantes entre um envio e outro).
    const full = a.buffer.length >= def.capacity && a.sinceOut > 60 / LINK.ratePerMin + 0.2;
    switch (a.type) {
      case 'extrator':
        return full ? 'bloqueado' : 'ok';
      case 'silo':
        return full ? 'bloqueado' : this.inputsOf(a.id).length > 0 ? 'ok' : 'ocioso';
      default:
        if (full) return 'bloqueado';
        return a.buffer.length > 0 || a.sinceOut < 1.5 || this.inputsOf(a.id).some((c) => c.items.length > 0) ? 'ok' : 'ocioso';
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

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
