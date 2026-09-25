import type { GameState } from '../game/state';
import { TUTORIAL_STEPS } from '../sim/world';

const TEXT: Record<(typeof TUTORIAL_STEPS)[number], { title: string; hint: string }> = {
  sensor: { title: 'Construa um Sensor', hint: 'Aba Extração (Tab troca de aba), tecla 2. Clique num lugar livre do mapa. Sensores captam Telemetria em qualquer terreno.' },
  cartografo: { title: 'Construa um Cartógrafo', hint: 'Aba Processamento. Ele transforma 10 Telemetria em 1 Mapa de pouso.' },
  conectar: { title: 'Conecte o Sensor ao Cartógrafo', hint: 'Arraste do Sensor até o Cartógrafo (alcance de 12 células). Os losangos que andam na linha são dados.' },
  plataforma: { title: 'Envie os Mapas para a Arca', hint: 'Aba Logística: construa uma Plataforma de Carga e conecte o Cartógrafo a ela.' },
  entregar: { title: 'Entregue o primeiro Mapa de pouso', hint: 'Acompanhe o painel ARCA. Se a energia ficar vermelha, construa um Painel Solar (aba Energia). Espaço pausa; 4× acelera.' },
  bancada: { title: 'Teste um agente na Oficina', hint: 'Aperte O. Escolha o Cartógrafo v1, clique em Duplicar e rode a bancada. Compare Núcleo e cartões antes de salvar.' },
  verificador: { title: 'Filtre as alucinações', hint: 'Cerca de 20% dos Mapas saem defeituosos e a Arca os rejeita. Coloque um Verificador (Processamento) entre o Cartógrafo e a Plataforma. Ligue a 2ª saída dele num Descarte.' },
};

/** Painel de objetivos da MERIDIAN (só em jogo novo). */
export class Tutorial {
  private readonly root: HTMLDivElement;
  private lastKey = '';
  private finishedShown = false;

  constructor(private readonly state: GameState) {
    this.root = document.createElement('div');
    this.root.className = 'tut';
    this.root.addEventListener('keydown', (e) => e.stopPropagation());
    document.body.appendChild(this.root);
    state.events.on('hud-bottom', (y: number) => (this.root.style.top = `${y + 8}px`));
    state.events.on('world-replaced', () => {
      this.lastKey = '';
      this.finishedShown = false;
    });
    setInterval(() => this.render(), 300);
  }

  get visible(): boolean {
    return this.root.classList.contains('open');
  }

  private render(): void {
    const t = this.state.world.tutorial;
    const show = !!t && !t.skipped && (!t.done || !this.finishedShown);
    const key = t ? `${t.step}-${t.done}-${t.skipped}-${this.finishedShown}` : 'none';
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.root.classList.toggle('open', show);
    this.state.events.emit('tutorial-visible', show);
    if (!show || !t) return;

    if (t.done) {
      this.root.innerHTML = `<div class="kicker">MERIDIAN</div><h3>Tudo pronto, Operador.</h3>
        <p>Agora é com você: entregue <b>20 Mapas de pouso</b> para liberar o Tier 1. Melhore seus agentes na Oficina quando a qualidade cair.</p>
        <div class="actions"><button data-close>Entendido</button></div>`;
      this.root.querySelector('[data-close]')!.addEventListener('click', () => {
        this.finishedShown = true;
        this.render();
      });
      return;
    }
    const items = TUTORIAL_STEPS.map((s, i) => {
      const cls = i < t.step ? 'done' : i === t.step ? 'cur' : '';
      return `<li class="${cls}">${i < t.step ? '✓ ' : ''}${TEXT[s].title}</li>`;
    }).join('');
    const cur = TEXT[TUTORIAL_STEPS[t.step]];
    this.root.innerHTML = `<div class="kicker">MERIDIAN · OBJETIVOS ${t.step + 1}/${TUTORIAL_STEPS.length}</div>
      <p class="hint"><b>${cur.title}.</b> ${cur.hint}</p>
      <ol>${items}</ol>
      <div class="actions"><button data-skip>Pular tutorial</button></div>`;
    this.root.querySelector('[data-skip]')!.addEventListener('click', () => {
      t.skipped = true;
      this.state.world.count('tutorial_pulado');
      this.render();
    });
  }
}
