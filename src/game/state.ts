import Phaser from 'phaser';
import { SimClock, type Speed } from '../sim/clock';
import type { AgentType } from '../sim/types';
import type { World } from '../sim/world';

export type Tool = { kind: 'none' } | { kind: 'build'; type: AgentType };

/**
 * Estado compartilhado entre as cenas. A simulação (World) é a fonte da verdade;
 * as cenas só leem e desenham, e mudam o mundo por aqui.
 */
export class GameState {
  readonly clock = new SimClock();
  readonly events = new Phaser.Events.EventEmitter();
  tool: Tool = { kind: 'none' };
  /** Aba ativa da barra de construção (índice em CATEGORIES). */
  tab = 0;
  /** Retângulos da UI em coordenadas de tela, para não construir por baixo dos painéis. */
  uiRects: Phaser.Geom.Rectangle[] = [];
  /** Painéis HTML sobre o jogo (Oficina), em pixels de tela. */
  overlayRect: () => DOMRect | null = () => null;

  constructor(public world: World) {}

  setTool(tool: Tool): void {
    this.tool = tool;
    this.events.emit('tool', tool);
  }

  toggleBuild(type: AgentType): void {
    const same = this.tool.kind === 'build' && this.tool.type === type;
    this.setTool(same ? { kind: 'none' } : { kind: 'build', type });
  }

  setTab(tab: number): void {
    this.tab = tab;
    this.events.emit('tab', tab);
  }

  setSpeed(s: Speed): void {
    this.clock.setSpeed(s);
    this.events.emit('speed', s);
  }

  togglePause(): void {
    this.clock.togglePause();
    this.events.emit('speed', this.clock.speed);
  }

  replaceWorld(world: World): void {
    this.world = world;
    this.events.emit('world-replaced');
  }

  toast(message: string): void {
    this.events.emit('toast', message);
  }

  isOverUI(x: number, y: number): boolean {
    const o = this.overlayRect();
    if (o && x >= o.left && x <= o.right && y >= o.top && y <= o.bottom) return true;
    return this.uiRects.some((r) => r.contains(x, y));
  }
}
