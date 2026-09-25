import type { GameState } from '../game/state';

/** Cartão fixo de um agente (clique no agente abre; Esc ou × fecha). */
export class Inspector {
  private readonly root: HTMLDivElement;
  private agentId: number | null = null;
  private overlayOpen = false;

  constructor(private readonly state: GameState) {
    this.root = document.createElement('div');
    this.root.className = 'insp';
    document.body.appendChild(this.root);
    state.events.on('pin', (id: number | null) => {
      this.agentId = id;
      this.render();
    });
    state.events.on('overlay', (open: boolean) => {
      this.overlayOpen = open;
      this.root.style.right = open ? '432px' : '16px';
    });
    state.events.on('world-replaced', () => {
      this.agentId = null;
      this.render();
    });
    setInterval(() => this.render(), 250);
  }

  get pinned(): number | null {
    return this.agentId;
  }

  private render(): void {
    const a = this.agentId !== null ? this.state.world.agents.get(this.agentId) : undefined;
    if (!a) {
      this.agentId = null;
      this.root.classList.remove('open');
      return;
    }
    const text = this.state.describeAgent(a);
    const [title, ...rest] = text.split('\n');
    this.root.innerHTML = `<header><b></b><button title="Fechar (Esc)">×</button></header><pre></pre>`;
    this.root.querySelector('b')!.textContent = title;
    this.root.querySelector('pre')!.textContent = rest.join('\n');
    this.root.querySelector('button')!.addEventListener('click', () => this.state.events.emit('pin', null));
    this.root.classList.add('open');
    void this.overlayOpen;
  }
}
