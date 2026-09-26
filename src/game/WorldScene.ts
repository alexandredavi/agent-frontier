import Phaser from 'phaser';
import { AGENT_DEFS, AGENT_SIZE, ARCA_PHASES, INPUT_CYCLES, LINK, RESOURCES, STALL_ALERT, agentKw, outputPerMin, recipeText } from '../sim/defs';
import { LANDING_POINT } from '../sim/mapData';
import type { Agent, Connection } from '../sim/types';
import { CONNECT_ERROR_TEXT, PLACE_ERROR_TEXT } from '../sim/world';
import { ART_HEIGHT, type ArtType, CORE_OFFSET } from './iso/art';
import { ANCHOR_X, ANCHOR_Y, FRAMES, FRAME_H, FRAME_W, artKey, bakeArt, frameCount } from './iso/bake';
import { type Pickable, TH, TW, cellAt, depthOf, footprintAt, isoCircle, pickFrontmost, toIso } from './iso/projection';
import { PALETTES, renderHaze, renderTerrain, terraStage, visualHeight } from './iso/terrain';
import { drawItem } from './icons';
import { writeSave } from './persistence';
import type { GameState } from './state';
import { FONT, RESOURCE_COLOR, UI, WARN } from './theme';

interface AgentView {
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Sprite;
  core?: Phaser.GameObjects.Image;
  ring?: Phaser.GameObjects.Image;
  status: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  bolt: Phaser.GameObjects.Graphics;
  key: string;
  frames: number;
  /** Deslocamento de fase para os agentes não animarem em sincronia. */
  phase: number;
  labelKey: string;
  statusKey: string;
  coreKey: string;
  gx: number;
  gy: number;
}

const ZOOM_MIN = 0.4;
const ZOOM_MAX = 1.6;
const AUTOSAVE_MS = 10_000;
/** Velocidade da animação dos agentes (quadros por segundo). */
const ANIM_FPS = FRAMES / 3;

const STATUS_TEXT: Record<Agent['status'], string> = {
  ok: 'Funcionando',
  bloqueado: 'Bloqueado — saída travada ou cheio',
  ocioso: 'Ocioso — faltam itens para trabalhar',
};

const STATUS_COLOR = { ok: 0x4ade80, ocioso: 0x64748b, bloqueado: WARN, alerta: UI.bad };

/** Mapa de tipos da simulação para a arte (mesmos nomes, exceto o painel). */
const artType = (t: Agent['type']): ArtType => t as ArtType;

export class WorldScene extends Phaser.Scene {
  private views = new Map<number, AgentView>();
  private links!: Phaser.GameObjects.Graphics;
  private over!: Phaser.GameObjects.Graphics;
  private tip!: Phaser.GameObjects.Text;
  private info!: Phaser.GameObjects.Text;
  private dragFrom: number | null = null;
  private downAt = { x: 0, y: 0 };
  private moving: number | null = null;
  private panning = false;
  private sinceSave = 0;
  private lastNow = performance.now();
  private animClock = 0;
  /** Medições para diagnóstico (window.agentFrontier.game.scene.getScene('world').perf). */
  perf = { bakeMs: 0, textureMb: 0, terrainMs: 0 };
  /** Estágio de terraformação desenhado agora (paleta do terreno e do céu). */
  stage = -1;
  private terrainImg?: Phaser.GameObjects.Image;
  private haze?: Phaser.GameObjects.TileSprite;
  private terrainSeq = 0;

  constructor(private readonly state: GameState) {
    super({ key: 'world', active: true });
  }

  create(): void {
    const baked = bakeArt(this);
    this.perf = { bakeMs: baked.ms, textureMb: baked.mb, terrainMs: 0 };

    // Terreno pré-renderizado numa textura só (a paleta segue a terraformação)
    const terr = this.setStage(terraStage(this.state.world.arca), false);

    this.links = this.add.graphics().setDepth(5);
    this.over = this.add.graphics().setDepth(1e6);
    const tipStyle = { fontFamily: FONT, fontSize: '12px', color: '#ffffff', backgroundColor: '#000000bb', padding: { x: 6, y: 3 } };
    this.tip = this.add.text(0, 0, '', tipStyle).setDepth(1e6 + 1).setVisible(false);
    this.info = this.add
      .text(0, 0, '', { ...tipStyle, backgroundColor: '#141821ee', lineSpacing: 3, padding: { x: 8, y: 6 } })
      .setDepth(1e6 + 1)
      .setVisible(false);

    const cam = this.cameras.main;
    cam.setBounds(terr.left, terr.top, terr.canvas.width, terr.canvas.height);
    const land = toIso(LANDING_POINT.x + 1, LANDING_POINT.y + 1);
    cam.centerOn(land.x, land.y);
    cam.setZoom(1);

    this.rebuildViews();
    this.setupInput();
    this.state.describeAgent = (a) => this.describe(a);

    this.state.events.on('world-replaced', this.onWorldReplaced, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.state.events.off('world-replaced', this.onWorldReplaced, this));

    const save = () => writeSave(this.state.world);
    window.addEventListener('beforeunload', save);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && save());
  }

  update(): void {
    const world = this.state.world;
    const now = performance.now();
    const realDt = (now - this.lastNow) / 1000;
    this.lastNow = now;
    this.state.clock.advance(realDt, (dt) => world.tick(dt));
    if (this.state.clock.speed > 0) this.animClock += realDt * Math.min(2, this.state.clock.speed);

    // Agentes criados/removidos por fora da cena (ex.: import)
    for (const a of world.agents.values()) if (!this.views.has(a.id)) this.addView(a);
    for (const id of [...this.views.keys()]) if (!world.agents.has(id)) this.removeView(id);

    for (const [id, view] of this.views) {
      const agent = world.agents.get(id);
      if (agent) this.refreshView(agent, view);
    }
    const st = terraStage(world.arca);
    if (st !== this.stage) {
      this.setStage(st, true);
      this.state.toast(`O planeta muda: estágio ${PALETTES[st].name}`);
    }
    if (this.haze) {
      this.haze.tilePositionX += realDt * 6;
      this.haze.tilePositionY += realDt * 2.5;
    }

    this.applyOcclusion();
    this.drawLinks();
    this.drawOverlay();

    this.sinceSave += realDt * 1000;
    if (this.sinceSave >= AUTOSAVE_MS) {
      this.sinceSave = 0;
      if (writeSave(world)) this.state.events.emit('saved');
    }
  }

  // ---------- terreno e terraformação ----------

  private onWorldReplaced(): void {
    this.rebuildViews();
    const st = terraStage(this.state.world.arca);
    if (st !== this.stage) this.setStage(st, false);
  }

  /** Redesenha o terreno com a paleta do estágio; com `fade`, a nova paisagem surge por cima da antiga. */
  private setStage(stage: number, fade: boolean) {
    const P = PALETTES[stage];
    const t0 = performance.now();
    const terr = renderTerrain(this.state.world.map, P, LANDING_POINT);
    this.perf.terrainMs = Math.round(performance.now() - t0);
    const key = `terrain-${++this.terrainSeq}`;
    this.textures.addCanvas(key, terr.canvas);
    const img = this.add.image(terr.left, terr.top, key).setOrigin(0).setDepth(0.001 * this.terrainSeq);
    const old = this.terrainImg;
    const oldKey = old?.texture.key;
    this.terrainImg = img;
    const drop = () => {
      old?.destroy();
      if (oldKey && this.textures.exists(oldKey)) this.textures.remove(oldKey);
    };
    if (fade && old) {
      img.setAlpha(0);
      this.tweens.add({ targets: img, alpha: 1, duration: 2500, ease: 'Sine.easeInOut', onComplete: drop });
    } else drop();

    // Véu de névoa fina (só nos estágios com atmosfera)
    if (P.haze > 0) {
      const hk = `haze-${stage}`;
      if (!this.textures.exists(hk)) this.textures.addCanvas(hk, renderHaze(P));
      if (!this.haze) {
        this.haze = this.add.tileSprite(terr.left, terr.top, terr.canvas.width, terr.canvas.height, hk).setOrigin(0).setDepth(1).setBlendMode(Phaser.BlendModes.SCREEN);
        // recorta o véu no losango do mapa (não vaza para o céu)
        const m = this.state.world.map;
        const pts = [toIso(0, 0), toIso(m.width, 0), toIso(m.width, m.height), toIso(0, m.height)];
        const shape = this.make.graphics({}, false).fillStyle(0xffffff).fillPoints(pts, true);
        this.haze.setMask(shape.createGeometryMask());
      } else this.haze.setTexture(hk);
      const target = P.haze;
      if (fade) {
        this.haze.setAlpha(0);
        this.tweens.add({ targets: this.haze, alpha: target, duration: 2500 });
      } else this.haze.setAlpha(target);
    } else if (this.haze) {
      this.haze.destroy();
      this.haze = undefined;
    }

    this.stage = stage;
    this.state.events.emit('terra-stage', stage, fade);
    return terr;
  }

  // ---------- agentes ----------

  /** Altura do chão sob o agente (relevo decorativo). */
  private baseZ(a: { x: number; y: number }): number {
    const m = this.state.world.map;
    let h = -Infinity;
    for (let dy = 0; dy < AGENT_SIZE; dy++) for (let dx = 0; dx < AGENT_SIZE; dx++) h = Math.max(h, visualHeight(m, a.x + dx, a.y + dy));
    return h;
  }

  private groundOf(a: { x: number; y: number }, z = 0) {
    return toIso(a.x + AGENT_SIZE / 2, a.y + AGENT_SIZE / 2, this.baseZ(a) + z);
  }

  private rebuildViews(): void {
    for (const v of this.views.values()) v.container.destroy();
    this.views.clear();
    for (const agent of this.state.world.agents.values()) this.addView(agent);
  }

  private addView(agent: Agent): void {
    const t = artType(agent.type);
    const key = artKey(t, agent.resource);
    const p = this.groundOf(agent);
    const sprite = this.add.sprite(0, 0, key, 0).setOrigin(ANCHOR_X / FRAME_W, ANCHOR_Y / FRAME_H);
    const status = this.add.graphics();
    const parts: Phaser.GameObjects.GameObject[] = [status, sprite];
    const view: AgentView = {
      container: this.add.container(p.x, p.y).setDepth(100 + depthOf(agent.x, agent.y) * 10),
      sprite,
      status,
      label: this.add.text(0, -ART_HEIGHT[t] - 18, '', { fontFamily: FONT, fontSize: '11px', color: '#e8ecf3', backgroundColor: '#0b0d12aa', padding: { x: 4, y: 1 } }).setOrigin(0.5),
      bolt: this.add.graphics().setVisible(false),
      key,
      frames: frameCount(t),
      phase: (agent.id * 7) % FRAMES,
      labelKey: '',
      statusKey: '',
      coreKey: '',
      gx: agent.x,
      gy: agent.y,
    };
    if (agent.designId) {
      view.core = this.add.image(CORE_OFFSET.x, CORE_OFFSET.y, 'core-basic');
      view.ring = this.add.image(CORE_OFFSET.x, CORE_OFFSET.y, 'core-ring').setVisible(false);
      parts.push(view.core, view.ring);
    }
    // Raio vermelho: trabalhando devagar por falta de energia
    view.bolt.fillStyle(0x0b0d12, 0.9).fillCircle(CORE_OFFSET.x + 16, CORE_OFFSET.y - 14, 8);
    view.bolt.fillStyle(UI.bad, 1);
    view.bolt.fillTriangle(CORE_OFFSET.x + 17, CORE_OFFSET.y - 21, CORE_OFFSET.x + 12, CORE_OFFSET.y - 13, CORE_OFFSET.x + 16, CORE_OFFSET.y - 13);
    view.bolt.fillTriangle(CORE_OFFSET.x + 15, CORE_OFFSET.y - 7, CORE_OFFSET.x + 20, CORE_OFFSET.y - 15, CORE_OFFSET.x + 16, CORE_OFFSET.y - 15);
    parts.push(view.bolt, view.label);
    view.container.add(parts);
    view.container.setScale(0.7).setAlpha(0);
    this.tweens.add({ targets: view.container, scale: 1, alpha: 1, duration: 180, ease: 'Back.Out' });
    this.views.set(agent.id, view);
    this.refreshView(agent, view);
  }

  private refreshView(agent: Agent, view: AgentView): void {
    const w = this.state.world;
    // Posição (mudou se o agente foi movido)
    if (view.gx !== agent.x || view.gy !== agent.y) {
      const p = this.groundOf(agent);
      view.container.setPosition(p.x, p.y).setDepth(100 + depthOf(agent.x, agent.y) * 10);
      view.gx = agent.x;
      view.gy = agent.y;
      const key = artKey(artType(agent.type), agent.resource);
      if (key !== view.key) {
        view.key = key;
        view.sprite.setTexture(key, 0);
      }
    }
    // Animação: só enquanto trabalha
    const working = agent.running || (agent.type === 'verificador' && agent.queue.length > 0) || agent.type === 'plataforma';
    if (view.frames > 1 && working) {
      const f = (Math.floor(this.animClock * ANIM_FPS) + view.phase) % view.frames;
      if (view.sprite.frame.name !== String(f)) view.sprite.setFrame(f);
    }
    view.bolt.setVisible(working && w.power.factor < 1);

    // Núcleo: cor = estado; Avançado = esfera maior + anel girando
    if (view.core) {
      const adv = w.designOf(agent)?.core === 'avancado';
      const stuck = agent.status === 'bloqueado' && agent.stalledFor >= STALL_ALERT;
      const col = stuck ? STATUS_COLOR.alerta : STATUS_COLOR[agent.status];
      const coreKey = `${adv}-${col}`;
      if (coreKey !== view.coreKey) {
        view.coreKey = coreKey;
        view.core.setTexture(adv ? 'core-adv' : 'core-basic').setTint(col);
        view.ring!.setVisible(adv).setTint(col);
      }
      if (adv) view.ring!.setRotation(this.animClock * 1.5);
    }

    // Contorno de bloqueio no chão (âmbar; vermelho depois de STALL_ALERT)
    const statusKey = agent.status === 'bloqueado' ? (agent.stalledFor >= STALL_ALERT ? 'red' : 'amber') : '';
    if (statusKey !== view.statusKey) {
      view.statusKey = statusKey;
      view.status.clear();
      if (statusKey) {
        view.status.lineStyle(3, statusKey === 'red' ? UI.bad : WARN, 0.95);
        view.status.strokePoints(this.diamondPts(0, 0, TW * AGENT_SIZE, TH * AGENT_SIZE), true);
      }
    }

    // Contador acima do agente
    const def = AGENT_DEFS[agent.type];
    let text = '';
    if (def.recipe || agent.type === 'descarte' || agent.type === 'plataforma') text = String(agent.produced);
    if (agent.type === 'silo') text = `${agent.buffer.length}/${def.capacity}`;
    if (def.generates) text = `+${def.generates} kW`;
    if (text !== view.labelKey) {
      view.labelKey = text;
      view.label.setText(text).setVisible(text !== '');
    }
  }

  private removeView(id: number): void {
    const view = this.views.get(id);
    if (!view) return;
    this.views.delete(id);
    this.tweens.add({ targets: view.container, scale: 0.7, alpha: 0, duration: 140, onComplete: () => view.container.destroy() });
  }

  private diamondPts(cx: number, cy: number, w: number, h: number): Phaser.Math.Vector2[] {
    return [new Phaser.Math.Vector2(cx, cy - h / 2), new Phaser.Math.Vector2(cx + w / 2, cy), new Phaser.Math.Vector2(cx, cy + h / 2), new Phaser.Math.Vector2(cx - w / 2, cy)];
  }

  /** Retângulo de mundo ocupado pelo desenho do agente. */
  private rectOf(a: Agent): Pickable {
    const p = this.groundOf(a);
    return { id: a.id, x: a.x, y: a.y, left: p.x - 64, right: p.x + 64, top: p.y - ART_HEIGHT[artType(a.type)] - 22, bottom: p.y + 34 };
  }

  /** Agente sob o ponto de mundo: o mais à frente cujo desenho (pixel não transparente) ou base contém o ponto. */
  private agentAtWorld(wx: number, wy: number): Agent | undefined {
    const world = this.state.world;
    const items = [...world.agents.values()].map((a) => this.rectOf(a));
    const hit = pickFrontmost(items, wx, wy, (it) => {
      const a = world.agents.get(it.id)!;
      const p = this.groundOf(a);
      if (Math.abs(wx - p.x) / TW + Math.abs(wy - p.y) / TH <= 1) return true; // base 2x2
      const view = this.views.get(it.id);
      if (!view) return false;
      const fx = Math.round(wx - p.x + ANCHOR_X);
      const fy = Math.round(wy - p.y + ANCHOR_Y);
      if (fx < 0 || fy < 0 || fx >= FRAME_W || fy >= FRAME_H) return false;
      const alpha = this.textures.getPixelAlpha(fx, fy, view.key, view.sprite.frame.name);
      return (alpha ?? 0) > 40;
    });
    return hit ? world.agents.get(hit.id) : undefined;
  }

  /** Transparência automática: quem está na frente do foco (agente sob o cursor, prévia ou agente movido) fica translúcido. */
  private applyOcclusion(): void {
    const world = this.state.world;
    const p = this.input.activePointer;
    const wp = this.cameras.main.getWorldPoint(p.x, p.y);
    let focus: Pickable | undefined;
    const tool = this.state.tool;
    if (this.moving !== null || tool.kind === 'build') {
      const f = this.footprintUnder(wp.x, wp.y);
      const g = this.groundOf(f);
      focus = { id: -1, x: f.x, y: f.y, left: g.x - 64, right: g.x + 64, top: g.y - 70, bottom: g.y + 34 };
    } else if (!this.state.isOverUI(p.x, p.y)) {
      const a = this.agentAtWorld(wp.x, wp.y);
      if (a) focus = this.rectOf(a);
    }
    for (const [id, view] of this.views) {
      const a = world.agents.get(id);
      if (!a) continue;
      let alpha = 1;
      if (focus && id !== focus.id && id !== this.moving) {
        const r = this.rectOf(a);
        const overlaps = r.left < focus.right && r.right > focus.left && r.top < focus.bottom && r.bottom > focus.top;
        if (overlaps && depthOf(a.x, a.y) > depthOf(focus.x, focus.y)) alpha = 0.28;
      }
      if (id === this.moving) alpha = 0.45;
      if (view.container.alpha !== alpha && !this.tweens.isTweening(view.container)) view.container.setAlpha(alpha);
    }
  }

  // ---------- conexões ----------

  /** A linha leva dados ou matéria? (pelos itens nela ou pela saída da origem) */
  private linkKind(c: Connection): 'dados' | 'materia' {
    const res = c.items[0]?.res ?? AGENT_DEFS[this.state.world.agents.get(c.from)!.type].recipe?.output.res;
    return res && RESOURCES[res].kind === 'dados' ? 'dados' : 'materia';
  }

  private linkEnds(c: Connection) {
    const w = this.state.world;
    const kind = this.linkKind(c);
    const lift = kind === 'dados' ? 30 : 20;
    return { a: this.groundOf(w.agents.get(c.from)!, lift), b: this.groundOf(w.agents.get(c.to)!, lift), kind };
  }

  private drawLinks(): void {
    const g = this.links;
    const world = this.state.world;
    g.clear();
    const hovered = this.hoveredConnectionId();
    for (const c of world.connections.values()) {
      const { a, b, kind } = this.linkEnds(c);
      const hot = c.id === hovered;
      if (kind === 'materia') {
        g.lineStyle(10, 0x000000, 0.3).lineBetween(a.x + 5, a.y + 18, b.x + 5, b.y + 18);
        g.lineStyle(8, hot ? UI.bad : 0x4b5567, 1).lineBetween(a.x, a.y, b.x, b.y);
        g.lineStyle(2.5, hot ? 0xfca5a5 : 0x6b7689, 1).lineBetween(a.x, a.y - 2, b.x, b.y - 2);
      } else {
        g.lineStyle(8, hot ? UI.bad : 0x5ec8ff, 0.16).lineBetween(a.x, a.y, b.x, b.y);
        g.lineStyle(1.8, hot ? UI.bad : 0x7dd3fc, 0.9).lineBetween(a.x, a.y, b.x, b.y);
      }
      // seta de direção no meio
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const ux = (b.x - a.x) / d, uy = (b.y - a.y) / d, s = 6;
      g.fillStyle(hot ? UI.bad : 0xcbd5e1, 0.9).fillTriangle(mx + ux * s, my + uy * s, mx - ux * s - uy * s, my - uy * s + ux * s, mx - ux * s + uy * s, my - uy * s - ux * s);
      for (const item of c.items) {
        const t = c.length > 0 ? item.pos / c.length : 1;
        drawItem(g, item.res, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 4.5, RESOURCE_COLOR[item.res]);
      }
    }
  }

  private hoveredConnectionId(): number | undefined {
    if (this.state.tool.kind !== 'none' || this.dragFrom !== null || this.moving !== null) return undefined;
    const p = this.input.activePointer;
    if (this.state.isOverUI(p.x, p.y)) return undefined;
    const wp = this.cameras.main.getWorldPoint(p.x, p.y);
    if (this.agentAtWorld(wp.x, wp.y)) return undefined;
    return this.connectionNearWorld(wp.x, wp.y)?.id;
  }

  /** Conexão cuja linha (elevada, em tela) passa a menos de 9 px do ponto. */
  private connectionNearWorld(wx: number, wy: number): Connection | undefined {
    let best: Connection | undefined;
    let bestD = 9 / this.cameras.main.zoom;
    for (const c of this.state.world.connections.values()) {
      const { a, b } = this.linkEnds(c);
      const dx = b.x - a.x, dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((wx - a.x) * dx + (wy - a.y) * dy) / len2));
      const d = Math.hypot(wx - (a.x + t * dx), wy - (a.y + t * dy));
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  // ---------- sobreposições: prévia, arrasto, cartão ----------

  private drawOverlay(): void {
    const g = this.over;
    g.clear();
    this.tip.setVisible(false);
    this.info.setVisible(false);

    const p = this.input.activePointer;
    const cam = this.cameras.main;
    const wp = cam.getWorldPoint(p.x, p.y);
    const zoomFix = 1 / cam.zoom;
    const world = this.state.world;
    const overUI = this.state.isOverUI(p.x, p.y);
    const footprint = (x: number, y: number, color: number) => {
      const c = this.groundOf({ x, y });
      g.fillStyle(color, 0.22).fillPoints(this.diamondPts(c.x, c.y, TW * AGENT_SIZE, TH * AGENT_SIZE), true);
      g.lineStyle(2, color, 0.9).strokePoints(this.diamondPts(c.x, c.y, TW * AGENT_SIZE, TH * AGENT_SIZE), true);
      return c;
    };
    const showTip = (text: string, x: number, y: number) => this.tip.setText(text).setPosition(x, y).setScale(zoomFix).setVisible(true);

    // Movendo um agente (tecla M)
    if (this.moving !== null) {
      const a = world.agents.get(this.moving);
      if (!a) {
        this.moving = null;
        return;
      }
      const f = this.footprintUnder(wp.x, wp.y);
      const ok = this.canMoveTo(a, f.x, f.y);
      const c = footprint(f.x, f.y, ok.ok ? UI.ok : UI.bad);
      showTip(ok.ok ? `Mover ${AGENT_DEFS[a.type].name} · clique para soltar · Esc cancela` : PLACE_ERROR_TEXT[ok.reason], c.x + 70 * zoomFix, c.y - 10);
      return;
    }

    // Arrastando uma conexão
    if (this.dragFrom !== null) {
      const from = world.agents.get(this.dragFrom);
      if (!from) {
        this.dragFrom = null;
        return;
      }
      const src = this.groundOf(from);
      const e = isoCircle(LINK.range);
      g.lineStyle(1, 0xffffff, 0.14).strokeEllipse(src.x, src.y, e.rx * 2, e.ry * 2);
      const a = this.groundOf(from, 28);
      const target = this.agentAtWorld(wp.x, wp.y);
      let color = 0xffffff;
      let text = 'Solte sobre o agente de destino';
      if (target && target.id !== from.id) {
        const check = world.canConnect(from.id, target.id);
        color = check.ok ? UI.ok : UI.bad;
        text = check.ok ? `Conectar · ${LINK.ratePerMin}/min` : CONNECT_ERROR_TEXT[check.reason];
        const tc = this.groundOf(target);
        g.lineStyle(2, color, 0.9).strokePoints(this.diamondPts(tc.x, tc.y, TW * AGENT_SIZE, TH * AGENT_SIZE), true);
        const b = this.groundOf(target, 28);
        g.lineStyle(3, color, 0.85).lineBetween(a.x, a.y, b.x, b.y);
      } else {
        g.lineStyle(3, color, 0.6).lineBetween(a.x, a.y, wp.x, wp.y);
      }
      showTip(text, wp.x + 14 * zoomFix, wp.y + 10 * zoomFix);
      return;
    }

    if (overUI) return;

    // Célula sob o cursor
    const f = this.footprintUnder(wp.x, wp.y);
    const hoverAgent = this.agentAtWorld(wp.x, wp.y);

    // Prévia de construção
    const tool = this.state.tool;
    if (tool.kind === 'build') {
      const check = world.canPlace(tool.type, f.x, f.y);
      const c = footprint(f.x, f.y, check.ok ? UI.ok : UI.bad);
      const def = AGENT_DEFS[tool.type];
      const activeId = world.activeDesign[tool.type];
      const st = activeId ? world.stats(activeId) : null;
      const kw = (check.ok ? agentKw(tool.type, check.resource) : def.kw) * (st?.kwMult ?? 1);
      const parts = [activeId ? world.designs.get(activeId)!.name : def.name];
      if (st && check.ok) {
        const real = Math.max(5, Math.min(Math.max(st.reliability, 99), st.reliability - (st.filtersBiome ? 0 : world.biomeAt(f.x, f.y)) - (world.designs.get(activeId!)!.drift ?? 0)));
        if (real < 100) parts.push(`${Math.round(real)}% aqui`);
      }
      if (def.recipe) parts.push(recipeText(tool.type, check.ok ? check.resource : null));
      if (kw) parts.push(`${Math.round(kw * 10) / 10} kW`);
      if (def.generates) parts.push(`+${def.generates} kW`);
      showTip(check.ok ? parts.join(' · ') : PLACE_ERROR_TEXT[check.reason], c.x + 70 * zoomFix, c.y - 10);
      return;
    }

    if (hoverAgent) {
      const c = this.groundOf(hoverAgent);
      g.lineStyle(2, UI.accent, 0.9).strokePoints(this.diamondPts(c.x, c.y, TW * AGENT_SIZE + 4, TH * AGENT_SIZE + 2), true);
      this.info.setText(this.describe(hoverAgent)).setScale(zoomFix).setVisible(true);
      // Abre à direita do agente; perto da borda direita da tela, abre à esquerda
      const iw = this.info.width * zoomFix;
      const right = c.x + 70 * zoomFix + iw > cam.worldView.right - 8;
      this.info.setPosition(right ? c.x - 70 * zoomFix - iw : c.x + 70 * zoomFix, Math.max(cam.worldView.top + 8, c.y - ART_HEIGHT[artType(hoverAgent.type)] - 10));
      return;
    }
    if (this.hoveredConnectionId() !== undefined) {
      showTip('X: remover conexão', wp.x + 14 * zoomFix, wp.y + 10 * zoomFix);
      return;
    }
    // Losango da célula sob o cursor (terreno)
    const gp = this.groundPoint(wp.x, wp.y);
    const cell = cellAt(gp.x, gp.y);
    if (world.map.inBounds(cell.x, cell.y) && world.map.terrainAt(cell.x, cell.y) !== 'nevoa') {
      const c = toIso(cell.x + 0.5, cell.y + 0.5, visualHeight(world.map, cell.x, cell.y));
      g.lineStyle(1.5, 0xffffff, 0.35).strokePoints(this.diamondPts(c.x, c.y, TW, TH), true);
    }
  }

  /**
   * Ponto do chão sob o cursor, compensando o relevo decorativo: numa célula elevada da
   * Cordilheira o desenho está mais alto, então o cursor "cai" na célula certa.
   */
  private groundPoint(wx: number, wy: number): { x: number; y: number } {
    const m = this.state.world.map;
    for (const dz of [27, 18, 9, 0, -7]) {
      const c = cellAt(wx, wy + dz);
      if (m.inBounds(c.x, c.y) && visualHeight(m, c.x, c.y) === dz) return { x: wx, y: wy + dz };
    }
    return { x: wx, y: wy };
  }

  private footprintUnder(wx: number, wy: number) {
    const g = this.groundPoint(wx, wy);
    return footprintAt(g.x, g.y);
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
        lines.push(this.reliabilityLine(a));
        lines.push(`Velocidade ×${st.speed.toFixed(2)}`);
        lines.push(`Alucinações: ${a.defects} · Defeitos herdados: ${a.inherited}`);
      }
      if (a.running) lines.push(`Ciclo: ${Math.floor(a.progress * 100)}%${a.quality < 1 ? ` · qualidade herdada ${Math.round(a.quality * 100)}%` : ''}`);
      const ins = Object.entries(def.recipe.inputs);
      if (ins.length) lines.push('Ingredientes: ' + ins.map(([r, n]) => `${RESOURCES[r as keyof typeof RESOURCES].name} ${a.inputs[r as keyof typeof a.inputs] ?? 0}/${n! * INPUT_CYCLES}`).join(' · '));
      lines.push(`Consumo: ${Math.round(w.agentPower(a) * 10) / 10} kW (só trabalhando)`);
    }
    if (a.type === 'verificador' && design) {
      const st = w.stats(design.id);
      lines.push(`Inspeciona ${Math.round(st.perMin * 10) / 10} itens/min · ${Math.round(w.agentPower(a) * 10) / 10} kW`);
      lines.push(this.reliabilityLine(a, 'Detecção'));
      lines.push(`Falso positivo: ${Math.round(st.falsePositive * 100)}% dos itens bons`);
      lines.push(`Inspecionados: ${a.produced} · Defeituosos pegos: ${a.caught}`);
      lines.push(`Bons rejeitados: ${a.falsePos} · Defeituosos que passaram: ${a.missed}`);
      const outs = w.outputsOf(a.id).length;
      lines.push(outs >= 2 ? '1ª saída: aprovados · 2ª: rejeitados' : outs === 1 ? '1ª saída: aprovados · sem 2ª saída: rejeitados são destruídos' : 'Ligue a 1ª saída (aprovados) e a 2ª (rejeitados)');
    }
    if (a.type === 'plataforma') {
      const ph = ARCA_PHASES[w.arca.phase];
      lines.push(w.arca.done ? 'Arca: todas as fases concluídas' : `Enviando para a Arca: ${ph.title} ${w.arca.delivered}/${ph.n}`);
      lines.push(`Recebidos aqui: ${a.produced} · Rejeitados pela Arca (total da fase): ${w.arca.rejected}`);
    }
    if (def.generates) lines.push(`Gera ${def.generates} kW`);
    if (a.type === 'descarte') lines.push(`Destruídos: ${a.produced}`);
    if (def.capacity > 0) lines.push(`${a.type === 'silo' ? 'Estoque' : 'Saída'}: ${a.buffer.length}/${def.capacity}`);
    if (def.maxIn > 0) lines.push(`Entradas: ${w.inputsOf(a.id).length}/${def.maxIn}`);
    if (def.maxOut > 0) lines.push(`Saídas: ${w.outputsOf(a.id).length}/${def.maxOut}`);
    lines.push(def.maxIn + def.maxOut > 0 ? 'Arraste: conectar · Clique: fixar cartão · M: mover · X: demolir' : 'Clique: fixar cartão · M: mover · X: demolir');
    return lines.join('\n');
  }

  /** "Bancada 90% → Real 82% (bioma −10, drift −5, experiência +7)". */
  private reliabilityLine(a: Agent, label = 'Confiabilidade'): string {
    const r = this.state.world.reliabilityBreakdown(a);
    const parts: string[] = [];
    if (r.biome) parts.push(`bioma −${r.biome}`);
    if (r.drift) parts.push(`drift −${r.drift}`);
    if (r.xp) parts.push(`experiência +${r.xp}`);
    const real = Math.round(r.real);
    const bench = Math.round(r.design);
    return parts.length ? `${label}: bancada ${bench}% → real ${real}% (${parts.join(', ')})` : `${label}: ${real}%`;
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
      if (this.moving !== null) {
        this.dropMove(wp.x, wp.y);
        return;
      }
      const agent = this.agentAtWorld(wp.x, wp.y);
      if (agent && this.state.tool.kind !== 'build') {
        this.dragFrom = agent.id;
        this.downAt = { x: p.x, y: p.y };
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
      const target = this.agentAtWorld(wp.x, wp.y);
      const fromId = this.dragFrom;
      this.dragFrom = null;
      if (target && target.id === fromId && Math.hypot(p.x - this.downAt.x, p.y - this.downAt.y) < 6) {
        this.state.events.emit('pin', fromId);
        return;
      }
      if (!target || target.id === fromId) return;
      const res = this.state.world.connect(fromId, target.id);
      if (!res.ok) this.state.toast(CONNECT_ERROR_TEXT[res.reason]);
    });

    // Soltou o botão fora do canvas (ex.: sobre um painel HTML): cancela arrasto e câmera
    this.input.on('pointerupoutside', () => {
      this.dragFrom = null;
      this.panning = false;
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
      if (this.moving !== null) {
        this.moving = null;
        return;
      }
      this.dragFrom = null;
      this.state.setTool({ kind: 'none' });
      this.state.events.emit('pin', null);
    };
    kb.on('keydown-M', () => {
      const p = this.input.activePointer;
      const wp = cam.getWorldPoint(p.x, p.y);
      const a = this.agentAtWorld(wp.x, wp.y);
      if (a) {
        this.moving = a.id;
        this.state.setTool({ kind: 'none' });
      }
    });
    kb.on('keydown-ESC', cancel);
    kb.on('keydown-Q', cancel);
    kb.on('keydown-X', () => this.demolishHovered());
    kb.on('keydown-DELETE', () => this.demolishHovered());
    kb.on('keydown-SPACE', () => this.state.togglePause());
    kb.on('keydown-P', () => this.state.togglePause());

    const keys = kb.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>;
    this.events.on(Phaser.Scenes.Events.UPDATE, (_t: number, delta: number) => {
      const v = ((delta / 1000) * 700) / cam.zoom;
      if (keys.A.isDown || keys.LEFT.isDown) cam.scrollX -= v;
      if (keys.D.isDown || keys.RIGHT.isDown) cam.scrollX += v;
      if (keys.W.isDown || keys.UP.isDown) cam.scrollY -= v;
      if (keys.S.isDown || keys.DOWN.isDown) cam.scrollY += v;
    });
  }

  /** Validação do destino sem alterar o mundo (ignora a ocupação do próprio agente). */
  private canMoveTo(a: Agent, x: number, y: number): { ok: true } | { ok: false; reason: keyof typeof PLACE_ERROR_TEXT } {
    for (let dy = 0; dy < AGENT_SIZE; dy++)
      for (let dx = 0; dx < AGENT_SIZE; dx++) {
        const other = this.state.world.agentAt(x + dx, y + dy);
        if (other && other.id !== a.id) return { ok: false, reason: 'ocupado' };
      }
    const r = this.state.world.canPlace(a.type, x, y);
    if (!r.ok && r.reason !== 'ocupado') return r;
    return { ok: true };
  }

  private dropMove(wx: number, wy: number): void {
    const id = this.moving!;
    const f = this.footprintUnder(wx, wy);
    const r = this.state.world.move(id, f.x, f.y);
    if (!r.ok) {
      this.state.toast(PLACE_ERROR_TEXT[r.reason]);
      return;
    }
    this.moving = null;
    if (r.removed) this.state.toast(`${r.removed} conexão${r.removed > 1 ? 'ões ficaram' : ' ficou'} fora de alcance e ${r.removed > 1 ? 'foram removidas' : 'foi removida'}`);
  }

  private tryBuild(wx: number, wy: number): void {
    const tool = this.state.tool;
    if (tool.kind !== 'build') return;
    const f = this.footprintUnder(wx, wy);
    const res = this.state.world.place(tool.type, f.x, f.y);
    if (res.ok) this.addView(res.agent);
    else this.state.toast(PLACE_ERROR_TEXT[res.reason]);
  }

  private demolishHovered(): void {
    const p = this.input.activePointer;
    const wp = this.cameras.main.getWorldPoint(p.x, p.y);
    const world = this.state.world;
    const agent = this.agentAtWorld(wp.x, wp.y);
    if (agent) {
      world.remove(agent.id);
      world.count('demolicoes');
      this.removeView(agent.id);
      return;
    }
    const c = this.connectionNearWorld(wp.x, wp.y);
    if (c) {
      world.disconnect(c.id);
      world.count('conexoes_removidas');
    }
  }
}
