import Phaser from 'phaser';
import { AGENT_DEFS, AGENT_SIZE } from '../sim/defs';
import { LANDING_POINT } from '../sim/mapData';
import type { Agent } from '../sim/types';
import { PLACE_ERROR_TEXT } from '../sim/world';
import { drawAgentIcon } from './icons';
import { writeSave } from './persistence';
import type { GameState } from './state';
import { AGENT_COLOR, FONT, RESOURCE_COLOR, TERRAIN_COLOR, TILE, UI } from './theme';

interface AgentView {
  container: Phaser.GameObjects.Container;
  label: Phaser.GameObjects.Text;
  lastProduced: number;
}

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.5;
const AUTOSAVE_MS = 10_000;

export class WorldScene extends Phaser.Scene {
  private views = new Map<number, AgentView>();
  private ghost!: Phaser.GameObjects.Graphics;
  private ghostText!: Phaser.GameObjects.Text;
  private hoverCell: { x: number; y: number } | null = null;
  private dragging = false;
  private sinceSave = 0;
  private lastNow = performance.now();

  constructor(private readonly state: GameState) {
    super({ key: 'world' });
  }

  create(): void {
    const { map } = this.state.world;
    this.drawMap();

    this.ghost = this.add.graphics().setDepth(20);
    this.ghostText = this.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '12px', color: '#ffffff', backgroundColor: '#000000aa', padding: { x: 6, y: 3 } })
      .setDepth(21)
      .setVisible(false);

    const cam = this.cameras.main;
    cam.setBounds(-TILE * 6, -TILE * 6, map.width * TILE + TILE * 12, map.height * TILE + TILE * 12);
    cam.centerOn((LANDING_POINT.x + 1) * TILE, (LANDING_POINT.y + 1) * TILE);
    cam.setZoom(1.2);

    this.rebuildViews();
    this.setupInput();

    this.state.events.on('world-replaced', this.rebuildViews, this);
    this.state.events.on('tool', () => this.redrawGhost(), this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.state.events.off('world-replaced', this.rebuildViews, this));

    const save = () => writeSave(this.state.world);
    window.addEventListener('beforeunload', save);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && save());
  }

  update(_time: number, delta: number): void {
    const world = this.state.world;
    // Tempo real medido direto (o delta do Phaser é suavizado e pode subestimar quedas de FPS)
    const now = performance.now();
    const realDt = (now - this.lastNow) / 1000;
    this.lastNow = now;
    this.state.clock.advance(realDt, (dt) => world.tick(dt));

    for (const [id, view] of this.views) {
      const agent = world.agents.get(id);
      if (!agent) continue;
      if (agent.produced !== view.lastProduced) {
        view.lastProduced = agent.produced;
        view.label.setText(String(agent.produced));
        this.popItem(agent);
      }
    }

    this.sinceSave += delta;
    if (this.sinceSave >= AUTOSAVE_MS) {
      this.sinceSave = 0;
      if (writeSave(world)) this.state.events.emit('saved');
    }
  }

  // ---------- desenho do mapa ----------

  private drawMap(): void {
    const { map } = this.state.world;
    const g = this.make.graphics({}, false);

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const tile = map.get(x, y)!;
        g.fillStyle(TERRAIN_COLOR[tile.terrain], 1);
        g.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }

    // Grade sutil nas áreas construíveis
    g.lineStyle(1, 0xffffff, 0.04);
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const t = map.terrainAt(x, y);
        if (t === 'planicie' || t === 'cratera') g.strokeRect(x * TILE + 0.5, y * TILE + 0.5, TILE - 1, TILE - 1);
      }
    }

    // Rochas: pedras simples
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (map.terrainAt(x, y) !== 'rocha') continue;
        g.fillStyle(0x6e665d, 1);
        g.fillCircle(x * TILE + 12, y * TILE + 14, 8);
        g.fillStyle(0x7d746a, 1);
        g.fillCircle(x * TILE + 21, y * TILE + 20, 6);
      }
    }

    // Névoa / sinal fraco: hachura diagonal
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

    // Nós de recurso: células com cristais/pedaços coloridos
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
    g.generateTexture('map', map.width * TILE, map.height * TILE);
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
    drawAgentIcon(g, agent.type, size / 2, size / 2 - 2, 14, color);
    // Indicador do recurso extraído
    g.fillStyle(RESOURCE_COLOR[agent.resource], 1);
    g.fillCircle(size - 12, 12, 5);

    const label = this.add
      .text(size / 2, size - 10, String(agent.produced), { fontFamily: FONT, fontSize: '11px', color: '#e8ecf3' })
      .setOrigin(0.5);

    const container = this.add.container(agent.x * TILE, agent.y * TILE, [g, label]).setDepth(10);
    container.setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: container, scale: 1, alpha: 1, duration: 180, ease: 'Back.Out' });

    this.views.set(agent.id, { container, label, lastProduced: agent.produced });
  }

  private removeView(id: number): void {
    const view = this.views.get(id);
    if (!view) return;
    this.views.delete(id);
    this.tweens.add({ targets: view.container, scale: 0.6, alpha: 0, duration: 140, onComplete: () => view.container.destroy() });
  }

  private popItem(agent: Agent): void {
    const cx = (agent.x + AGENT_SIZE / 2) * TILE;
    const cy = agent.y * TILE + 6;
    const dot = this.add.circle(cx, cy, 4, RESOURCE_COLOR[agent.resource]).setDepth(15);
    this.tweens.add({ targets: dot, y: cy - 22, alpha: 0, duration: 700, ease: 'Quad.Out', onComplete: () => dot.destroy() });
  }

  // ---------- entrada ----------

  private setupInput(): void {
    this.input.mouse?.disableContextMenu();
    const cam = this.cameras.main;

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown() || p.middleButtonDown()) {
        this.dragging = true;
        return;
      }
      if (this.state.isOverUI(p.x, p.y)) return;
      this.handleClick(p);
    });

    this.input.on('pointerup', () => (this.dragging = false));

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.dragging && (p.rightButtonDown() || p.middleButtonDown())) {
        cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
        cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
      }
      this.updateHover(p);
    });

    this.input.on('wheel', (p: Phaser.Input.Pointer, _objs: unknown, _dx: number, dy: number) => {
      const before = cam.getWorldPoint(p.x, p.y);
      cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), ZOOM_MIN, ZOOM_MAX));
      cam.preRender();
      const after = cam.getWorldPoint(p.x, p.y);
      cam.scrollX += before.x - after.x;
      cam.scrollY += before.y - after.y;
      this.updateHover(p);
    });

    const kb = this.input.keyboard!;
    kb.on('keydown-ONE', () => this.state.toggleBuild('extrator'));
    kb.on('keydown-ESC', () => this.state.setTool({ kind: 'none' }));
    kb.on('keydown-Q', () => this.state.setTool({ kind: 'none' }));
    kb.on('keydown-X', () => this.demolishHovered());
    kb.on('keydown-DELETE', () => this.demolishHovered());
    kb.on('keydown-SPACE', () => this.state.togglePause());
    kb.on('keydown-P', () => this.state.togglePause());

    // WASD / setas para mover a câmera
    const keys = kb.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>;
    this.events.on(Phaser.Scenes.Events.UPDATE, (_t: number, delta: number) => {
      const v = (delta / 1000) * 600 / cam.zoom;
      if (keys.A.isDown || keys.LEFT.isDown) cam.scrollX -= v;
      if (keys.D.isDown || keys.RIGHT.isDown) cam.scrollX += v;
      if (keys.W.isDown || keys.UP.isDown) cam.scrollY -= v;
      if (keys.S.isDown || keys.DOWN.isDown) cam.scrollY += v;
    });
  }

  /** Célula (canto superior esquerdo do 2x2) sob o ponteiro, centrando o agente no cursor. */
  private cellUnder(p: Phaser.Input.Pointer): { x: number; y: number; hx: number; hy: number } {
    const wp = this.cameras.main.getWorldPoint(p.x, p.y);
    return {
      x: Math.round(wp.x / TILE - AGENT_SIZE / 2),
      y: Math.round(wp.y / TILE - AGENT_SIZE / 2),
      hx: Math.floor(wp.x / TILE),
      hy: Math.floor(wp.y / TILE),
    };
  }

  private updateHover(p: Phaser.Input.Pointer): void {
    const c = this.cellUnder(p);
    this.hoverCell = { x: c.x, y: c.y };
    this.redrawGhost(p);
  }

  private redrawGhost(p?: Phaser.Input.Pointer): void {
    this.ghost.clear();
    this.ghostText.setVisible(false);
    const tool = this.state.tool;
    const pointer = p ?? this.input.activePointer;
    if (tool.kind !== 'build' || !this.hoverCell || this.state.isOverUI(pointer.x, pointer.y)) return;

    const { x, y } = this.hoverCell;
    const check = this.state.world.canPlace(tool.type, x, y);
    const color = check.ok ? UI.ok : UI.bad;
    const size = AGENT_SIZE * TILE;
    this.ghost.fillStyle(color, 0.22);
    this.ghost.fillRoundedRect(x * TILE + 2, y * TILE + 2, size - 4, size - 4, 8);
    this.ghost.lineStyle(2, color, 0.9);
    this.ghost.strokeRoundedRect(x * TILE + 2, y * TILE + 2, size - 4, size - 4, 8);

    const text = check.ok
      ? `${AGENT_DEFS[tool.type].name} · ${AGENT_DEFS[tool.type].ratePerMin}/min`
      : PLACE_ERROR_TEXT[check.reason];
    this.ghostText
      .setText(text)
      .setPosition(x * TILE + size + 6, y * TILE)
      .setScale(1 / this.cameras.main.zoom)
      .setVisible(true);
  }

  private handleClick(p: Phaser.Input.Pointer): void {
    const tool = this.state.tool;
    if (tool.kind !== 'build') return;
    const { x, y } = this.cellUnder(p);
    const res = this.state.world.place(tool.type, x, y);
    if (res.ok) {
      this.addView(res.agent);
      this.state.events.emit('agent-added', res.agent);
    } else {
      this.state.toast(PLACE_ERROR_TEXT[res.reason]);
    }
    this.redrawGhost(p);
  }

  private demolishHovered(): void {
    const p = this.input.activePointer;
    const c = this.cellUnder(p);
    const agent = this.state.world.agentAt(c.hx, c.hy);
    if (!agent) return;
    this.state.world.remove(agent.id);
    this.removeView(agent.id);
    this.state.events.emit('agent-removed', agent);
    this.redrawGhost(p);
  }
}
