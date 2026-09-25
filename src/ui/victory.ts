import { ARCA_PHASES } from '../sim/defs';
import type { GameState } from '../game/state';

/** Tela exibida quando a Fase final da Arca é concluída. */
export class Victory {
  private readonly root: HTMLDivElement;

  constructor(private readonly state: GameState) {
    this.root = document.createElement('div');
    this.root.className = 'victory';
    this.root.addEventListener('keydown', (e) => e.stopPropagation());
    document.body.appendChild(this.root);
    state.events.on('victory', () => this.show());
  }

  private show(): void {
    const w = this.state.world;
    const t = Math.floor(w.time);
    const designs = [...w.designs.values()].filter((d) => !d.factory).length;
    const delivered = ARCA_PHASES.reduce((s, p) => s + p.n, 0);
    this.root.innerHTML = `
      <div class="card">
        <div class="kicker">MERIDIAN · RELATÓRIO FINAL</div>
        <h1>Protótipo concluído</h1>
        <p>Kora-4 está pronta: a Arca pode pousar com seus 10.000 colonos.</p>
        <table>
          <tr><td>Tempo de jogo</td><td>${Math.floor(t / 3600)}h ${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}min</td></tr>
          <tr><td>Agentes em operação</td><td>${w.agents.size}</td></tr>
          <tr><td>Versões criadas na Oficina</td><td>${designs}</td></tr>
          <tr><td>Cargas entregues à Arca</td><td>${delivered}</td></tr>
        </table>
        <button>Continuar jogando</button>
      </div>`;
    this.root.classList.add('open');
    this.root.querySelector('button')!.addEventListener('click', () => this.root.classList.remove('open'));
  }
}
