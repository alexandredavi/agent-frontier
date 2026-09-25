import { AGENT_DEFS, AGENT_SIZE, CAPSULE_KW, INPUT_CYCLES, LINK, agentKw } from './defs';
import { type Design, type DesignStats, MACHINE_ROLES, designStats, factoryDesign, factoryId, isMachine } from './designs';
import type { GameMap } from './map';
import { Rng } from './rng';
import type { Agent, AgentType, Connection, PowerState, ResourceId } from './types';

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

export function newAgent(id: number, type: AgentType, x: number, y: number, resource: ResourceId | null, designId: string | null = null): Agent {
  return {
    id,
    type,
    x,
    y,
    resource,
    designId,
    produced: 0,
    progress: 0,
    running: false,
    inputs: {},
    badInputs: {},
    contaminated: false,
    defects: 0,
    wasted: 0,
    buffer: [],
    status: 'ocioso',
    stalledFor: 0,
    sinceOut: 0,
    refusing: null,
    rrIn: 0,
    rrOut: 0,
  };
}

export class World {
  readonly agents = new Map<number, Agent>();
  readonly connections = new Map<number, Connection>();
  /** Tempo de jogo decorrido, em segundos. */
  time = 0;
  power: PowerState = { supply: CAPSULE_KW, demand: 0, factor: 1 };
  /** Versões de agentes (fábrica + criadas na Oficina). */
  readonly designs = new Map<string, Design>();
  /** Versão usada na barra para cada papel. */
  readonly activeDesign: Partial<Record<AgentType, string>> = {};
  rng = new Rng();
  private statsCache = new Map<string, DesignStats>();

  private readonly occupancy: Int32Array;
  private nextId = 1;

  constructor(readonly map: GameMap) {
    this.occupancy = new Int32Array(map.width * map.height);
    for (const role of MACHINE_ROLES) {
      const d = factoryDesign(role);
      this.designs.set(d.id, d);
      this.activeDesign[role] = d.id;
    }
  }

  // ---------- versões (Oficina) ----------

  designOf(a: Agent): Design | undefined {
    return a.designId ? this.designs.get(a.designId) : undefined;
  }

  stats(designId: string): DesignStats {
    let st = this.statsCache.get(designId);
    if (!st) {
      st = designStats(this.designs.get(designId)!);
      this.statsCache.set(designId, st);
    }
    return st;
  }

  /** Próximo número de versão para um papel. */
  nextVersion(role: AgentType): number {
    let v = 0;
    for (const d of this.designs.values()) if (d.role === role) v = Math.max(v, d.version);
    return v + 1;
  }

  addDesign(d: Design): void {
    this.designs.set(d.id, d);
    this.statsCache.delete(d.id);
  }

  setActive(designId: string): void {
    const d = this.designs.get(designId);
    if (d) this.activeDesign[d.role] = d.id;
  }

  agentsUsing(designId: string): Agent[] {
    return [...this.agents.values()].filter((a) => a.designId === designId);
  }

  /** Troca a versão dos agentes de `fromId` para `toId` (mesmo papel). Retorna quantos mudaram. */
  applyDesign(fromId: string, toId: string): number {
    const to = this.designs.get(toId);
    if (!to) return 0;
    let n = 0;
    for (const a of this.agentsUsing(fromId)) {
      if (a.type !== to.role) continue;
      a.designId = toId;
      n++;
    }
    return n;
  }

  /** Consumo de um agente trabalhando (kW), já com os módulos. */
  agentPower(a: Agent): number {
    const base = agentKw(a.type, a.resource);
    return a.designId ? base * this.stats(a.designId).kwMult : base;
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

  /** Constrói um agente. Para agentes de IA, `designId` escolhe a versão (padrão: a ativa na barra). */
  place(type: AgentType, x: number, y: number, designId?: string): { ok: true; agent: Agent } | { ok: false; reason: PlaceError } {
    let design: string | null = null;
    if (designId && this.designs.has(designId)) {
      type = this.designs.get(designId)!.role;
      design = designId;
    } else if (isMachine(type)) {
      design = this.activeDesign[type] ?? factoryId(type);
    }
    const check = this.canPlace(type, x, y);
    if (!check.ok) return check;
    const agent = newAgent(this.nextId++, type, x, y, check.resource, design);
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

  // ---------- estoque e energia ----------

  /** Estoque bom = itens não defeituosos guardados em Silos. */
  stockTotals(): Partial<Record<ResourceId, number>> {
    return this.siloCount(false);
  }

  /** Itens defeituosos guardados em Silos. */
  defectTotals(): Partial<Record<ResourceId, number>> {
    return this.siloCount(true);
  }

  private siloCount(bad: boolean): Partial<Record<ResourceId, number>> {
    const totals: Partial<Record<ResourceId, number>> = {};
    for (const a of this.agents.values()) {
      if (a.type !== 'silo') continue;
      for (const it of a.buffer) if (it.bad === bad) totals[it.res] = (totals[it.res] ?? 0) + 1;
    }
    return totals;
  }

  powerSupply(): number {
    let kw = CAPSULE_KW;
    for (const a of this.agents.values()) kw += AGENT_DEFS[a.type].generates ?? 0;
    return kw;
  }

  // ---------- regras de receita ----------

  /** Quanto de um ingrediente a máquina aceita guardar. */
  private inputCap(a: Agent, res: ResourceId): number {
    const need = AGENT_DEFS[a.type].recipe?.inputs[res];
    return need ? need * INPUT_CYCLES : 0;
  }

  /** O agente aceita receber este item agora? */
  accepts(a: Agent, res: ResourceId): boolean {
    const def = AGENT_DEFS[a.type];
    switch (a.type) {
      case 'silo':
      case 'divisor':
      case 'unificador':
        return a.buffer.length < def.capacity;
      case 'descarte':
        return true;
      default:
        return def.recipe ? (a.inputs[res] ?? 0) < this.inputCap(a, res) : false;
    }
  }

  private receive(a: Agent, res: ResourceId, bad: boolean): void {
    switch (a.type) {
      case 'silo':
      case 'divisor':
      case 'unificador':
        a.buffer.push({ res, bad });
        break;
      case 'descarte':
        a.produced++;
        break;
      default:
        a.inputs[res] = (a.inputs[res] ?? 0) + 1;
        if (bad) a.badInputs[res] = (a.badInputs[res] ?? 0) + 1;
    }
  }

  /** Tem ingredientes e espaço na saída para começar um ciclo? */
  private canStart(a: Agent): boolean {
    const def = AGENT_DEFS[a.type];
    const r = def.recipe;
    if (!r) return false;
    if (a.buffer.length + r.output.n > def.capacity) return false;
    for (const [res, n] of Object.entries(r.inputs)) if ((a.inputs[res as ResourceId] ?? 0) < n!) return false;
    return true;
  }

  /** Consome os ingredientes. Cada unidade tirada pode ser uma das defeituosas guardadas. */
  private start(a: Agent): void {
    const r = AGENT_DEFS[a.type].recipe!;
    a.contaminated = false;
    for (const [key, n] of Object.entries(r.inputs)) {
      const res = key as ResourceId;
      for (let i = 0; i < n!; i++) {
        const total = a.inputs[res] ?? 0;
        const bad = a.badInputs[res] ?? 0;
        if (bad > 0 && this.rng.next() < bad / total) {
          a.badInputs[res] = bad - 1;
          a.contaminated = true;
        }
        a.inputs[res] = total - 1;
      }
    }
    a.running = true;
  }

  /** Termina o ciclo: ingrediente defeituoso = ciclo perdido; senão, cada item pode sair defeituoso. */
  private finish(a: Agent): void {
    const r = AGENT_DEFS[a.type].recipe!;
    a.running = false;
    if (a.contaminated) {
      a.contaminated = false;
      a.wasted++;
      return;
    }
    const res = r.output.res ?? a.resource;
    const rel = a.designId ? this.stats(a.designId).reliability : 100;
    if (res) {
      for (let i = 0; i < r.output.n; i++) {
        const bad = rel < 100 && this.rng.chance(1 - rel / 100);
        if (bad) a.defects++;
        a.buffer.push({ res, bad });
      }
    }
    a.produced += r.output.n;
  }

  // ---------- simulação ----------

  /** Avança a simulação em `dt` segundos de jogo. */
  tick(dt: number): void {
    this.time += dt;
    const interval = 60 / LINK.ratePerMin;

    // 1. Relógio das linhas
    for (const c of this.connections.values()) c.cooldown = Math.max(0, c.cooldown - dt);

    // 2. Energia: quem quer trabalhar neste passo, e quanto isso pede
    const workers: Agent[] = [];
    let demand = 0;
    for (const a of this.agents.values()) {
      if (!AGENT_DEFS[a.type].recipe) continue;
      if (!a.running && this.canStart(a)) this.start(a);
      if (a.running) {
        workers.push(a);
        demand += this.agentPower(a);
      }
    }
    const supply = this.powerSupply();
    const factor = demand <= supply ? 1 : supply / demand;
    this.power = { supply, demand, factor };

    // 3. Produção (ciclos), na velocidade que a energia permite
    for (const a of workers) {
      const cycle = AGENT_DEFS[a.type].recipe!.cycle;
      const speed = a.designId ? this.stats(a.designId).speed : 1;
      a.progress += (dt * factor * speed) / cycle;
      while (a.running && a.progress >= 1 - EPS) {
        this.finish(a);
        a.progress -= 1;
        if (this.canStart(a)) this.start(a);
        else a.progress = 0;
      }
    }

    // 4. Movimento dos itens nas linhas (com fila quando a frente trava)
    for (const c of this.connections.values()) {
      let limit = c.length;
      for (const item of c.items) {
        item.pos = Math.min(item.pos + LINK.speed * dt, limit);
        limit = item.pos - LINK.gap;
      }
    }

    // 5. Entregas: cada destino atende suas entradas em rodízio
    for (const a of this.agents.values()) {
      const ins = this.inputsOf(a.id);
      a.refusing = null;
      if (ins.length === 0) continue;
      const recipe = AGENT_DEFS[a.type].recipe;
      let delivered = true;
      while (delivered) {
        delivered = false;
        for (let k = 0; k < ins.length; k++) {
          const idx = (a.rrIn + k) % ins.length;
          const c = ins[idx];
          const front = c.items[0];
          if (!front || front.pos < c.length - EPS) continue;
          if (this.accepts(a, front.res)) {
            c.items.shift();
            this.receive(a, front.res, front.bad);
            a.rrIn = (idx + 1) % ins.length;
            delivered = true;
            break;
          }
          if (recipe && !(front.res in recipe.inputs)) a.refusing = front.res;
        }
      }
    }

    // 6. Saídas: buffers alimentam as linhas (Divisor em rodízio, pulando linhas travadas)
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
            const it = a.buffer.shift()!;
            c.items.push({ res: it.res, bad: it.bad, pos: 0 });
            c.cooldown = interval;
            a.rrOut = (idx + 1) % outs.length;
            a.sinceOut = 0;
            sent = true;
            break;
          }
        }
      }
    }

    // 7. Estado de cada agente
    for (const a of this.agents.values()) {
      a.status = this.computeStatus(a);
      a.stalledFor = a.status === 'bloqueado' ? a.stalledFor + dt : 0;
    }
  }

  private computeStatus(a: Agent): Agent['status'] {
    const def = AGENT_DEFS[a.type];
    // Cheio só conta como bloqueado se também não conseguiu enviar nada há um tempo
    // (com fluxo no limite da linha, o buffer enche por instantes entre um envio e outro).
    const stuck = a.sinceOut > 60 / LINK.ratePerMin + 0.2;
    if (a.refusing) return 'bloqueado';
    if (def.recipe) {
      if (a.running) return 'ok';
      const outFull = a.buffer.length + def.recipe.output.n > def.capacity;
      return outFull && stuck ? 'bloqueado' : outFull ? 'ok' : 'ocioso';
    }
    switch (a.type) {
      case 'painel_solar':
        return 'ok';
      case 'descarte':
        return this.inputsOf(a.id).length > 0 ? 'ok' : 'ocioso';
      case 'silo':
        return a.buffer.length >= def.capacity && stuck ? 'bloqueado' : this.inputsOf(a.id).length > 0 ? 'ok' : 'ocioso';
      default: {
        if (a.buffer.length >= def.capacity && stuck) return 'bloqueado';
        return a.buffer.length > 0 || a.sinceOut < 1.5 || this.inputsOf(a.id).some((c) => c.items.length > 0) ? 'ok' : 'ocioso';
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

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
