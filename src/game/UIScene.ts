import Phaser from 'phaser';
import type { Speed } from '../sim/clock';
import { AGENT_DEFS, AGENT_SIZE, ARCA_PHASES, CAPSULE_KW, CATEGORIES, DRIFT_PP, RESOURCES, RESOURCE_ORDER, STALL_ALERT } from '../sim/defs';
import { isMachine } from '../sim/designs';
import type { Agent, AgentType, ResourceId } from '../sim/types';
import { ANCHOR_X, ANCHOR_Y, FRAME_H, FRAME_W, artKey } from './iso/bake';
import { TH, TW, toIso } from './iso/projection';
import { PALETTES, terraStage } from './iso/terrain';
import { drawItem } from './icons';
import { exportSave, importSave, writeSave } from './persistence';
import type { GameState } from './state';
import { CATEGORY_COLOR, FONT, MONO, RESOURCE_COLOR, SHIP, UI, WARN, hex } from './theme';

const SLOT = 60;
const SLOT_GAP = 6;
const SLOTS = 9;
const TAB_H = 28;
const STOCK_W = 250;
const ROW_H = 22;
const ARCA_H = 108;
const MM_W = 228;
const MM_H = 124;
const CUT = 8;

interface Button {
  bg: Phaser.GameObjects.Graphics;
  hit: Phaser.GameObjects.Zone;
  text: Phaser.GameObjects.Text;
  w: number;
  h: number;
  on: boolean;
  color: number;
}

const STATUS_DOT = { ok: 0x4ade80, ocioso: 0x64748b, bloqueado: WARN, alerta: UI.bad };

/** Painel "de nave": vidro escuro, cantos chanfrados, borda ciano fina e um traço de destaque. */
function drawShipPanel(g: Phaser.GameObjects.Graphics, w: number, h: number, accent: number = SHIP.edge, cut = CUT): void {
  g.clear();
  const pts = [
    { x: cut, y: 0 }, { x: w, y: 0 }, { x: w, y: h - cut }, { x: w - cut, y: h }, { x: 0, y: h }, { x: 0, y: cut },
  ];
  g.fillStyle(SHIP.glass, SHIP.glassAlpha).fillPoints(pts, true);
  g.lineStyle(1, SHIP.edge, 0.55).strokePoints(pts, true);
  // traço de destaque no canto chanfrado superior
  g.lineStyle(2, accent, 1).beginPath();
  g.moveTo(0, cut + 10);
  g.lineTo(0, cut);
  g.lineTo(cut, 0);
  g.lineTo(cut + 18, 0);
  g.strokePath();
  // cantinho inferior direito
  g.lineStyle(2, accent, 0.6).beginPath();
  g.moveTo(w - cut - 12, h);
  g.lineTo(w - cut, h);
  g.lineTo(w, h - cut);
  g.strokePath();
}

export class UIScene extends Phaser.Scene {
  // Estoque e energia
  private stockPanel!: Phaser.GameObjects.Graphics;
  private stockH = 100;
  private stockRows!: Phaser.GameObjects.Container;
  private stockKey = '<init>';
  private stockTexts = new Map<ResourceId, Phaser.GameObjects.Text>();
  private defectTexts = new Map<ResourceId, Phaser.GameObjects.Text>();
  private powerText!: Phaser.GameObjects.Text;
  private powerBar!: Phaser.GameObjects.Graphics;
  private footerText!: Phaser.GameObjects.Text;
  private stockGroup!: Phaser.GameObjects.Container;

  // Arca
  private arcaGroup!: Phaser.GameObjects.Container;
  private arcaTitle!: Phaser.GameObjects.Text;
  private arcaGoal!: Phaser.GameObjects.Text;
  private arcaBar!: Phaser.GameObjects.Graphics;
  private arcaInfo!: Phaser.GameObjects.Text;
  private helpBtn!: Button;

  // Barra
  private hotbar!: Phaser.GameObjects.Container;
  private slotLayer!: Phaser.GameObjects.Container;
  private slotFrames: { g: Phaser.GameObjects.Graphics; x: number; type?: AgentType; locked: boolean; hover: boolean }[] = [];
  private tabButtons: Button[] = [];

  // Velocidade e alertas
  private speedGroup!: Phaser.GameObjects.Container;
  private speedW = 0;
  private speedButtons = new Map<Speed, Button>();
  private savedText!: Phaser.GameObjects.Text;
  private alertGroup!: Phaser.GameObjects.Container;
  private alertBtn!: Button;
  private alertIdx = 0;
  private alertCount = -1;

  // Minimapa
  private mmGroup!: Phaser.GameObjects.Container;
  private mmImage?: Phaser.GameObjects.Image;
  private mmDots!: Phaser.GameObjects.Graphics;
  private mmSeq = 0;
  private mmDragging = false;

  // Dicas
  private helpGroup!: Phaser.GameObjects.Container;
  private helpOpen = false;
  private tutorialOpen = false;
  private overlayOpen = false;
  private slotTip!: Phaser.GameObjects.Text;
  private toastGroup!: Phaser.GameObjects.Container;
  private toastBg!: Phaser.GameObjects.Graphics;
  private toastText!: Phaser.GameObjects.Text;
  private toastTween?: Phaser.Tweens.Tween;

  constructor(private readonly state: GameState) {
    super({ key: 'ui', active: true });
  }

  create(): void {
    this.buildStock();
    this.buildArca();
    this.buildHotbar();
    this.buildTopRight();
    this.buildAlert();
    this.buildMinimap();
    this.buildHelp();

    this.slotTip = this.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '12px', color: '#e8f6ff', backgroundColor: '#0a1420ee', padding: { x: 7, y: 4 } })
      .setOrigin(0.5, 1)
      .setVisible(false)
      .setDepth(50);
    this.toastBg = this.add.graphics();
    this.toastText = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '14px', color: '#e8f6ff', wordWrap: { width: 560 } }).setOrigin(0.5, 0);
    this.toastGroup = this.add.container(0, 0, [this.toastBg, this.toastText]).setAlpha(0).setDepth(60);

    this.state.events.on('tool', this.refreshHotbar, this);
    this.state.events.on('tab', this.renderSlots, this);
    this.state.events.on('designs-changed', this.renderSlots, this);
    this.state.events.on('world-replaced', this.renderSlots, this);
    this.state.events.on('world-replaced', () => this.renderMinimap(terraStage(this.state.world.arca)), this);
    this.state.events.on('terra-stage', (stage: number) => this.renderMinimap(stage), this);
    this.state.events.on('speed', this.refreshSpeed, this);
    this.state.events.on('overlay', (open: boolean) => {
      this.overlayOpen = open;
      this.layout();
    });
    this.state.events.on('toast', this.showToast, this);
    this.state.events.on('saved', this.flashSaved, this);
    this.state.events.on('tutorial-visible', (v: boolean) => {
      this.tutorialOpen = v;
      this.layout();
    });

    const kb = this.input.keyboard!;
    kb.on('keydown-O', () => this.state.events.emit('workshop-toggle'));
    kb.on('keydown-H', () => this.setHelp(!this.helpOpen));
    kb.addCapture('TAB');
    kb.on('keydown-TAB', (e: KeyboardEvent) => {
      const n = CATEGORIES.length;
      this.state.setTab((this.state.tab + (e.shiftKey ? n - 1 : 1)) % n);
    });
    const numKeys = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'];
    numKeys.forEach((k, i) =>
      kb.on(`keydown-${k}`, () => {
        const type = CATEGORIES[this.state.tab].types[i];
        if (!type) return;
        if (!this.state.world.isUnlocked(type)) this.state.toast(`${AGENT_DEFS[type].name}: liberado no Tier 1`);
        else this.state.toggleBuild(type);
      }),
    );

    // Dicas abertas só nas primeiras partidas
    let sessions = 0;
    try {
      sessions = Number(localStorage.getItem('af-sessions') ?? '0');
      localStorage.setItem('af-sessions', String(sessions + 1));
    } catch {
      /* sem armazenamento: abre as dicas */
    }
    this.setHelp(sessions < 2);

    this.scale.on('resize', this.layout, this);
    this.renderSlots();
    this.renderMinimap(terraStage(this.state.world.arca));
    this.refreshSpeed();
    this.layout();
  }

  update(): void {
    const w = this.state.world;
    const stock = w.stockTotals();
    const defects = w.defectTotals();
    const visible = RESOURCE_ORDER.filter((r) => (stock[r] ?? 0) + (defects[r] ?? 0) > 0);
    const key = visible.join(',');
    if (key !== this.stockKey) {
      this.stockKey = key;
      this.rebuildStockRows(visible);
    }
    for (const [r, t] of this.stockTexts) t.setText(String(stock[r] ?? 0));
    for (const [r, t] of this.defectTexts) {
      const n = defects[r] ?? 0;
      t.setText(n ? `+${n} def.` : '');
    }

    const p = w.power;
    const short = p.factor < 1;
    this.powerText
      .setText(`ENERGIA  ${Math.round(p.demand)} / ${p.supply} kW${short ? `  ·  ${Math.round(p.factor * 100)}%` : ''}`)
      .setColor(short ? UI.badText : UI.text);
    const bw = STOCK_W - 28;
    const frac = p.supply > 0 ? Math.min(1, p.demand / p.supply) : 1;
    this.powerBar.clear().fillStyle(0x0a1018, 1).fillRect(0, 0, bw, 4).fillStyle(short ? UI.bad : frac > 0.85 ? WARN : UI.accent, 1).fillRect(0, 0, bw * frac, 4);
    this.updateArca();
    this.updateAlerts();
    this.updateMinimap();
    this.drainEvents();
    const t = Math.floor(w.time);
    this.footerText.setText(`Agentes ${w.agents.size} · Cápsula ${CAPSULE_KW} kW\nTempo ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')} · ${Math.round(this.game.loop.actualFps)} FPS`);
  }

  // ---------- botões ----------

  private button(x: number, y: number, w: number, h: number, label: string, onClick: () => void, size = 13, color: number = UI.accent): Button {
    const bg = this.add.graphics({ x, y });
    const text = this.add.text(x + w / 2, y + h / 2, label, { fontFamily: FONT, fontSize: `${size}px`, color: UI.text }).setOrigin(0.5);
    const hit = this.add.zone(x, y, w, h).setOrigin(0).setInteractive({ useHandCursor: true });
    const btn: Button = { bg, hit, text, w, h, on: false, color };
    const paint = (hover: boolean) => {
      const c = 5;
      const pts = [{ x: c, y: 0 }, { x: w, y: 0 }, { x: w, y: h - c }, { x: w - c, y: h }, { x: 0, y: h }, { x: 0, y: c }];
      bg.clear().fillStyle(btn.on ? 0x0f2a3d : hover ? 0x16222f : 0x0e1520, 1).fillPoints(pts, true);
      bg.lineStyle(1, btn.on ? btn.color : hover ? 0x3b6a86 : 0x22384a, 1).strokePoints(pts, true);
      text.setColor(btn.on ? hex(btn.color) : UI.text);
    };
    (btn as Button & { paint: (h: boolean) => void }).paint = paint;
    paint(false);
    hit.on('pointerover', () => paint(true));
    hit.on('pointerout', () => paint(false));
    hit.on('pointerdown', onClick);
    return btn;
  }

  private setOn(b: Button, on: boolean, color?: number): void {
    b.on = on;
    if (color !== undefined) b.color = color;
    (b as Button & { paint: (h: boolean) => void }).paint(false);
  }

  private title(x: number, y: number, text: string, color = UI.muted): Phaser.GameObjects.Text {
    return this.add.text(x, y, text, { fontFamily: FONT, fontSize: '10px', color, fontStyle: 'bold' }).setLetterSpacing(1.5);
  }

  // ---------- estoque ----------

  private buildStock(): void {
    this.stockPanel = this.add.graphics();
    const title = this.title(14, 11, 'ESTOQUE · SILOS');
    this.stockRows = this.add.container(0, 30);
    this.powerText = this.add.text(14, 0, '', { fontFamily: MONO, fontSize: '12px', color: UI.text, fontStyle: 'bold' });
    this.powerBar = this.add.graphics({ x: 14, y: 0 });
    this.footerText = this.add.text(14, 0, '', { fontFamily: MONO, fontSize: '11px', color: UI.muted, lineSpacing: 3 });
    this.stockGroup = this.add.container(16, 16, [this.stockPanel, title, this.stockRows, this.powerText, this.powerBar, this.footerText]);
  }

  private rebuildStockRows(visible: ResourceId[]): void {
    this.stockRows.removeAll(true);
    this.stockTexts.clear();
    this.defectTexts.clear();
    if (visible.length === 0) {
      this.stockRows.add(this.add.text(14, 2, 'Vazio — ligue algo a um Silo', { fontFamily: FONT, fontSize: '12px', color: UI.muted }));
    }
    visible.forEach((r, i) => {
      const y = 10 + i * ROW_H;
      const g = this.add.graphics();
      drawItem(g, r, 20, y, 5, RESOURCE_COLOR[r]);
      const name = this.add.text(34, y, RESOURCES[r].name, { fontFamily: FONT, fontSize: '13px', color: UI.text }).setOrigin(0, 0.5);
      const def = this.add.text(STOCK_W - 14, y, '', { fontFamily: MONO, fontSize: '11px', color: UI.badText }).setOrigin(1, 0.5);
      const val = this.add.text(STOCK_W - 74, y, '0', { fontFamily: MONO, fontSize: '13px', color: '#e8f6ff', fontStyle: 'bold' }).setOrigin(1, 0.5);
      this.stockTexts.set(r, val);
      this.defectTexts.set(r, def);
      this.stockRows.add([g, name, val, def]);
    });
    const rowsH = Math.max(1, visible.length) * ROW_H;
    const powerY = 30 + rowsH + 10;
    this.powerText.setY(powerY);
    this.powerBar.setY(powerY + 19);
    this.footerText.setY(powerY + 30);
    this.stockH = powerY + 30 + 40;
    drawShipPanel(this.stockPanel, STOCK_W, this.stockH);
    this.layout();
  }

  // ---------- Arca ----------

  private buildArca(): void {
    const bg = this.add.graphics();
    drawShipPanel(bg, STOCK_W, ARCA_H, 0xfb923c);
    this.arcaTitle = this.title(14, 11, '', '#fb923c');
    this.arcaGoal = this.add.text(14, 30, '', { fontFamily: FONT, fontSize: '13px', color: UI.text });
    this.arcaBar = this.add.graphics({ x: 14, y: 54 });
    this.arcaInfo = this.add.text(14, 68, '', { fontFamily: FONT, fontSize: '11px', color: UI.muted, lineSpacing: 3 });
    this.helpBtn = this.button(STOCK_W - 34, 7, 24, 20, '?', () => this.setHelp(!this.helpOpen), 12);
    this.arcaGroup = this.add.container(16, 0, [bg, this.arcaTitle, this.arcaGoal, this.arcaBar, this.arcaInfo, this.helpBtn.bg, this.helpBtn.text, this.helpBtn.hit]);
  }

  private updateArca(): void {
    const a = this.state.world.arca;
    const bw = STOCK_W - 28;
    const bar = (f: number) => {
      const g = this.arcaBar.clear();
      g.fillStyle(0x0a1018, 1).fillRect(0, 0, bw, 7);
      g.fillStyle(0xfb923c, 1).fillRect(0, 0, bw * f, 7);
      g.fillStyle(0x0a1018, 1);
      for (let k = 1; k < 10; k++) g.fillRect((bw * k) / 10, 0, 1, 7);
    };
    if (a.done) {
      this.arcaTitle.setText('ARCA · CONCLUÍDO');
      this.arcaGoal.setText('A Arca pode pousar em Kora-4');
      bar(1);
      this.arcaInfo.setText('Continue expandindo a colônia');
      return;
    }
    const ph = ARCA_PHASES[a.phase];
    this.arcaTitle.setText(`ARCA · FASE ${a.phase + 1} DE ${ARCA_PHASES.length}`);
    this.arcaGoal.setText(`${ph.title}: ${a.delivered} / ${ph.n}`);
    bar(Math.min(a.delivered, ph.n) / ph.n);
    const reward = a.phase === 0 ? 'Libera: Tier 1' : 'Conclui o protótipo';
    this.arcaInfo.setText(`${reward} · Rejeitados pela Arca: ${a.rejected}\nEntregue numa Plataforma de Carga`);
  }

  private drainEvents(): void {
    const w = this.state.world;
    while (w.events.length) {
      const e = w.events.shift();
      if (e === 'tier1') {
        this.state.toast(`Tier 1 liberado! A atmosfera mudou: versões existentes perderam ${DRIFT_PP} pp (drift) — recalibre na Oficina`);
        this.renderSlots();
        this.state.events.emit('designs-changed');
      }
      if (e === 'vitoria') this.state.events.emit('victory');
    }
  }

  // ---------- dicas ----------

  private buildHelp(): void {
    const lines = [
      ['Tab', 'trocar aba'], ['1–9', 'escolher agente'], ['O', 'Oficina'],
      ['Clique', 'construir'], ['Arraste', 'conectar agentes'], ['Clique no agente', 'fixar cartão'],
      ['M', 'mover agente'], ['X', 'demolir agente ou conexão'], ['Esc', 'cancelar'],
      ['Botão direito / WASD', 'câmera'], ['Roda', 'zoom'], ['Espaço', 'pausar'], ['H', 'mostrar/ocultar dicas'],
    ];
    const w = 330, h = 34 + lines.length * 18 + 8;
    const bg = this.add.graphics();
    drawShipPanel(bg, w, h);
    const items: Phaser.GameObjects.GameObject[] = [bg, this.title(14, 11, 'ATALHOS')];
    lines.forEach(([k, d], i) => {
      items.push(this.add.text(14, 32 + i * 18, k, { fontFamily: MONO, fontSize: '11px', color: UI.accentText }));
      items.push(this.add.text(166, 32 + i * 18, d, { fontFamily: FONT, fontSize: '12px', color: UI.text }));
    });
    const close = this.button(w - 30, 7, 22, 20, '×', () => this.setHelp(false), 13);
    items.push(close.bg, close.text, close.hit);
    this.helpGroup = this.add.container(0, 0, items).setSize(w, h);
  }

  private setHelp(open: boolean): void {
    this.helpOpen = open;
    if (this.helpBtn) this.setOn(this.helpBtn, open);
    this.layout();
  }

  // ---------- barra com abas ----------

  private buildHotbar(): void {
    const width = SLOTS * SLOT + (SLOTS - 1) * SLOT_GAP + 24;
    const bg = this.add.graphics({ y: TAB_H });
    drawShipPanel(bg, width, SLOT + 24);
    const items: Phaser.GameObjects.GameObject[] = [bg];
    let tx = 0;
    CATEGORIES.forEach((cat, i) => {
      const w = cat.name.length * 7.5 + 28;
      const btn = this.button(tx, 0, w, TAB_H - 4, cat.name, () => this.state.setTab(i), 12);
      this.tabButtons.push(btn);
      items.push(btn.bg, btn.text, btn.hit);
      tx += w + 4;
    });
    const ws = this.button(width - 132, 0, 132, TAB_H - 4, '⚙ Oficina (O)', () => this.state.events.emit('workshop-toggle'), 12);
    ws.text.setColor(UI.accentText);
    items.push(ws.bg, ws.text, ws.hit);
    this.slotLayer = this.add.container(0, TAB_H);
    items.push(this.slotLayer);
    this.hotbar = this.add.container(0, 0, items);
  }

  private paintSlot(s: (typeof this.slotFrames)[number]): void {
    const tool = this.state.tool;
    const active = !!s.type && tool.kind === 'build' && tool.type === s.type;
    const c = 6;
    const pts = [{ x: c, y: 0 }, { x: SLOT, y: 0 }, { x: SLOT, y: SLOT - c }, { x: SLOT - c, y: SLOT }, { x: 0, y: SLOT }, { x: 0, y: c }];
    const g = s.g.clear();
    g.fillStyle(active ? 0x0f2a3d : s.hover && s.type && !s.locked ? 0x142232 : 0x0b121b, s.type ? 1 : 0.5).fillPoints(pts, true);
    g.lineStyle(active ? 2 : 1, active ? UI.accent : s.hover && s.type ? 0x3b6a86 : 0x1f3445, 1).strokePoints(pts, true);
    if (s.type && !s.locked) {
      const cat = CATEGORIES.find((k) => k.types.includes(s.type!))!;
      g.fillStyle(CATEGORY_COLOR[cat.id], 0.9).fillRect(4, SLOT - 3, SLOT - 8, 2);
    }
  }

  private renderSlots(): void {
    this.slotLayer.removeAll(true);
    this.slotFrames = [];
    const cat = CATEGORIES[this.state.tab];
    for (let i = 0; i < SLOTS; i++) {
      const type: AgentType | undefined = cat.types[i];
      const x = 12 + i * (SLOT + SLOT_GAP);
      const g = this.add.graphics({ x, y: 12 });
      const locked = type ? !this.state.world.isUnlocked(type) : false;
      const slot = { g, x, type, locked, hover: false };
      this.slotFrames.push(slot);
      this.slotLayer.add(g);
      this.paintSlot(slot);
      this.slotLayer.add(this.add.text(x + 5, 14, String(i + 1), { fontFamily: MONO, fontSize: '10px', color: UI.muted }));
      if (!type) continue;
      // Miniatura: a mesma arte isométrica do mapa (quadro 0)
      const key = artKey(type as never, 'regolito');
      if (this.textures.exists(key)) {
        const img = this.add
          .image(x + SLOT / 2, 12 + SLOT - 17, key, 0)
          .setOrigin(ANCHOR_X / FRAME_W, ANCHOR_Y / FRAME_H)
          .setScale(0.34);
        if (locked) img.setTint(0x3a404c);
        this.slotLayer.add(img);
      }
      const hit = this.add.zone(x, 12, SLOT, SLOT).setOrigin(0).setInteractive({ useHandCursor: true });
      this.slotLayer.add(hit);
      if (locked) {
        this.slotLayer.add(this.add.text(x + SLOT / 2, 12 + SLOT - 4, '🔒 Tier 1', { fontFamily: FONT, fontSize: '9px', color: UI.muted }).setOrigin(0.5, 1));
        hit.on('pointerdown', () => this.state.toast(`${AGENT_DEFS[type].name}: liberado no Tier 1 (entregue 20 Mapas de pouso à Arca)`));
        continue;
      }
      const w = this.state.world;
      const design = isMachine(type) ? w.designs.get(w.activeDesign[type] ?? '') : undefined;
      const base = AGENT_DEFS[type].name;
      const label = this.add
        .text(x + SLOT / 2, 12 + SLOT - 5, base, { fontFamily: FONT, fontSize: '9px', color: UI.text, align: 'center' })
        .setOrigin(0.5, 1);
      if (label.width > SLOT - 6) label.setScale((SLOT - 6) / label.width);
      this.slotLayer.add(label);
      if (design) this.slotLayer.add(this.add.text(x + SLOT - 4, 14, `v${design.version}`, { fontFamily: MONO, fontSize: '10px', color: UI.accentText }).setOrigin(1, 0));
      const full = design ? design.name : base;
      hit
        .on('pointerdown', () => this.state.toggleBuild(type))
        .on('pointerover', () => {
          slot.hover = true;
          this.paintSlot(slot);
          this.slotTip.setText(full).setPosition(this.hotbar.x + x + SLOT / 2, this.hotbar.y - 6).setVisible(true);
        })
        .on('pointerout', () => {
          slot.hover = false;
          this.paintSlot(slot);
          this.slotTip.setVisible(false);
        });
    }
    this.tabButtons.forEach((b, i) => this.setOn(b, i === this.state.tab, CATEGORY_COLOR[CATEGORIES[i].id]));
    this.refreshHotbar();
  }

  private refreshHotbar(): void {
    for (const s of this.slotFrames) this.paintSlot(s);
  }

  // ---------- canto superior direito ----------

  private buildTopRight(): void {
    const speeds: { s: Speed; label: string }[] = [
      { s: 0, label: '❚❚' },
      { s: 1, label: '1×' },
      { s: 2, label: '2×' },
      { s: 4, label: '4×' },
    ];
    const bw = 40;
    const width = speeds.length * (bw + 4) + 16 + 4 * 84;
    const bg = this.add.graphics();
    drawShipPanel(bg, width, 48);
    const items: Phaser.GameObjects.GameObject[] = [bg];
    speeds.forEach(({ s, label }, i) => {
      const btn = this.button(8 + i * (bw + 4), 8, bw, 32, label, () => this.state.setSpeed(s));
      this.speedButtons.set(s, btn);
      items.push(btn.bg, btn.text, btn.hit);
    });
    const x0 = 8 + speeds.length * (bw + 4) + 8;
    const mk = (i: number, label: string, fn: () => void) => {
      const b = this.button(x0 + i * 84, 8, 80, 32, label, fn);
      items.push(b.bg, b.text, b.hit);
    };
    mk(0, 'Exportar', () => exportSave(this.state.world));
    mk(1, 'Importar', () => {
      importSave(this.state.world.map)
        .then((w) => {
          this.state.replaceWorld(w);
          writeSave(w);
          this.state.toast('Save importado');
        })
        .catch(() => this.state.toast('Arquivo de save inválido'));
    });
    mk(2, 'Diário', () => this.state.events.emit('diary-export'));
    mk(3, 'Novo jogo', () => this.state.events.emit('new-game'));
    this.savedText = this.add.text(width - 8, 52, 'Salvo', { fontFamily: MONO, fontSize: '11px', color: UI.muted }).setOrigin(1, 0).setAlpha(0);
    items.push(this.savedText);
    this.speedW = width;
    this.speedGroup = this.add.container(0, 16, items);
  }

  private refreshSpeed(): void {
    for (const [s, btn] of this.speedButtons) this.setOn(btn, this.state.clock.speed === s);
  }

  // ---------- alertas ----------

  private alerts(): Agent[] {
    return [...this.state.world.agents.values()].filter((a) => a.status === 'bloqueado' && a.stalledFor >= STALL_ALERT);
  }

  private buildAlert(): void {
    this.alertBtn = this.button(0, 0, 130, 32, '', () => this.nextAlert(), 13, UI.bad);
    this.alertGroup = this.add.container(0, 0, [this.alertBtn.bg, this.alertBtn.text, this.alertBtn.hit]).setVisible(false);
  }

  private updateAlerts(): void {
    const n = this.alerts().length;
    if (n !== this.alertCount) {
      this.alertCount = n;
      this.alertGroup.setVisible(n > 0);
      this.alertBtn.text.setText(`⚠ ${n} ${n === 1 ? 'alerta' : 'alertas'}`);
      this.setOn(this.alertBtn, true, UI.bad);
      this.layout();
    }
    if (n > 0) this.alertBtn.text.setAlpha(0.65 + 0.35 * Math.abs(Math.sin(this.time.now / 350)));
  }

  private nextAlert(): void {
    const list = this.alerts().sort((a, b) => a.id - b.id);
    if (!list.length) return;
    this.alertIdx = (this.alertIdx + 1) % list.length;
    this.state.events.emit('focus-agent', list[this.alertIdx].id);
  }

  // ---------- minimapa ----------

  private mmLeft = 0;
  private mmTop = 0;
  private mmK = 1;

  private buildMinimap(): void {
    const bg = this.add.graphics();
    drawShipPanel(bg, MM_W, MM_H);
    this.mmDots = this.add.graphics();
    const hit = this.add.zone(0, 0, MM_W, MM_H).setOrigin(0).setInteractive({ useHandCursor: true });
    const go = (p: Phaser.Input.Pointer) => {
      const lx = p.x - this.mmGroup.x, ly = p.y - this.mmGroup.y;
      const wx = this.mmLeft + (lx - 8) / this.mmK;
      const wy = this.mmTop + (ly - 8) / this.mmK;
      this.scene.get('world').cameras.main.centerOn(wx, wy);
    };
    hit.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.mmDragging = true;
      go(p);
    });
    hit.on('pointermove', (p: Phaser.Input.Pointer) => this.mmDragging && p.isDown && go(p));
    hit.on('pointerup', () => (this.mmDragging = false));
    hit.on('pointerout', () => (this.mmDragging = false));
    this.mmGroup = this.add.container(0, 0, [bg, this.mmDots, hit]);
  }

  /** Terreno do minimapa: um losango por célula, com a paleta do estágio. */
  private renderMinimap(stage: number): void {
    const m = this.state.world.map;
    const P = PALETTES[stage] ?? PALETTES[0];
    const left = toIso(0, m.height).x, right = toIso(m.width, 0).x, top = toIso(0, 0).y, bottom = toIso(m.width, m.height).y;
    const k = Math.min((MM_W - 16) / (right - left), (MM_H - 16) / (bottom - top));
    this.mmLeft = left;
    this.mmTop = top;
    this.mmK = k;
    const cw = Math.ceil((right - left) * k), ch = Math.ceil((bottom - top) * k);
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const c = canvas.getContext('2d')!;
    const col: Record<string, string> = { planicie: P.plain[0], cratera: P.crater[1], serra: P.ridge[1], rocha: P.rock, nevoa: P.fog };
    for (let y = 0; y < m.height; y++) {
      for (let x = 0; x < m.width; x++) {
        const p = toIso(x + 0.5, y + 0.5);
        const px = (p.x - left) * k, py = (p.y - top) * k, hw = (TW * k) / 2 + 0.3, hh = (TH * k) / 2 + 0.3;
        c.fillStyle = col[m.terrainAt(x, y) ?? 'nevoa'];
        c.beginPath(); c.moveTo(px, py - hh); c.lineTo(px + hw, py); c.lineTo(px, py + hh); c.lineTo(px - hw, py); c.closePath(); c.fill();
      }
    }
    const key = `minimap-${++this.mmSeq}`;
    this.textures.addCanvas(key, canvas);
    const old = this.mmImage;
    this.mmImage = this.add.image(8, 8, key).setOrigin(0);
    this.mmGroup.addAt(this.mmImage, 1);
    if (old) {
      const ok = old.texture.key;
      old.destroy();
      if (this.textures.exists(ok)) this.textures.remove(ok);
    }
  }

  private updateMinimap(): void {
    const g = this.mmDots.clear();
    const k = this.mmK;
    const blink = Math.sin(this.time.now / 180) > 0;
    for (const a of this.state.world.agents.values()) {
      const p = toIso(a.x + AGENT_SIZE / 2, a.y + AGENT_SIZE / 2);
      const alert = a.status === 'bloqueado' && a.stalledFor >= STALL_ALERT;
      if (alert && !blink) continue;
      g.fillStyle(alert ? STATUS_DOT.alerta : STATUS_DOT[a.status], 1).fillRect(8 + (p.x - this.mmLeft) * k - 1.5, 8 + (p.y - this.mmTop) * k - 1.5, alert ? 4 : 3, alert ? 4 : 3);
    }
    const v = this.scene.get('world').cameras.main.worldView;
    g.lineStyle(1, 0xe8f6ff, 0.85).strokeRect(8 + (v.x - this.mmLeft) * k, 8 + (v.y - this.mmTop) * k, v.width * k, v.height * k);
  }

  // ---------- avisos ----------

  private showToast(message: string): void {
    this.toastTween?.stop();
    this.toastText.setText(message);
    const w = this.toastText.width + 28, h = this.toastText.height + 16;
    drawShipPanel(this.toastBg, w, h, UI.accent, 6);
    this.toastBg.setPosition(-w / 2, -8);
    this.toastText.setPosition(0, 0);
    this.toastGroup.setAlpha(1);
    this.toastTween = this.tweens.add({ targets: this.toastGroup, alpha: 0, delay: 1600 + message.length * 30, duration: 400 });
  }

  private flashSaved(): void {
    this.savedText.setAlpha(1);
    this.tweens.add({ targets: this.savedText, alpha: 0, delay: 900, duration: 500 });
  }

  // ---------- layout responsivo ----------

  private layout(): void {
    if (!this.hotbar || !this.helpGroup || !this.mmGroup) return;
    const { width, height } = this.scale;
    const hbW = SLOTS * SLOT + (SLOTS - 1) * SLOT_GAP + 24;
    const hbH = TAB_H + SLOT + 24;
    this.hotbar.setPosition(Math.round((width - hbW) / 2), height - hbH - 16);
    this.speedGroup.setPosition(width - this.speedW - 16, 16);
    this.alertGroup.setPosition(width - this.speedW - 16 - 138, 24);
    this.toastGroup.setPosition(width / 2, 24);

    const sx = this.stockGroup.x;
    const sy = this.stockGroup.y;
    this.arcaGroup.setPosition(sx, sy + this.stockH + 8);
    const arcaBottom = this.arcaGroup.y + ARCA_H;
    this.state.events.emit('hud-bottom', arcaBottom);

    // Minimapa no canto inferior direito; se a tela for estreita, sobe acima da barra
    const mmX = width - MM_W - 16;
    const overlapsBar = mmX < this.hotbar.x + hbW + 8;
    this.mmGroup.setPosition(mmX, overlapsBar ? this.hotbar.y - MM_H - 8 : height - MM_H - 16);
    this.mmGroup.setVisible(width >= 700 && !this.overlayOpen);

    // Dicas: à direita da coluna esquerda
    this.helpGroup.setPosition(sx + STOCK_W + 8, this.arcaGroup.y);
    this.helpGroup.setVisible(this.helpOpen && !this.tutorialOpen && width >= 640);

    const rects = [
      new Phaser.Geom.Rectangle(this.hotbar.x, this.hotbar.y, hbW, hbH),
      new Phaser.Geom.Rectangle(this.speedGroup.x, this.speedGroup.y, this.speedW, 48),
      new Phaser.Geom.Rectangle(sx, sy, STOCK_W, this.stockH),
      new Phaser.Geom.Rectangle(sx, this.arcaGroup.y, STOCK_W, ARCA_H),
    ];
    if (this.mmGroup.visible) rects.push(new Phaser.Geom.Rectangle(this.mmGroup.x, this.mmGroup.y, MM_W, MM_H));
    if (this.helpGroup.visible) rects.push(new Phaser.Geom.Rectangle(this.helpGroup.x, this.helpGroup.y, this.helpGroup.width, this.helpGroup.height));
    if (this.alertGroup.visible) rects.push(new Phaser.Geom.Rectangle(this.alertGroup.x, this.alertGroup.y, 130, 32));
    this.state.uiRects = rects;
  }
}
