import Phaser from 'phaser';
import { AGENT_DEFS, AGENT_SIZE, INPUT_CYCLES, LINK, RESOURCES, STALL_ALERT, agentKw, outputPerMin, recipeText } from '../sim/defs';
import { LANDING_POINT } from '../sim/mapData';
import type { Agent } from '../sim/types';
import { CONNECT_ERROR_TEXT, PLACE_ERROR_TEXT, agentCenter } from '../sim/world';
import { drawAgentIcon, drawItem } from './icons';
import { writeSave } from './persistence';
import type { GameState } from './state';
import { AGENT_COLOR, FONT, LINK_COLOR, RESOURCE_COLOR, TERRAIN_COLOR, TILE, UI, WARN } from './theme';

interface AgentView {
  container: Phaser.GameObjects.Container;
  label: Phaser.GameObjects.Text;
  ring: Phaser.GameObjects.Graphics;
  labelKey: string;
  ringKey: string;
}

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.5;
const AUTOSAVE_MS = 10_000;

const STATUS_TEXT: Record<Agent['status'], string> = {
  ok: 'Funcionando',
  bloqueado: 'Bloqueado — saída travada ou cheio',
  ocioso: 'Ocioso — faltam itens para trabalhar',
};

export class WorldScene extends Phaser.Scene {
  private views = new Map<number, AgentView>();
  private links!: Phaser.GameObjects.Graphics;
  private ghost!: Phaser.GameObjects.Graphics;
  private tip!: Phaser.GameObjects.Text;
  private info!: Phaser.GameObjects.Text;
  private dragFrom: number | null = null;
  private panning = false;
  private sinceSave = 0;
  private lastNow = performance.now();

  constructor(private readonly state: GameState) {
    super({ key: 'world' });
  }

  create(): void {
    const { map } = this.state.world;
    this.drawMap();

    this.links = this.add.graphics().setDepth(5);
    this.ghost = this.add.graphics().setDepth(20);
    const tipStyle = { fontFamily: FONT, fontSize: '12px', color: '#ffffff', backgroundColor: '#000000bb', padding: { x: 6, y: 3 } };
    this.tip = this.add.text(0, 0, '', tipStyle).setDepth(22).setVisible(false);
    this.info = this.add
      .text(0, 0, '', { ...tipStyle, backgroundColor: '#141821ee', lineSpacing: 3, padding: { x: 8, y: 6 } })
      .setDepth(22)
      .setVisible(false);

    const cam = this.cameras.main;
    cam.setBounds(-TILE * 6, -TILE * 6, map.width * TILE + TILE * 12, map.height * TILE + TILE * 12);
    cam.centerOn((LANDING_POINT.x + 1) * TILE, (LANDING_POINT.y + 1) * TILE);
    cam.setZoom(1.2);

    this.rebuildViews();
    this.setupInput();

    this.state.events.on('world-replaced', this.rebuildViews, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.state.events.off('world-replaced', this.rebuildViews, this));

    const save = () => writeSave(this.state.world);
    window.addEventListener('beforeunload', save);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && save());
  }

  update(): void {
    const world = this.state.world;
    // Tempo real medido direto (o delta do Phaser é suavizado e pode subestimar quedas de FPS)
    const now = performance.now();
    const realDt = (now - this.lastNow) / 1000;
    this.lastNow = now;
    this.state.clock.advance(realDt, (dt) => world.tick(dt));

    for (const [id, view] of this.views) {
      const agent = world.agents.get(id);
      if (agent) this.refreshView(agent, view);
    }
    this.drawLinks();
    this.drawOverlay();

    this.sinceSave += realDt * 1000;
    if (this.sinceSave >= AUTOSAVE_MS) {
      this.sinceSave = 0;
      if (writeSave(world)) this.state.events.emit('saved');
    }
  }

  // ---------- mapa ----------

  private drawMap(): void {
    const { map } = this.state.world;
    const g = this.make.graphics({}, false);

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        g.fillStyle(TERRAIN_COLOR[map.get(x, y)!.terrain], 1);
        g.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }
    g.lineStyle(1, 0xffffff, 0.04);
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const t = map.terrainAt(x, y);
        if (t === 'planicie' || t === 'cratera') g.strokeRect(x * TILE + 0.5, y * TILE + 0.5, TILE - 1, TILE - 1);
      }
    }
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (map.terrainAt(x, y) !== 'rocha') continue;
        g.fillStyle(0x6e665d, 1);
        g.fillCircle(x * TILE + 12, y * TILE + 14, 8);
        g.fillStyle(0x7d746a, 1);
        g.fillCircle(x * TILE + 21, y * TILE + 20, 6);
      }
    }
    // Cordilheira: riscos de relevo
    g.lineStyle(1, 0x6b4a44, 0.5);
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (map.terrainAt(x, y) !== 'serra' || map.nodeAt(x, y)) continue;
        const k = (x * 11 + y * 7) % 4;
        g.lineBetween(x * TILE + 6 + k, y * TILE + 22, x * TILE + 12 + k, y * TILE + 14);
        g.lineBetween(x * TILE + 12 + k, y * TILE + 14, x * TILE + 18 + k, y * TILE + 22);
      }
    }
    g.lineStyle(1, 0x2a3040, 0.6);
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (map.terrainAt(x, y) !== 'nevoa') continue;
        const px = x * TILE;
        const py = y * TILE;
        g.lineBetween(px, py + TILE, px + TILE, py);
        g.lineBetween(px, py + TILE / 2, px + TILE / 2, py);
        g.lineBetween(px + TILE / 2, py + TILE, px + TILE, py + TILE / 2);
      }
    }
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const node = map.nodeAt(x, y);
        if (!node) continue;
        const c = RESOURCE_COLOR[node];
        g.fillStyle(c, 0.18);
        g.fillRect(x * TILE, y * TILE, TILE, TILE);
        g.fillStyle(c, 0.9);
        const seed = (x * 7 + y * 13) % 5;
        g.fillCircle(x * TILE + 9 + seed, y * TILE + 11, 4);
        g.fillCircle(x * TILE + 22 - seed, y * TILE + 18 + (seed % 3), 5);
        g.fillCircle(x * TILE + 12, y * TILE + 25 - (seed % 2) * 3, 3);
      }
    }
    // "Assa" o mapa numa textura: desenhado uma vez, barato de renderizar a cada quadro
    if (!this.textures.exists('map')) g.generateTexture('map', map.width * TILE, map.height * TILE);
    g.destroy();
    this.add.image(0, 0, 'map').setOrigin(0).setDepth(0);
  }

  // ---------- agentes ----------

  private rebuildViews(): void {
    for (const v of this.views.values()) v.container.destroy();
    this.views.clear();
    for (const agent of this.state.world.agents.values()) this.addView(agent);
  }

  private addView(agent: Agent): void {
    const size = AGENT_SIZE * TILE;
    const pad = 3;
    const color = AGENT_COLOR[agent.type];

    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(pad + 2, pad + 3, size - pad * 2, size - pad * 2, 8);
    g.fillStyle(0x1b1f28, 1);
    g.fillRoundedRect(pad, pad, size - pad * 2, size - pad * 2, 8);
    g.lineStyle(2, color, 1);
    g.strokeRoundedRect(pad, pad, size - pad * 2, size - pad * 2, 8);
    drawAgentIcon(g, agent.type, size / 2, size / 2 - 3, 13, color);
    if (agent.resource) {
      g.fillStyle(RESOURCE_COLOR[agent.resource], 1);
      g.fillCircle(size - 12, 12, 5);
    }

    const ring = this.add.graphics();
    const label = this.add.text(size / 2, size - 10, '', { fontFamily: FONT, fontSize: '11px', color: '#e8ecf3' }).setOrigin(0.5);
    const container = this.add.container(agent.x * TILE, agent.y * TILE, [ring, g, label]).setDepth(10);
    container.setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: container, scale: 1, alpha: 1, duration: 180, ease: 'Back.Out' });

    const view: AgentView = { container, label, ring, labelKey: '', ringKey: '' };
    this.views.set(agent.id, view);
    this.refreshView(agent, view);
  }

  private refreshView(agent: Agent, view: AgentView): void {
    const def = AGENT_DEFS[agent.type];
    let text = '';
    if (def.recipe || agent.type === 'descarte') text = String(agent.produced);
    if (agent.type === 'silo') text = `${agent.buffer.length}/${def.capacity}`;
    if (def.generates) text = `+${def.generates} kW`;
    if (text !== view.labelKey) {
      view.labelKey = text;
      view.label.setText(text);
    }

    const ringKey = agent.status === 'bloqueado' ? (agent.stalledFor >= STALL_ALERT ? 'red' : 'amber') : '';
    if (ringKey !== view.ringKey) {
      view.ringKey = ringKey;
      view.ring.clear();
      if (ringKey) {
        const size = AGENT_SIZE * TILE;
        view.ring.lineStyle(3, ringKey === 'red' ? UI.bad : WARN, 0.95);
        view.ring.strokeRoundedRect(-1, -1, size + 2, size + 2, 10);
      }
    }
  }

  private removeView(id: number): void {
    const view = this.views.get(id);
    if (!view) return;
    this.views.delete(id);
    this.tweens.add({ targets: view.container, scale: 0.6, alpha: 0, duration: 140, onComplete: () => view.container.destroy() });
  }

  // ---------- conexões ----------

  /** Pontos de início e fim visuais de uma linha (bordas dos agentes), em pixels. */
  private linkEnds(fromAgent: Agent, toAgent: Agent) {
    const a = agentCenter(fromAgent);
    const b = agentCenter(toAgent);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    // Sai da borda do quadrado 2x2 (distância até a borda na direção da linha)
    const edge = (AGENT_SIZE / 2) / Math.max(Math.abs(dx / d), Math.abs(dy / d));
    const inset = Math.min(edge, d / 2);
    return {
      sx: (a.x + (dx / d) * inset) * TILE,
      sy: (a.y + (dy / d) * inset) * TILE,
      ex: (b.x - (dx / d) * inset) * TILE,
      ey: (b.y - (dy / d) * inset) * TILE,
      ux: dx / d,
      uy: dy / d,
    };
  }

  private drawLinks(): void {
    const g = this.links;
    const world = this.state.world;
    g.clear();

    const hovered = this.hoveredConnectionId();
    for (const c of world.connections.values()) {
      const from = world.agents.get(c.from)!;
      const to = world.agents.get(c.to)!;
      const { sx, sy, ex, ey, ux, uy } = this.linkEnds(from, to);
      const color = c.id === hovered ? UI.bad : LINK_COLOR;
      g.lineStyle(6, 0x0b0d12, 0.6);
      g.lineBetween(sx, sy, ex, ey);
      g.lineStyle(3, color, 1);
      g.lineBetween(sx, sy, ex, ey);
      // Seta de direção no meio
      const mx = (sx + ex) / 2;
      const my = (sy + ey) / 2;
      const s = 6;
      g.fillStyle(color, 1);
      g.fillTriangle(mx + ux * s, my + uy * s, mx - ux * s - uy * s, my - uy * s + ux * s, mx - ux * s + uy * s, my - uy * s - ux * s);
      // Itens
      for (const item of c.items) {
        const t = c.length > 0 ? item.pos / c.length : 1;
        drawItem(g, item.res, sx + (ex - sx) * t, sy + (ey - sy) * t, 4.5, RESOURCE_COLOR[item.res]);
      }
    }
  }

  private hoveredConnectionId(): number | undefined {
    if (this.state.tool.kind !== 'none' || this.dragFrom !== null) return undefined;
    const p = this.input.activePointer;
    if (this.state.isOverUI(p.x, p.y)) return undefined;
    const wp = this.cameras.main.getWorldPoint(p.x, p.y);
    if (this.state.world.agentAt(Math.floor(wp.x / TILE), Math.floor(wp.y / TILE))) return undefined;
    return this.state.world.connectionNear(wp.x / TILE, wp.y / TILE)?.id;
  }

  // ---------- sobreposições: prévia de construção, arrasto e cartão ----------

  private drawOverlay(): void {
    const g = this.ghost;
    g.clear();
    this.tip.setVisible(false);
    this.info.setVisible(false);

    const p = this.input.activePointer;
    const cam = this.cameras.main;
    const wp = cam.getWorldPoint(p.x, p.y);
    const zoomFix = 1 / cam.zoom;
    const world = this.state.world;
    const overUI = this.state.isOverUI(p.x, p.y);
    const hoverAgent = world.agentAt(Math.floor(wp.x / TILE), Math.floor(wp.y / TILE));

    // Arrastando uma conexão
    if (this.dragFrom !== null) {
      const from = world.agents.get(this.dragFrom);
      if (!from) {
        this.dragFrom = null;
        return;
      }
      const a = agentCenter(from);
      g.lineStyle(1, 0xffffff, 0.12);
      g.strokeCircle(a.x * TILE, a.y * TILE, LINK.range * TILE);

      let color = 0xffffff;
      let text = 'Solte sobre o agente de destino';
      if (hoverAgent && hoverAgent.id !== from.id) {
        const check = world.canConnect(from.id, hoverAgent.id);
        color = check.ok ? UI.ok : UI.bad;
        text = check.ok ? `Conectar · ${LINK.ratePerMin}/min` : CONNECT_ERROR_TEXT[check.reason];
        const b = agentCenter(hoverAgent);
        g.lineStyle(2, color, 0.9);
        g.strokeRoundedRect(hoverAgent.x * TILE, hoverAgent.y * TILE, AGENT_SIZE * TILE, AGENT_SIZE * TILE, 8);
        g.lineStyle(3, color, 0.8);
        g.lineBetween(a.x * TILE, a.y * TILE, b.x * TILE, b.y * TILE);
      } else {
        g.lineStyle(3, color, 0.6);
        g.lineBetween(a.x * TILE, a.y * TILE, wp.x, wp.y);
      }
      this.tip.setText(text).setPosition(wp.x + 14 * zoomFix, wp.y + 10 * zoomFix).setScale(zoomFix).setVisible(true);
      return;
    }

    if (overUI) return;

    // Prévia de construção
    const tool = this.state.tool;
    if (tool.kind === 'build' && !hoverAgent) {
      const x = Math.round(wp.x / TILE - AGENT_SIZE / 2);
      const y = Math.round(wp.y / TILE - AGENT_SIZE / 2);
      const check = world.canPlace(tool.type, x, y);
      const color = check.ok ? UI.ok : UI.bad;
      const size = AGENT_SIZE * TILE;
      g.fillStyle(color, 0.22);
      g.fillRoundedRect(x * TILE + 2, y * TILE + 2, size - 4, size - 4, 8);
      g.lineStyle(2, color, 0.9);
      g.strokeRoundedRect(x * TILE + 2, y * TILE + 2, size - 4, size - 4, 8);
      const def = AGENT_DEFS[tool.type];
      const activeId = world.activeDesign[tool.type];
      const st = activeId ? world.stats(activeId) : null;
      const kw = (check.ok ? agentKw(tool.type, check.resource) : def.kw) * (st?.kwMult ?? 1);
      const parts = [activeId ? world.designs.get(activeId)!.name : def.name];
      if (st && st.reliability < 100) parts.push(`${Math.round(st.reliability)}%`);
      if (def.recipe) parts.push(recipeText(tool.type, check.ok ? check.resource : null));
      if (kw) parts.push(`${Math.round(kw * 10) / 10} kW`);
      if (def.generates) parts.push(`+${def.generates} kW`);
      const text = check.ok ? parts.join(' · ') : PLACE_ERROR_TEXT[check.reason];
      this.tip.setText(text).setPosition(x * TILE + size + 6, y * TILE).setScale(zoomFix).setVisible(true);
      return;
    }

    // Cartão de informação do agente
    if (hoverAgent) {
      this.info
        .setText(this.describe(hoverAgent))
        .setPosition((hoverAgent.x + AGENT_SIZE) * TILE + 6, hoverAgent.y * TILE)
        .setScale(zoomFix)
        .setVisible(true);
    } else if (this.hoveredConnectionId() !== undefined) {
      this.tip.setText('X: remover conexão').setPosition(wp.x + 14 * zoomFix, wp.y + 10 * zoomFix).setScale(zoomFix).setVisible(true);
    }
  }

  private describe(a: Agent): string {
    const def = AGENT_DEFS[a.type];
    const w = this.state.world;
    const design = w.designOf(a);
    const lines = [(design ? design.name : def.name).toUpperCase(), STATUS_TEXT[a.status]];
    if (a.refusing) lines.push(`⚠ Recebendo item que não usa: ${RESOURCES[a.refusing].name}`);
    if (def.recipe) {
      lines.push(`Receita: ${recipeText(a.type, a.resource)}`);
      const perMin = design ? Math.round(w.stats(design.id).perMin * 10) / 10 : outputPerMin(a.type);
      lines.push(`Saída: ${perMin}/min · Produzido: ${a.produced}`);
      if (design) {
        const st = w.stats(design.id);
        lines.push(`Confiabilidade: ${Math.round(st.reliability)}% · Velocidade ×${st.speed.toFixed(2)}`);
        lines.push(`Alucinações: ${a.defects} · Defeitos herdados: ${a.inherited}`);
      }
      if (a.running) lines.push(`Ciclo: ${Math.floor(a.progress * 100)}%${a.quality < 1 ? ` · qualidade herdada ${Math.round(a.quality * 100)}%` : ''}`);
      const ins = Object.entries(def.recipe.inputs);
      if (ins.length) lines.push('Ingredientes: ' + ins.map(([r, n]) => `${RESOURCES[r as keyof typeof RESOURCES].name} ${a.inputs[r as keyof typeof a.inputs] ?? 0}/${n! * INPUT_CYCLES}`).join(' · '));
      lines.push(`Consumo: ${Math.round(w.agentPower(a) * 10) / 10} kW (só trabalhando)`);
    }
    if (def.generates) lines.push(`Gera ${def.generates} kW`);
    if (a.type === 'descarte') lines.push(`Destruídos: ${a.produced}`);
    if (def.capacity > 0) lines.push(`${a.type === 'silo' ? 'Estoque' : 'Saída'}: ${a.buffer.length}/${def.capacity}`);
    if (def.maxIn > 0) lines.push(`Entradas: ${w.inputsOf(a.id).length}/${def.maxIn}`);
    if (def.maxOut > 0) lines.push(`Saídas: ${w.outputsOf(a.id).length}/${def.maxOut}`);
    lines.push(def.maxIn + def.maxOut > 0 ? 'Arraste para conectar · X: demolir' : 'X: demolir');
    return lines.join('\n');
  }

  // ---------- entrada ----------

  private setupInput(): void {
    this.input.mouse?.disableContextMenu();
    const cam = this.cameras.main;

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown() || p.middleButtonDown()) {
        this.panning = true;
        return;
      }
      if (this.state.isOverUI(p.x, p.y)) return;
      const wp = cam.getWorldPoint(p.x, p.y);
      const agent = this.state.world.agentAt(Math.floor(wp.x / TILE), Math.floor(wp.y / TILE));
      if (agent) {
        this.dragFrom = agent.id;
        return;
      }
      this.tryBuild(wp.x, wp.y);
    });

    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.button !== 0) {
        this.panning = false;
        return;
      }
      if (this.dragFrom === null) return;
      const wp = cam.getWorldPoint(p.x, p.y);
      const target = this.state.world.agentAt(Math.floor(wp.x / TILE), Math.floor(wp.y / TILE));
      const fromId = this.dragFrom;
      this.dragFrom = null;
      if (!target || target.id === fromId) return;
      const res = this.state.world.connect(fromId, target.id);
      if (!res.ok) this.state.toast(CONNECT_ERROR_TEXT[res.reason]);
    });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.panning && (p.rightButtonDown() || p.middleButtonDown())) {
        cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
        cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
      }
    });

    this.input.on('wheel', (p: Phaser.Input.Pointer, _objs: unknown, _dx: number, dy: number) => {
      const before = cam.getWorldPoint(p.x, p.y);
      cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), ZOOM_MIN, ZOOM_MAX));
      cam.preRender();
      const after = cam.getWorldPoint(p.x, p.y);
      cam.scrollX += before.x - after.x;
      cam.scrollY += before.y - after.y;
    });

    const kb = this.input.keyboard!;
    const cancel = () => {
      this.dragFrom = null;
      this.state.setTool({ kind: 'none' });
    };
    kb.on('keydown-ESC', cancel);
    kb.on('keydown-Q', cancel);
    kb.on('keydown-X', () => this.demolishHovered());
    kb.on('keydown-DELETE', () => this.demolishHovered());
    kb.on('keydown-SPACE', () => this.state.togglePause());
    kb.on('keydown-P', () => this.state.togglePause());

    const keys = kb.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>;
    this.events.on(Phaser.Scenes.Events.UPDATE, (_t: number, delta: number) => {
      const v = ((delta / 1000) * 600) / cam.zoom;
      if (keys.A.isDown || keys.LEFT.isDown) cam.scrollX -= v;
      if (keys.D.isDown || keys.RIGHT.isDown) cam.scrollX += v;
      if (keys.W.isDown || keys.UP.isDown) cam.scrollY -= v;
      if (keys.S.isDown || keys.DOWN.isDown) cam.scrollY += v;
    });
  }

  private tryBuild(wx: number, wy: number): void {
    const tool = this.state.tool;
    if (tool.kind !== 'build') return;
    const x = Math.round(wx / TILE - AGENT_SIZE / 2);
    const y = Math.round(wy / TILE - AGENT_SIZE / 2);
    const res = this.state.world.place(tool.type, x, y);
    if (res.ok) this.addView(res.agent);
    else this.state.toast(PLACE_ERROR_TEXT[res.reason]);
  }

  private demolishHovered(): void {
    const p = this.input.activePointer;
    const wp = this.cameras.main.getWorldPoint(p.x, p.y);
    const world = this.state.world;
    const agent = world.agentAt(Math.floor(wp.x / TILE), Math.floor(wp.y / TILE));
    if (agent) {
      world.remove(agent.id);
      this.removeView(agent.id);
      return;
    }
    const c = world.connectionNear(wp.x / TILE, wp.y / TILE);
    if (c) world.disconnect(c.id);
  }
}
