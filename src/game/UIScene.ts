import Phaser from 'phaser';
import type { Speed } from '../sim/clock';
import { AGENT_DEFS, CAPSULE_KW, CATEGORIES, RESOURCES, RESOURCE_ORDER } from '../sim/defs';
import { isMachine } from '../sim/designs';
import type { AgentType, ResourceId } from '../sim/types';
import { drawAgentIcon, drawItem } from './icons';
import { exportSave, importSave, writeSave } from './persistence';
import type { GameState } from './state';
import { AGENT_COLOR, CATEGORY_COLOR, FONT, RESOURCE_COLOR, UI, hex } from './theme';

const SLOT = 56;
const SLOT_GAP = 8;
const SLOTS = 9;
const TAB_H = 26;
const STOCK_W = 250;
const ROW_H = 22;

interface Button {
  bg: Phaser.GameObjects.Rectangle;
  text: Phaser.GameObjects.Text;
}

export class UIScene extends Phaser.Scene {
  // Estoque e energia
  private stockPanel!: Phaser.GameObjects.Rectangle;
  private stockRows!: Phaser.GameObjects.Container;
  private stockKey = '<init>';
  private stockTexts = new Map<ResourceId, Phaser.GameObjects.Text>();
  private defectTexts = new Map<ResourceId, Phaser.GameObjects.Text>();
  private powerText!: Phaser.GameObjects.Text;
  private footerText!: Phaser.GameObjects.Text;
  private stockGroup!: Phaser.GameObjects.Container;

  // Barra
  private hotbar!: Phaser.GameObjects.Container;
  private slotLayer!: Phaser.GameObjects.Container;
  private slotFrames: Phaser.GameObjects.Rectangle[] = [];
  private tabButtons: Button[] = [];

  // Velocidade
  private speedGroup!: Phaser.GameObjects.Container;
  private speedButtons = new Map<Speed, Button>();
  private savedText!: Phaser.GameObjects.Text;

  private help!: Phaser.GameObjects.Text;
  private toastText!: Phaser.GameObjects.Text;
  private toastTween?: Phaser.Tweens.Tween;

  constructor(private readonly state: GameState) {
    super({ key: 'ui', active: true });
  }

  create(): void {
    this.buildStock();
    this.buildHotbar();
    this.buildTopRight();

    this.help = this.add.text(
      0,
      0,
      'Tab: trocar aba · 1–9: escolher agente · O: Oficina\nClique: construir · Arraste agente→agente: conectar\nX: demolir agente ou conexão · Esc: cancelar\nBotão direito / WASD: mover · Roda: zoom\nEspaço: pausar',
      { fontFamily: FONT, fontSize: '12px', color: UI.muted, lineSpacing: 4 },
    );

    this.toastText = this.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '14px', color: '#ffffff', backgroundColor: '#1f2531f0', padding: { x: 12, y: 7 } })
      .setOrigin(0.5, 0)
      .setAlpha(0);

    this.state.events.on('tool', this.refreshHotbar, this);
    this.state.events.on('tab', this.renderSlots, this);
    this.state.events.on('designs-changed', this.renderSlots, this);
    this.state.events.on('world-replaced', this.renderSlots, this);
    this.state.events.on('speed', this.refreshSpeed, this);
    this.state.events.on('toast', this.showToast, this);
    this.state.events.on('saved', this.flashSaved, this);

    const kb = this.input.keyboard!;
    kb.on('keydown-O', () => this.state.events.emit('workshop-toggle'));
    kb.addCapture('TAB');
    kb.on('keydown-TAB', (e: KeyboardEvent) => {
      const n = CATEGORIES.length;
      this.state.setTab((this.state.tab + (e.shiftKey ? n - 1 : 1)) % n);
    });
    const numKeys = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'];
    numKeys.forEach((k, i) =>
      kb.on(`keydown-${k}`, () => {
        const type = CATEGORIES[this.state.tab].types[i];
        if (type) this.state.toggleBuild(type);
      }),
    );

    this.scale.on('resize', this.layout, this);
    this.renderSlots();
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
      .setText(`Energia ${Math.round(p.demand)} / ${p.supply} kW${short ? ` · ${Math.round(p.factor * 100)}%` : ''}`)
      .setColor(short ? UI.badText : UI.text);
    const t = Math.floor(w.time);
    this.footerText.setText(`Agentes: ${w.agents.size} · Cápsula: ${CAPSULE_KW} kW\nTempo de jogo ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);
  }

  // ---------- estoque ----------

  private buildStock(): void {
    this.stockPanel = this.panel(0, 0, STOCK_W, 100);
    const title = this.add.text(14, 10, 'ESTOQUE (SILOS)', { fontFamily: FONT, fontSize: '11px', color: UI.muted, fontStyle: 'bold' });
    this.stockRows = this.add.container(0, 30);
    this.powerText = this.add.text(14, 0, '', { fontFamily: FONT, fontSize: '13px', color: UI.text, fontStyle: 'bold' });
    this.footerText = this.add.text(14, 0, '', { fontFamily: FONT, fontSize: '12px', color: UI.muted, lineSpacing: 3 });
    this.stockGroup = this.add.container(16, 16, [this.stockPanel, title, this.stockRows, this.powerText, this.footerText]);
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
      const def = this.add.text(STOCK_W - 14, y, '', { fontFamily: FONT, fontSize: '11px', color: UI.badText }).setOrigin(1, 0.5);
      const val = this.add.text(STOCK_W - 70, y, '0', { fontFamily: FONT, fontSize: '13px', color: UI.text, fontStyle: 'bold' }).setOrigin(1, 0.5);
      this.stockTexts.set(r, val);
      this.defectTexts.set(r, def);
      this.stockRows.add([g, name, val, def]);
    });
    const rowsH = Math.max(1, visible.length) * ROW_H;
    const powerY = 30 + rowsH + 8;
    this.powerText.setY(powerY);
    this.footerText.setY(powerY + 22);
    this.stockPanel.setSize(STOCK_W, powerY + 22 + 38);
    this.stockPanel.setDisplaySize(STOCK_W, powerY + 22 + 38);
    this.layout();
  }

  // ---------- barra com abas ----------

  private buildHotbar(): void {
    const width = SLOTS * SLOT + (SLOTS - 1) * SLOT_GAP + 24;
    const bg = this.panel(0, TAB_H, width, SLOT + 24);
    const items: Phaser.GameObjects.GameObject[] = [bg];
    let tx = 0;
    CATEGORIES.forEach((cat, i) => {
      const w = cat.name.length * 7.5 + 26;
      const btn = this.button(tx, 0, w, TAB_H - 2, cat.name, () => this.state.setTab(i), 12);
      this.tabButtons.push(btn);
      items.push(btn.bg, btn.text);
      tx += w + 4;
    });
    const ws = this.button(width - 130, 0, 130, TAB_H - 2, '⚙ Oficina (O)', () => this.state.events.emit('workshop-toggle'), 12);
    ws.bg.setStrokeStyle(1, UI.accent);
    ws.text.setColor(UI.accentText);
    items.push(ws.bg, ws.text);
    this.slotLayer = this.add.container(0, TAB_H);
    items.push(this.slotLayer);
    this.hotbar = this.add.container(0, 0, items);
  }

  private renderSlots(): void {
    this.slotLayer.removeAll(true);
    this.slotFrames = [];
    const cat = CATEGORIES[this.state.tab];
    for (let i = 0; i < SLOTS; i++) {
      const type: AgentType | undefined = cat.types[i];
      const x = 12 + i * (SLOT + SLOT_GAP);
      const frame = this.add.rectangle(x, 12, SLOT, SLOT, 0x1b1f28).setOrigin(0).setStrokeStyle(2, UI.stroke);
      this.slotFrames.push(frame);
      this.slotLayer.add(frame);
      this.slotLayer.add(this.add.text(x + 5, 14, String(i + 1), { fontFamily: FONT, fontSize: '10px', color: UI.muted }));
      if (type) {
        const g = this.add.graphics();
        drawAgentIcon(g, type, x + SLOT / 2, 12 + SLOT / 2 - 5, 11, AGENT_COLOR[type]);
        const w = this.state.world;
        const title = isMachine(type) ? (w.designs.get(w.activeDesign[type] ?? '')?.name ?? AGENT_DEFS[type].name) : AGENT_DEFS[type].name;
        const label = this.add
          .text(x + SLOT / 2, 12 + SLOT - 5, title, { fontFamily: FONT, fontSize: '9px', color: UI.text })
          .setOrigin(0.5, 1);
        if (label.width > SLOT - 4) label.setScale((SLOT - 4) / label.width);
        this.slotLayer.add([g, label]);
        frame.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.state.toggleBuild(type));
      } else {
        frame.setAlpha(0.4);
      }
    }
    this.tabButtons.forEach((b, i) => {
      const on = i === this.state.tab;
      const color = CATEGORY_COLOR[CATEGORIES[i].id];
      b.bg.setStrokeStyle(on ? 2 : 1, on ? color : UI.stroke);
      b.text.setColor(on ? hex(color) : UI.muted);
    });
    this.refreshHotbar();
  }

  private refreshHotbar(): void {
    const tool = this.state.tool;
    const types = CATEGORIES[this.state.tab].types;
    this.slotFrames.forEach((f, i) => {
      const active = tool.kind === 'build' && tool.type === types[i];
      f.setStrokeStyle(2, active ? UI.accent : UI.stroke);
    });
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
    const width = speeds.length * (bw + 4) + 16 + 2 * 84;
    const bg = this.panel(0, 0, width, 48);
    const items: Phaser.GameObjects.GameObject[] = [bg];
    speeds.forEach(({ s, label }, i) => {
      const btn = this.button(8 + i * (bw + 4), 8, bw, 32, label, () => this.state.setSpeed(s));
      this.speedButtons.set(s, btn);
      items.push(btn.bg, btn.text);
    });
    const x0 = 8 + speeds.length * (bw + 4) + 8;
    const exp = this.button(x0, 8, 80, 32, 'Exportar', () => exportSave(this.state.world));
    const imp = this.button(x0 + 84, 8, 80, 32, 'Importar', () => {
      importSave(this.state.world.map)
        .then((w) => {
          this.state.replaceWorld(w);
          writeSave(w);
          this.state.toast('Save importado');
        })
        .catch(() => this.state.toast('Arquivo de save inválido'));
    });
    items.push(exp.bg, exp.text, imp.bg, imp.text);
    this.savedText = this.add.text(width - 8, 52, 'Salvo', { fontFamily: FONT, fontSize: '11px', color: UI.muted }).setOrigin(1, 0).setAlpha(0);
    items.push(this.savedText);
    this.speedGroup = this.add.container(0, 16, items);
    this.speedGroup.setSize(width, 48);
  }

  private panel(x: number, y: number, w: number, h: number): Phaser.GameObjects.Rectangle {
    return this.add.rectangle(x, y, w, h, UI.panel, UI.panelAlpha).setOrigin(0).setStrokeStyle(1, UI.stroke);
  }

  private button(x: number, y: number, w: number, h: number, label: string, onClick: () => void, size = 13): Button {
    const bg = this.add.rectangle(x, y, w, h, 0x1f2531).setOrigin(0).setStrokeStyle(1, UI.stroke).setInteractive({ useHandCursor: true });
    const text = this.add.text(x + w / 2, y + h / 2, label, { fontFamily: FONT, fontSize: `${size}px`, color: UI.text }).setOrigin(0.5);
    bg.on('pointerover', () => bg.setFillStyle(0x2a3242));
    bg.on('pointerout', () => bg.setFillStyle(0x1f2531));
    bg.on('pointerdown', onClick);
    return { bg, text };
  }

  private refreshSpeed(): void {
    for (const [s, btn] of this.speedButtons) {
      const on = this.state.clock.speed === s;
      btn.bg.setStrokeStyle(on ? 2 : 1, on ? UI.accent : UI.stroke);
      btn.text.setColor(on ? UI.accentText : UI.text);
    }
  }

  private showToast(message: string): void {
    this.toastTween?.stop();
    this.toastText.setText(message).setAlpha(1);
    this.toastTween = this.tweens.add({ targets: this.toastText, alpha: 0, delay: 1600, duration: 400 });
  }

  private flashSaved(): void {
    this.savedText.setAlpha(1);
    this.tweens.add({ targets: this.savedText, alpha: 0, delay: 900, duration: 500 });
  }

  // ---------- layout responsivo ----------

  private layout(): void {
    if (!this.hotbar || !this.help) return;
    const { width, height } = this.scale;
    const hbW = SLOTS * SLOT + (SLOTS - 1) * SLOT_GAP + 24;
    const hbH = TAB_H + SLOT + 24;
    this.hotbar.setPosition(Math.round((width - hbW) / 2), height - hbH - 16);
    this.speedGroup.setPosition(width - this.speedGroup.width - 16, 16);
    this.toastText.setPosition(width / 2, 20);

    const sx = this.stockGroup.x;
    const sy = this.stockGroup.y;
    const sh = this.stockPanel.displayHeight;
    this.help.setPosition(sx + 2, sy + sh + 12);
    this.help.setVisible(this.help.y + this.help.height < this.hotbar.y - 8 || this.hotbar.x > this.help.x + this.help.width + 16);

    this.state.uiRects = [
      new Phaser.Geom.Rectangle(this.hotbar.x, this.hotbar.y, hbW, hbH),
      new Phaser.Geom.Rectangle(this.speedGroup.x, this.speedGroup.y, this.speedGroup.width, 48),
      new Phaser.Geom.Rectangle(sx, sy, STOCK_W, sh),
    ];
  }
}
