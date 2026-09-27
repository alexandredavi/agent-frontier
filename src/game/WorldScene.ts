import Phaser from 'phaser';
import { AGENT_DEFS, AGENT_SIZE, ARCA_PHASES, INPUT_CYCLES, LINK, RESOURCES, STALL_ALERT, agentKw, outputPerMin, recipeText } from '../sim/defs';
import { LANDING_POINT } from '../sim/mapData';
import type { Agent, Connection } from '../sim/types';
import { CONNECT_ERROR_TEXT, PLACE_ERROR_TEXT } from '../sim/world';
import { ART_HEIGHT, type ArtType, CORE_OFFSET, MODULE_SLOTS, PERIOD } from './iso/art';
import { ANCHOR_X, ANCHOR_Y, FRAMES, FRAME_H, FRAME_W, artKey, bakeArt, frameCount } from './iso/bake';
import { type Pickable, TH, TW, cellAt, depthOf, footprintAt, isoCircle, pickFrontmost, toIso } from './iso/projection';
import { PALETTES, renderHaze, renderTerrain, terraStage, visualHeight } from './iso/terrain';
import { writeSave } from './persistence';
import { HoverCard, esc } from '../ui/hovercard';
import type { GameState } from './state';
import { FONT, RESOURCE_COLOR, UI, WARN, hex } from './theme';

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
  /** V3: módulos de Diretiva acoplados, giroflex, estado visual e contorno. */
  modules: Phaser.GameObjects.Image[];
  modKey: string;
  beacon: Phaser.GameObjects.Image;
  modeKey: string;
  glow?: Phaser.FX.Glow;
  building: boolean;
  fxAcc: number;
  /** V4: efeitos de trabalho (vapor, fagulhas, impacto da prensa). */
  workAcc: number;
  lastPh: number;
}

/** Esteira: altura acima do chão e meia-largura (em células). */
const BELT_Z = 16;
const BELT_W = 0.25;
const STRIPE = 0.45;
/** Uma linha é considerada parada quando o item da frente espera na ponta por mais que isto (s). */
const STUCK_AFTER = 1;

function darken(col: number, f: number): number {
  const r = (col >> 16) & 255, g = (col >> 8) & 255, b = col & 255;
  return (Math.round(r * f) << 16) | (Math.round(g * f) << 8) | Math.round(b * f);
}

/** Recorte vertical do quadro: de onde a "impressão" começa (base) até o topo do desenho. */
const PRINT_BOTTOM = FRAME_H;
const printTop = (h: number) => Math.max(0, ANCHOR_Y - h - 14);
/** Zoom a partir do qual os contadores ficam sempre visíveis. */
const LABEL_ZOOM = 1.2;

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
  private linkGlow!: Phaser.GameObjects.Graphics;
  private beltOffset = new Map<number, number>();
  private stuckFor = new Map<number, number>();
  private steam!: Phaser.GameObjects.Particles.ParticleEmitter;
  private ambDust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private ambMist!: Phaser.GameObjects.Particles.ParticleEmitter;
  private iceGlint!: Phaser.GameObjects.Particles.ParticleEmitter;
  private craterPts: { x: number; y: number }[] = [];
  private ambAcc = { dust: 0, ice: 0, mist: 0 };
  private fpsLow = 0;
  private fpsHigh = 0;
  /** Efeitos de ambiente e de trabalho ligados (desligam sozinhos se o FPS cair). */
  fxOn = true;
  /** 'auto' segue o FPS; 'on'/'off' forçam (depuração). */
  fxMode: 'auto' | 'on' | 'off' = 'auto';
  private over!: Phaser.GameObjects.Graphics;
  private tip!: Phaser.GameObjects.Text;
  private card = new HoverCard();
  private cardWanted = false;
  private dragFrom: number | null = null;
  private downAt = { x: 0, y: 0 };
  private moving: number | null = null;
  private pinnedId: number | null = null;
  private hoverId: number | undefined;
  private frameDt = 0;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private smoke!: Phaser.GameObjects.Particles.ParticleEmitter;
  private dust!: Phaser.GameObjects.Particles.ParticleEmitter;
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
    this.linkGlow = this.add.graphics().setDepth(5.5).setBlendMode(Phaser.BlendModes.ADD);
    this.steam = this.add
      .particles(0, 0, 'smoke', { emitting: false, lifespan: 1700, speedY: { min: -32, max: -18 }, speedX: { min: -5, max: 9 }, scale: { start: 0.3, end: 1.3 }, alpha: { start: 0.42, end: 0 }, tint: 0xe8eef5 })
      .setDepth(9e5);
    this.ambDust = this.add
      .particles(0, 0, 'smoke', { emitting: false, lifespan: 4200, speedX: { min: 28, max: 70 }, speedY: { min: -6, max: 8 }, scale: { start: 0.1, end: 0.34 }, alpha: { values: [0, 0.42, 0], interpolation: 'linear' }, tint: 0xc9a07f })
      .setDepth(9e5 - 1);
    this.ambMist = this.add
      .particles(0, 0, 'smoke', { emitting: false, lifespan: 7000, speedX: { min: 6, max: 16 }, speedY: { min: -2, max: 2 }, scale: { start: 2.2, end: 3.6 }, alpha: { values: [0, 0.09, 0], interpolation: 'linear' }, tint: 0xe0925a })
      .setDepth(9e5 - 2);
    this.iceGlint = this.add
      .particles(0, 0, 'spark', { emitting: false, lifespan: 700, speed: 0, scale: { values: [0, 1.2, 0], interpolation: 'linear' }, tint: 0xe6f8ff, blendMode: 'ADD' })
      .setDepth(2);
    this.collectCraters();
    // Partículas compartilhadas: faíscas (alerta/demolição), fumaça (alerta) e poeira (construção)
    this.sparks = this.add
      .particles(0, 0, 'spark', { emitting: false, lifespan: { min: 250, max: 600 }, speed: { min: 40, max: 150 }, angle: { min: 200, max: 340 }, gravityY: 280, scale: { start: 1, end: 0.2 }, tint: [0xffd27a, 0xff8a3c, 0xffffff], blendMode: 'ADD' })
      .setDepth(9e5);
    this.smoke = this.add
      .particles(0, 0, 'smoke', { emitting: false, lifespan: 1700, speedY: { min: -30, max: -16 }, speedX: { min: -7, max: 7 }, scale: { start: 0.45, end: 1.5 }, alpha: { start: 0.5, end: 0 }, tint: 0x33343a })
      .setDepth(9e5);
    this.dust = this.add
      .particles(0, 0, 'smoke', { emitting: false, lifespan: 750, speed: { min: 25, max: 75 }, angle: { min: 0, max: 360 }, scale: { start: 0.35, end: 1.1 }, alpha: { start: 0.55, end: 0 }, tint: 0xb89274 })
      .setDepth(9e5);
    this.over = this.add.graphics().setDepth(1e6);
    const tipStyle = { fontFamily: FONT, fontSize: '12px', color: '#e8f6ff', backgroundColor: '#0a1420ee', padding: { x: 7, y: 4 } };
    this.tip = this.add.text(0, 0, '', tipStyle).setDepth(1e6 + 1).setVisible(false);

    const cam = this.cameras.main;
    cam.setBounds(terr.left, terr.top, terr.canvas.width, terr.canvas.height);
    const land = toIso(LANDING_POINT.x + 1, LANDING_POINT.y + 1);
    cam.centerOn(land.x, land.y);
    cam.setZoom(1);

    this.rebuildViews();
    this.setupInput();
    this.onMode();
    this.state.describeAgent = (a) => this.describe(a);

    this.state.events.on('world-replaced', this.onWorldReplaced, this);
    this.state.events.on('pin', this.onPin, this);
    this.state.events.on('focus-agent', this.onFocus, this);
    this.state.events.on('mode', this.onMode, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.state.events.off('world-replaced', this.onWorldReplaced, this);
      this.state.events.off('pin', this.onPin, this);
      this.state.events.off('focus-agent', this.onFocus, this);
      this.state.events.off('mode', this.onMode, this);
    });

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

    this.frameDt = realDt;
    const title = this.state.mode !== 'play';
    if (title) this.titleDrift(realDt);
    // Agente sob o cursor (contorno e contadores)
    const ap = this.input.activePointer;
    const awp = this.cameras.main.getWorldPoint(ap.x, ap.y);
    this.hoverId = title || this.state.isOverUI(ap.x, ap.y) ? undefined : this.agentAtWorld(awp.x, awp.y)?.id;

    // Agentes novos (construídos agora) entram com o drone; removidos saem desmontando
    for (const a of world.agents.values()) if (!this.views.has(a.id)) this.addView(a, true);
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

    this.updateFxBudget(realDt);
    this.ambient(realDt);
    this.applyOcclusion();
    this.drawLinks();
    if (title) {
      this.over.clear();
      this.tip.setVisible(false);
      this.cardWanted = false;
    } else this.drawOverlay();
    if (!this.cardWanted) this.card.hide();

    this.sinceSave += realDt * 1000;
    if (this.sinceSave >= AUTOSAVE_MS) {
      this.sinceSave = 0;
      if (writeSave(world)) this.state.events.emit('saved');
    }
  }

  // ---------- terreno e terraformação ----------

  private titleClock = 0;

  /** Tela de abertura: câmera passeia sozinha e a cena não aceita comandos; jogando: volta ao ponto de pouso. */
  private onMode(): void {
    const play = this.state.mode === 'play';
    this.input.enabled = play;
    if (this.input.keyboard) this.input.keyboard.enabled = play;
    const cam = this.cameras.main;
    this.moving = null;
    this.dragFrom = null;
    this.panning = false;
    if (play) {
      const land = toIso(LANDING_POINT.x + 1, LANDING_POINT.y + 1);
      cam.setZoom(1);
      cam.centerOn(land.x, land.y);
    } else {
      this.card.hide();
      this.titleClock = 0;
      cam.setZoom(0.9);
    }
  }

  /** Passeio lento sobre a base (ou o ponto de pouso) durante a tela de abertura. */
  private titleDrift(dt: number): void {
    this.titleClock += dt;
    const t = this.titleClock;
    const land = toIso(LANDING_POINT.x + 1, LANDING_POINT.y + 1);
    const cam = this.cameras.main;
    // desloca o centro para a direita da tela (o menu fica à esquerda)
    const off = (cam.width * 0.18) / cam.zoom;
    cam.centerOn(land.x - off + Math.sin(t * 0.05) * 360, land.y + Math.sin(t * 0.083) * 150);
  }

  private onPin(id: number | null): void {
    this.pinnedId = id;
  }

  /** Leva a câmera até o agente (ex.: botão de alertas) e fixa o cartão dele. */
  private onFocus(id: number): void {
    const a = this.state.world.agents.get(id);
    if (!a) return;
    const p = this.groundOf(a, 30);
    this.cameras.main.pan(p.x, p.y, 450, 'Sine.easeInOut');
    this.state.events.emit('pin', id);
  }

  private onWorldReplaced(): void {
    this.rebuildViews();
    this.collectCraters();
    this.beltOffset.clear();
    this.stuckFor.clear();
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

  private addView(agent: Agent, animate = false): void {
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
      modules: [],
      modKey: '',
      beacon: this.add.image(0, -ART_HEIGHT[t] - 6, 'beacon').setVisible(false),
      modeKey: '',
      building: false,
      fxAcc: Math.random() * 0.3,
      workAcc: Math.random() * 0.3,
      lastPh: 0,
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
    parts.push(view.bolt, view.beacon, view.label);
    view.container.add(parts);
    this.views.set(agent.id, view);
    this.refreshView(agent, view);
    if (animate) this.playBuild(agent, view);
    else {
      view.container.setScale(0.7).setAlpha(0);
      this.tweens.add({ targets: view.container, scale: 1, alpha: 1, duration: 180, ease: 'Back.Out' });
    }
  }

  /** Construção: um drone de carga desce e "imprime" o agente de baixo para cima. */
  private playBuild(agent: Agent, view: AgentView): void {
    const H = ART_HEIGHT[artType(agent.type)];
    const top = printTop(H);
    const extras = view.container.list.filter((o) => o !== view.sprite) as unknown as Phaser.GameObjects.Components.Alpha[];
    for (const o of extras) o.setAlpha(0);
    view.building = true;
    view.sprite.setCrop(0, PRINT_BOTTOM, FRAME_W, 0);
    const drone = this.add.image(0, -H - 170, 'drone').setAlpha(0);
    const beam = this.add.graphics();
    view.container.add([beam, drone]);
    const g = this.groundOf(agent);
    this.dust.explode(14, g.x, g.y);
    const prog = { p: 0 };
    const hover = -H - 30;
    this.tweens.chain({
      tweens: [
        { targets: drone, y: hover, alpha: 1, duration: 260, ease: 'Cubic.Out' },
        {
          targets: prog,
          p: 1,
          duration: 620,
          ease: 'Sine.InOut',
          onUpdate: () => {
            const y = PRINT_BOTTOM - prog.p * (PRINT_BOTTOM - top);
            view.sprite.setCrop(0, y, FRAME_W, FRAME_H - y);
            const ly = y - ANCHOR_Y;
            drone.y = hover + Math.sin(prog.p * Math.PI * 4) * 2;
            beam.clear();
            beam.fillStyle(0x7fe7ff, 0.18).fillTriangle(0, drone.y + 8, -44, ly, 44, ly);
            beam.lineStyle(1.5, 0xbff4ff, 0.9).lineBetween(-40, ly, 40, ly);
          },
        },
        { targets: drone, y: -H - 190, alpha: 0, duration: 320, ease: 'Cubic.In', onStart: () => beam.clear() },
      ],
      onComplete: () => {
        drone.destroy();
        beam.destroy();
        if (!view.sprite.active) return;
        view.sprite.setCrop();
        view.building = false;
        this.tweens.add({ targets: extras, alpha: 1, duration: 200 });
      },
    });
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
    if (working && this.fxOn && !view.building && this.state.clock.speed > 0) this.workFx(agent, view);

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

    // Estado no próprio modelo: ocioso apaga as luzes; bloqueado liga o giroflex; alerta solta faíscas e fumaça
    const stuckNow = agent.status === 'bloqueado' && agent.stalledFor >= STALL_ALERT;
    const mode = stuckNow ? 'alerta' : agent.status;
    if (mode !== view.modeKey) {
      view.modeKey = mode;
      if (mode === 'ocioso' && agent.designId) view.sprite.setTint(0x6c7280);
      else view.sprite.clearTint();
      view.beacon.setVisible(mode === 'bloqueado' || mode === 'alerta').setTint(mode === 'alerta' ? UI.bad : WARN);
    }
    if (view.beacon.visible && !view.building) {
      const t = this.time.now / 1000;
      view.beacon.setAlpha(0.35 + 0.65 * Math.abs(Math.sin(t * (mode === 'alerta' ? 7 : 4.5))));
    }
    if (mode === 'alerta' && !view.building) {
      view.fxAcc += this.frameDt;
      if (view.fxAcc > 0.28) {
        view.fxAcc = 0;
        const c = view.container;
        const H = ART_HEIGHT[artType(agent.type)];
        this.sparks.explode(3, c.x + (Math.random() - 0.5) * 30, c.y - H * 0.45);
        if (Math.random() < 0.6) this.smoke.explode(1, c.x + (Math.random() - 0.5) * 16, c.y - H * 0.75);
      }
    }

    // Módulos de Diretiva acoplados na base
    const cards = agent.designId ? (w.designOf(agent)?.cards ?? []) : [];
    const modKey = cards.join(',');
    if (modKey !== view.modKey) {
      view.modKey = modKey;
      for (const m of view.modules) m.destroy();
      view.modules = cards.slice(0, MODULE_SLOTS.length).map((card, i) => {
        const img = this.add.image(MODULE_SLOTS[i].x, MODULE_SLOTS[i].y, `mod-${card}`).setOrigin(0.5, 22 / 32);
        if (view.building) img.setAlpha(0);
        return img;
      });
      // acima do corpo, abaixo do giroflex e do rótulo
      const at = view.container.getIndex(view.beacon);
      view.modules.forEach((m, i) => view.container.addAt(m, at + i));
    }

    // Contorno luminoso no agente sob o cursor ou com cartão fixo
    const lit = agent.id === this.hoverId || agent.id === this.pinnedId;
    if (lit && !view.glow && !view.building && view.sprite.preFX) {
      view.sprite.preFX.padding = 6;
      view.glow = view.sprite.preFX.addGlow(UI.accent, 3, 0, false, 0.1, 6);
    }
    else if ((!lit || view.building) && view.glow) {
      view.sprite.preFX?.remove(view.glow);
      if (view.sprite.preFX) view.sprite.preFX.padding = 0;
      view.glow = undefined;
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
      view.label.setText(text);
    }
    // Contadores só quando úteis: hover, cartão fixo, zoom aproximado, alerta ou Silo cheio
    const full = agent.type === 'silo' && agent.buffer.length >= (def.capacity ?? Infinity);
    const show = text !== '' && (lit || this.cameras.main.zoom >= LABEL_ZOOM || full || mode === 'alerta');
    view.label.setVisible(show).setY(-ART_HEIGHT[artType(agent.type)] - (view.beacon.visible ? 30 : 18));
  }

  private removeView(id: number): void {
    const view = this.views.get(id);
    if (!view) return;
    this.views.delete(id);
    // Demolição: o agente desmonta de cima para baixo e some com faíscas
    const c = view.container;
    const H = view.sprite.height ? ART_HEIGHT[view.key.startsWith('art-extrator') ? 'extrator' : (view.key.slice(4) as ArtType)] ?? 60 : 60;
    this.sparks.explode(18, c.x, c.y - H * 0.5);
    this.dust.explode(8, c.x, c.y);
    for (const o of c.list) if (o !== view.sprite) (o as unknown as Phaser.GameObjects.Components.Alpha).setAlpha(0);
    const top = printTop(H);
    const prog = { p: 0 };
    this.tweens.add({
      targets: prog,
      p: 1,
      duration: 380,
      ease: 'Sine.In',
      onUpdate: () => {
        const y = top + prog.p * (PRINT_BOTTOM - top);
        view.sprite.setCrop(0, y, FRAME_W, FRAME_H - y);
      },
      onComplete: () => c.destroy(),
    });
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
    } else if (this.hoverId !== undefined) {
      const a = world.agents.get(this.hoverId);
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
    const glow = this.linkGlow;
    const world = this.state.world;
    g.clear();
    glow.clear();
    const hovered = this.hoveredConnectionId();
    const t = this.time.now / 1000;
    const speed = this.state.clock.speed;
    for (const c of world.connections.values()) {
      // Linha parada: o item da frente chegou na ponta e não foi aceito
      const front = c.items[0];
      const waiting = !!front && front.pos >= c.length - 0.02;
      const sf = waiting && speed > 0 ? (this.stuckFor.get(c.id) ?? 0) + this.frameDt : waiting ? (this.stuckFor.get(c.id) ?? 0) : 0;
      this.stuckFor.set(c.id, sf);
      const stuck = sf >= STUCK_AFTER;
      const hot = c.id === hovered;
      if (this.linkKind(c) === 'materia') {
        const off = (this.beltOffset.get(c.id) ?? 0) + (stuck ? 0 : this.frameDt * LINK.speed * speed);
        this.beltOffset.set(c.id, off % 1000);
        this.drawBelt(c, hot, stuck, off, t);
      } else this.drawBeam(c, hot, stuck, t);
    }
    // limpa conexões removidas
    if (this.stuckFor.size > world.connections.size) {
      for (const id of [...this.stuckFor.keys()]) if (!world.connections.has(id)) { this.stuckFor.delete(id); this.beltOffset.delete(id); }
    }
  }

  /** Esteira aberta em 3D sobre pilares; as faixas andam no sentido do fluxo. */
  private drawBelt(c: Connection, hot: boolean, stuck: boolean, offset: number, time: number): void {
    const g = this.links;
    const w = this.state.world;
    const A = w.agents.get(c.from)!, B = w.agents.get(c.to)!;
    const ax = A.x + AGENT_SIZE / 2, ay = A.y + AGENT_SIZE / 2, bx = B.x + AGENT_SIZE / 2, by = B.y + AGENT_SIZE / 2;
    const ga = this.baseZ(A), gb = this.baseZ(B);
    const za = ga + BELT_Z, zb = gb + BELT_Z;
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
    const px = (-dy / len) * BELT_W, py = (dx / len) * BELT_W;
    const P = (tt: number, s: number, dz = 0) => toIso(ax + dx * tt + px * s, ay + dy * tt + py * s, za + (zb - za) * tt + dz);
    const G = (tt: number, s = 0, o = 0) => toIso(ax + dx * tt + px * s + o, ay + dy * tt + py * s + o, ga + (gb - ga) * tt);
    // sombra no chão
    g.fillStyle(0x000000, 0.2).fillPoints([G(0, -1, 0.18), G(1, -1, 0.18), G(1, 1, 0.18), G(0, 1, 0.18)], true);
    // pilares
    const n = Math.max(1, Math.floor(len / 2.2));
    for (let i = 1; i <= n; i++) {
      const tt = i / (n + 1);
      const top = P(tt, 0, -3), bot = G(tt);
      g.lineStyle(3, 0x262b36, 1).lineBetween(top.x, top.y, bot.x, bot.y);
      g.fillStyle(0x000000, 0.25).fillEllipse(bot.x, bot.y, 8, 4);
    }
    // lateral da frente e topo
    const sF = P(0.5, 1).y > P(0.5, -1).y ? 1 : -1;
    g.fillStyle(0x1c212b, 1).fillPoints([P(0, sF), P(1, sF), P(1, sF, -6), P(0, sF, -6)], true);
    g.fillStyle(stuck ? 0x5a4a2c : 0x485266, 1).fillPoints([P(0, -1), P(1, -1), P(1, 1), P(0, 1)], true);
    // faixas que andam (param quando a linha trava)
    g.lineStyle(1.3, stuck ? 0x9a7630 : 0x6e7b93, 1);
    for (let d = offset % STRIPE; d < len; d += STRIPE) {
      const a = P(d / len, -0.8), b = P(d / len, 0.8);
      g.lineBetween(a.x, a.y, b.x, b.y);
    }
    // trilhos
    const rail = hot ? UI.bad : stuck ? WARN : 0x8e99ad;
    for (const sd of [-1, 1]) {
      const a = P(0, sd, 1), b = P(1, sd, 1);
      g.lineStyle(1.6, rail, 1).lineBetween(a.x, a.y, b.x, b.y);
    }
    // itens: blocos 3D na cor do recurso; defeituosos tremulam em vermelho
    for (const item of c.items) {
      const tt = c.length > 0 ? Math.min(1, item.pos / c.length) : 1;
      const p = P(tt, 0, 1);
      const col = RESOURCE_COLOR[item.res];
      const hw = 6, hh = 3, h = 6;
      g.fillStyle(darken(col, 0.72), 1).fillPoints([{ x: p.x - hw, y: p.y - h }, { x: p.x, y: p.y + hh - h }, { x: p.x, y: p.y + hh }, { x: p.x - hw, y: p.y }], true);
      g.fillStyle(darken(col, 0.52), 1).fillPoints([{ x: p.x, y: p.y + hh - h }, { x: p.x + hw, y: p.y - h }, { x: p.x + hw, y: p.y }, { x: p.x, y: p.y + hh }], true);
      g.fillStyle(col, 1).fillPoints([{ x: p.x, y: p.y - hh - h }, { x: p.x + hw, y: p.y - h }, { x: p.x, y: p.y + hh - h }, { x: p.x - hw, y: p.y - h }], true);
      if (item.bad) this.badGlow(p.x, p.y - 4, time, item.pos);
    }
  }

  /** Link de dados: feixe translúcido reto com pulsos de luz viajando. */
  private drawBeam(c: Connection, hot: boolean, stuck: boolean, time: number): void {
    const g = this.links;
    const glow = this.linkGlow;
    const { a, b } = this.linkEnds(c);
    const col = hot ? UI.bad : stuck ? WARN : 0x5ec8ff;
    glow.lineStyle(9, col, 0.09).lineBetween(a.x, a.y, b.x, b.y);
    glow.lineStyle(3, col, 0.22).lineBetween(a.x, a.y, b.x, b.y);
    g.lineStyle(1.2, hot ? 0xfca5a5 : stuck ? 0xfde68a : 0xbfeaff, 0.85).lineBetween(a.x, a.y, b.x, b.y);
    for (const e of [a, b]) {
      glow.fillStyle(col, 0.35).fillCircle(e.x, e.y, 6);
      g.fillStyle(0xe0f5ff, 0.9).fillCircle(e.x, e.y, 2);
    }
    const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const ux = (b.x - a.x) / d, uy = (b.y - a.y) / d;
    if (c.items.length === 0) {
      // sem itens: um chevron fraco mostra o sentido
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, s = 5;
      g.fillStyle(0xcbd5e1, 0.5).fillTriangle(mx + ux * s, my + uy * s, mx - ux * s - uy * s, my - uy * s + ux * s, mx - ux * s + uy * s, my - uy * s - ux * s);
    }
    for (const item of c.items) {
      const tt = c.length > 0 ? Math.min(1, item.pos / c.length) : 1;
      const x = a.x + (b.x - a.x) * tt, y = a.y + (b.y - a.y) * tt;
      const rc = RESOURCE_COLOR[item.res];
      glow.lineStyle(6, rc, 0.55).lineBetween(x - ux * 8, y - uy * 8, x + ux * 3, y + uy * 3);
      g.fillStyle(0xffffff, 0.95).fillCircle(x, y, 2.2);
      if (item.bad) this.badGlow(x, y, time, item.pos);
    }
  }

  private badGlow(x: number, y: number, time: number, seed: number): void {
    const f = 0.35 + 0.35 * Math.sin(time * 18 + seed * 7) + 0.2 * Math.sin(time * 31 + seed);
    this.linkGlow.fillStyle(UI.bad, Math.max(0.15, f)).fillCircle(x, y, 9);
  }

  // ---------- efeitos de ambiente e de trabalho ----------

  private collectCraters(): void {
    const m = this.state.world.map;
    this.craterPts = [];
    for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) if (m.terrainAt(x, y) === 'cratera') this.craterPts.push(toIso(x + 0.5, y + 0.5, -7));
  }

  /** Liga/desliga os efeitos conforme o FPS (desliga abaixo de 28 por 3 s; religa acima de 50 por 5 s). */
  private updateFxBudget(dt: number): void {
    if (this.fxMode !== 'auto') {
      this.fxOn = this.fxMode === 'on';
      return;
    }
    const fps = this.game.loop.actualFps;
    this.fpsLow = fps < 28 ? this.fpsLow + dt : 0;
    this.fpsHigh = fps > 50 ? this.fpsHigh + dt : 0;
    if (this.fxOn && this.fpsLow > 3) this.fxOn = false;
    else if (!this.fxOn && this.fpsHigh > 5) this.fxOn = true;
  }

  /** Poeira ao vento (mais forte no Pouso), brilhos de gelo nas crateras e névoa baixa na Base. */
  private ambient(dt: number): void {
    if (!this.fxOn) return;
    const v = this.cameras.main.worldView;
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const dustEvery = [0.07, 0.12, 0.25][this.stage] ?? 0.12;
    this.ambAcc.dust += dt;
    while (this.ambAcc.dust > dustEvery) {
      this.ambAcc.dust -= dustEvery;
      this.ambDust.explode(1, rnd(v.left - 80, v.right), rnd(v.top, v.bottom));
    }
    this.ambAcc.ice += dt;
    if (this.ambAcc.ice > 0.1 && this.craterPts.length) {
      this.ambAcc.ice = 0;
      for (let k = 0; k < 3; k++) {
        const p = this.craterPts[Math.floor(Math.random() * this.craterPts.length)];
        if (v.contains(p.x, p.y)) { this.iceGlint.explode(1, p.x + rnd(-20, 20), p.y + rnd(-8, 8)); break; }
      }
    }
    if (this.stage >= 2) {
      this.ambAcc.mist += dt;
      if (this.ambAcc.mist > 0.35) {
        this.ambAcc.mist = 0;
        this.ambMist.explode(1, rnd(v.left - 150, v.right), rnd(v.top, v.bottom));
      }
    }
  }

  /** Vapor no Derretedor, fagulhas no Fundidor, impacto na Prensa (em sincronia com o martelo). */
  private workFx(agent: Agent, view: AgentView): void {
    const c = view.container;
    view.workAcc += this.frameDt;
    switch (agent.type) {
      case 'derretedor':
        if (view.workAcc > 0.32) { view.workAcc = 0; this.steam.explode(1, c.x + 18, c.y - 68); }
        break;
      case 'fundidor':
        if (view.workAcc > 0.18) { view.workAcc = 0; this.sparks.explode(2, c.x + (Math.random() - 0.5) * 12, c.y - 48); }
        break;
      case 'prensa': {
        const f = (Math.floor(this.animClock * ANIM_FPS) + view.phase) % view.frames;
        const ph = (((f / FRAMES) * PERIOD * 2) / PERIOD) % 1;
        const hit = (view.lastPh < 0.18 && ph >= 0.18) || (view.lastPh > ph && ph >= 0.18);
        view.lastPh = ph;
        if (hit) {
          this.dust.explode(6, c.x, c.y - 10);
          this.sparks.explode(4, c.x, c.y - 16);
        }
        break;
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
    this.cardWanted = false;

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
      // Cartão rico (HTML); o cartão fixo (clique) mostra o texto técnico completo
      if (hoverAgent.id !== this.pinnedId) {
        const sx = (c.x - cam.worldView.x) * cam.zoom, sy = (c.y - ART_HEIGHT[artType(hoverAgent.type)] * 0.6 - cam.worldView.y) * cam.zoom;
        this.card.show(() => this.cardHtml(hoverAgent), sx, sy, 70 * cam.zoom);
        this.cardWanted = true;
      }
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

  /** Conteúdo do cartão rico: cabeçalho com estado, barras e entradas/saídas com ícones. */
  private cardHtml(a: Agent): string {
    const def = AGENT_DEFS[a.type];
    const w = this.state.world;
    const design = w.designOf(a);
    const stuck = a.status === 'bloqueado' && a.stalledFor >= STALL_ALERT;
    const st = stuck ? 'alerta' : a.status;
    const chip = { ok: ['Funcionando', 'ok'], ocioso: ['Ocioso', 'idle'], bloqueado: ['Bloqueado', 'warn'], alerta: ['Travado', 'bad'] }[st];
    const name = design ? design.name.replace(/\s+v\d+$/, '') : def.name;
    const res = (r: string) => {
      const R = RESOURCES[r as keyof typeof RESOURCES];
      const col = hex(RESOURCE_COLOR[r as keyof typeof RESOURCE_COLOR]);
      return `<i class="res ${R.kind === 'dados' ? 'd' : 'm'}" style="--c:${col}"></i>${esc(R.name)}`;
    };
    const bar = (label: string, frac: number, text: string, cls = '') =>
      `<div class="hc-bar ${cls}"><span>${label}</span><div><b style="width:${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%"></b></div><em>${text}</em></div>`;
    const out: string[] = [];
    out.push(`<header><strong>${esc(name)}</strong>${design ? `<span class="ver">v${design.version}</span>` : ''}<span class="chip ${chip[1]}">${chip[0]}</span></header>`);
    if (a.refusing) out.push(`<p class="warn">⚠ Recebendo item que não usa: ${esc(RESOURCES[a.refusing].name)}</p>`);
    if (design && (def.recipe || a.type === 'verificador')) {
      const r = w.reliabilityBreakdown(a);
      const real = Math.round(r.real);
      out.push(bar(a.type === 'verificador' ? 'Detecção' : 'Confiab.', real / 100, `${real}%`, real >= 90 ? 'good' : real >= 75 ? 'mid' : 'low'));
      const mods: string[] = [];
      if (r.biome) mods.push(`bioma −${r.biome}`);
      if (r.drift) mods.push(`drift −${r.drift}`);
      if (r.xp) mods.push(`exp. +${r.xp}`);
      if (mods.length) out.push(`<p class="mods">bancada ${Math.round(r.design)}% · ${mods.join(' · ')}</p>`);
    }
    if (def.recipe) {
      if (a.running) out.push(bar('Ciclo', a.progress, `${Math.floor(a.progress * 100)}%`, 'cyc'));
      const ins = Object.entries(def.recipe.inputs);
      const io: string[] = [];
      if (ins.length) io.push(`<div><span>Entra</span>${ins.map(([r, n]) => `<p>${res(r)} <b>${a.inputs[r as keyof typeof a.inputs] ?? 0}/${n! * INPUT_CYCLES}</b></p>`).join('')}</div>`);
      const o = (a.type === 'extrator' ? a.resource : def.recipe.output.res) ?? a.resource;
      if (o) io.push(`<div><span>Sai</span><p>${res(o)} <b>${design ? Math.round(w.stats(design.id).perMin * 10) / 10 : outputPerMin(a.type)}/min</b></p></div>`);
      out.push(`<div class="hc-io">${io.join('')}</div>`);
      const bad = a.defects + a.inherited;
      out.push(`<p class="meta">Produzido <b>${a.produced}</b>${bad ? ` · defeituosos <b class="r">${bad}</b>` : ''} · ${Math.round(w.agentPower(a) * 10) / 10} kW</p>`);
    }
    if (a.type === 'verificador' && design) out.push(`<p class="meta">Pegos <b>${a.caught}</b> · passaram <b class="r">${a.missed}</b> · bons rejeitados <b>${a.falsePos}</b></p>`);
    if (def.capacity > 0) out.push(bar(a.type === 'silo' ? 'Estoque' : 'Saída', a.buffer.length / def.capacity, `${a.buffer.length}/${def.capacity}`, a.buffer.length >= def.capacity ? 'low' : ''));
    if (a.type === 'plataforma') {
      const ph = ARCA_PHASES[w.arca.phase];
      out.push(w.arca.done ? `<p class="meta">Arca: todas as fases concluídas</p>` : bar('Arca', w.arca.delivered / ph.n, `${w.arca.delivered}/${ph.n}`, 'arca'));
    }
    if (def.generates) out.push(`<p class="meta">Gera <b>${def.generates} kW</b></p>`);
    if (a.type === 'descarte') out.push(`<p class="meta">Destruídos <b>${a.produced}</b></p>`);
    const links: string[] = [];
    if (def.maxIn > 0) links.push(`entradas ${w.inputsOf(a.id).length}/${def.maxIn}`);
    if (def.maxOut > 0) links.push(`saídas ${w.outputsOf(a.id).length}/${def.maxOut}`);
    if (links.length) out.push(`<p class="meta">${links.join(' · ')}</p>`);
    out.push(`<footer>Clique: detalhes · ${def.maxIn + def.maxOut > 0 ? 'Arraste: conectar · ' : ''}M: mover · X: demolir</footer>`);
    return out.join('');
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
