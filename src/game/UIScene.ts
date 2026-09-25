import Phaser from 'phaser';
import type { Speed } from '../sim/clock';
import { AGENT_DEFS, RESOURCES } from '../sim/defs';
import type { AgentType, ResourceId } from '../sim/types';
import { drawAgentIcon } from './icons';
import { exportSave, importSave, writeSave } from './persistence';
import type { GameState } from './state';
import { AGENT_COLOR, FONT, RESOURCE_COLOR, UI } from './theme';

const SLOT = 56;
const SLOT_GAP = 8;
const SLOTS = 9;
/** Agentes disponíveis na barra (índice = tecla - 1). */
const HOTBAR: (AgentType | null)[] = ['extrator', null, null, null, null, null, null, null, null];

interface Button {
  bg: Phaser.GameObjects.Rectangle;
  text: Phaser.GameObjects.Text;
}

export class UIScene extends Phaser.Scene {
  private stockPanel!: Phaser.GameObjects.Rectangle;
  private stockTexts = {} as Record<ResourceId, Phaser.GameObjects.Text>;
  private agentsText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;

  private hotbar!: Phaser.GameObjects.Container;
  private slotFrames: Phaser.GameObjects.Rectangle[] = [];

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

    this.help = this.add.text(0, 0,
      'Clique: construir\nBotão direito / WASD: mover\nRoda: zoom\n1: Extrator · X: demolir\nEsc: cancelar · Espaço: pausar',
      { fontFamily: FONT, fontSize: '12px', color: UI.muted, lineSpacing: 4 });

    this.toastText = this.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '14px', color: '#ffffff', backgroundColor: '#3a1d22ee', padding: { x: 12, y: 7 } })
      .setOrigin(0.5, 0)
      .setAlpha(0);

    this.state.events.on('tool', this.refreshHotbar, this);
    this.state.events.on('speed', this.refreshSpeed, this);
    this.state.events.on('toast', this.showToast, this);
    this.state.events.on('saved', this.flashSaved, this);

    this.scale.on('resize', this.layout, this);
    this.layout();
    this.refreshHotbar();
    this.refreshSpeed();
  }

  update(): void {
    const w = this.state.world;
    for (const id of Object.keys(RESOURCES) as ResourceId[]) this.stockTexts[id].setText(String(w.stock[id]));
    this.agentsText.setText(`Agentes: ${w.agents.size}`);
    const t = Math.floor(w.time);
    this.timeText.setText(`Tempo de jogo ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);
  }

  // ---------- construção dos painéis ----------

  private buildStock(): void {
    const ids = Object.keys(RESOURCES) as ResourceId[];
    const h = 40 + ids.length * 24 + 44;
    this.stockPanel = this.panel(0, 0, 200, h);
    const title = this.add.text(14, 10, 'ESTOQUE', { fontFamily: FONT, fontSize: '11px', color: UI.muted, fontStyle: 'bold' });
    const items: Phaser.GameObjects.GameObject[] = [this.stockPanel, title];
    ids.forEach((id, i) => {
      const y = 38 + i * 24;
      items.push(this.add.circle(20, y, 6, RESOURCE_COLOR[id]));
      items.push(this.add.text(34, y, RESOURCES[id].name, { fontFamily: FONT, fontSize: '14px', color: UI.text }).setOrigin(0, 0.5));
      const val = this.add.text(186, y, '0', { fontFamily: FONT, fontSize: '14px', color: UI.text, fontStyle: 'bold' }).setOrigin(1, 0.5);
      this.stockTexts[id] = val;
      items.push(val);
    });
    const y2 = 38 + ids.length * 24 + 4;
    this.agentsText = this.add.text(14, y2, '', { fontFamily: FONT, fontSize: '12px', color: UI.muted });
    this.timeText = this.add.text(14, y2 + 18, '', { fontFamily: FONT, fontSize: '12px', color: UI.muted });
    items.push(this.agentsText, this.timeText);
    this.add.container(16, 16, items);
  }

  private buildHotbar(): void {
    const width = SLOTS * SLOT + (SLOTS - 1) * SLOT_GAP + 24;
    const bg = this.panel(0, 0, width, SLOT + 24);
    const items: Phaser.GameObjects.GameObject[] = [bg];
    HOTBAR.forEach((type, i) => {
      const x = 12 + i * (SLOT + SLOT_GAP);
      const frame = this.add.rectangle(x, 12, SLOT, SLOT, 0x1b1f28).setOrigin(0).setStrokeStyle(2, UI.stroke);
      this.slotFrames.push(frame);
      items.push(frame);
      items.push(this.add.text(x + 5, 14, String(i + 1), { fontFamily: FONT, fontSize: '10px', color: UI.muted }));
      if (type) {
        const g = this.add.graphics();
        drawAgentIcon(g, type, x + SLOT / 2, 12 + SLOT / 2 - 4, 12, AGENT_COLOR[type]);
        items.push(g);
        items.push(this.add.text(x + SLOT / 2, 12 + SLOT - 6, AGENT_DEFS[type].name, { fontFamily: FONT, fontSize: '9px', color: UI.text }).setOrigin(0.5, 1));
        frame.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.state.toggleBuild(type));
      } else {
        frame.setAlpha(0.45);
      }
    });
    this.hotbar = this.add.container(0, 0, items);
  }

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

  private button(x: number, y: number, w: number, h: number, label: string, onClick: () => void): Button {
    const bg = this.add.rectangle(x, y, w, h, 0x1f2531).setOrigin(0).setStrokeStyle(1, UI.stroke).setInteractive({ useHandCursor: true });
    const text = this.add.text(x + w / 2, y + h / 2, label, { fontFamily: FONT, fontSize: '13px', color: UI.text }).setOrigin(0.5);
    bg.on('pointerover', () => bg.setFillStyle(0x2a3242));
    bg.on('pointerout', () => bg.setFillStyle(0x1f2531));
    bg.on('pointerdown', onClick);
    return { bg, text };
  }

  // ---------- estado ----------

  private refreshHotbar(): void {
    const tool = this.state.tool;
    HOTBAR.forEach((type, i) => {
      const active = tool.kind === 'build' && tool.type === type;
      this.slotFrames[i].setStrokeStyle(2, active ? UI.accent : UI.stroke);
    });
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
    const { width, height } = this.scale;
    const hbW = SLOTS * SLOT + (SLOTS - 1) * SLOT_GAP + 24;
    const hbH = SLOT + 24;
    this.hotbar.setPosition(Math.round((width - hbW) / 2), height - hbH - 16);
    this.speedGroup.setPosition(width - this.speedGroup.width - 16, 16);
    this.toastText.setPosition(width / 2, 20);

    const stockB = this.stockPanel.getBounds();
    this.state.uiRects = [
      new Phaser.Geom.Rectangle(this.hotbar.x, this.hotbar.y, hbW, hbH),
      new Phaser.Geom.Rectangle(this.speedGroup.x, this.speedGroup.y, this.speedGroup.width, 48),
      new Phaser.Geom.Rectangle(stockB.x, stockB.y, stockB.width, stockB.height),
    ];
    this.help.setPosition(stockB.x + 2, stockB.bottom + 12);
    // Em telas baixas, a ajuda some para não colidir com a barra
    this.help.setVisible(this.help.y + this.help.height < this.hotbar.y - 8 || this.hotbar.x > this.help.x + this.help.width + 16);
  }
}
