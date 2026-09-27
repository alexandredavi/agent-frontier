import type { GameState } from '../game/state';
import { SLOT_COUNT, type SlotMeta, deleteSlot, duplicateSlot, freeSlot, lastSlot, listSlots, loadSlot, renameSlot } from '../game/persistence';
import type { GameMap } from '../sim/map';
import { World } from '../sim/world';
import { esc } from './hovercard';
import { confirmDialog, promptDialog } from './modal';
import './title.css';

export interface TitleActions {
  /** Começa a jogar `world` no espaço `slot` (nome só para jogos novos/importados). */
  enter(world: World, slot: number, name?: string): void;
  importFile(): Promise<World>;
}

type Pick = { kind: 'new'; name: string } | { kind: 'import'; world: World; name: string };

const fmtTime = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`;
};
const fmtDate = (t: number) => new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Tela de abertura: Continuar, Novo jogo, Carregar e Importar, com até 10 espaços de save. */
export class TitleScreen {
  private readonly root: HTMLDivElement;
  private view: 'menu' | 'slots' = 'menu';
  private pick: Pick | null = null;
  private note = '';

  constructor(
    private readonly state: GameState,
    private readonly map: GameMap,
    private readonly actions: TitleActions,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'title';
    document.body.appendChild(this.root);
    this.root.addEventListener('click', (e) => this.onClick(e));
    this.open();
  }

  open(): void {
    this.view = 'menu';
    this.pick = null;
    this.note = '';
    this.root.classList.add('open');
    this.render();
  }

  close(): void {
    this.root.classList.remove('open');
  }

  /** Coloca um mundo importado num espaço livre (ou pede um espaço para substituir). */
  placeImported(world: World, name: string): void {
    const free = freeSlot();
    if (free >= 0) {
      this.close();
      this.actions.enter(world, free, name);
      return;
    }
    this.root.classList.add('open');
    this.pick = { kind: 'import', world, name };
    this.view = 'slots';
    this.note = 'Os 10 espaços estão ocupados: escolha um para substituir pelo save importado.';
    this.render();
  }

  private render(): void {
    const slots = listSlots();
    const last = lastSlot();
    const used = slots.filter(Boolean).length;
    const lm = last !== null ? slots[last] : null;
    const menu = `
      <nav class="t-menu t-panel">
        <button data-act="continue" ${lm ? '' : 'disabled'}>
          <b>Continuar</b>
          <small>${lm ? `${esc(lm.name)} · ${esc(lm.arca)} · ${fmtTime(lm.time)}` : 'Nenhum jogo salvo ainda'}</small>
        </button>
        <button data-act="new"><b>Novo jogo</b><small>Pouso em Kora-4 com o tutorial da MERIDIAN</small></button>
        <button data-act="load" ${used ? '' : 'disabled'}><b>Carregar</b><small>${used}/${SLOT_COUNT} espaços usados</small></button>
        <button data-act="import"><b>Importar</b><small>Abrir um save exportado (.json)</small></button>
      </nav>`;
    const rows = slots.map((m, i) => this.row(m, i, last)).join('');
    const title = this.pick ? (this.pick.kind === 'new' ? `Onde salvar “${esc(this.pick.name)}”?` : 'Onde colocar o save importado?') : 'Salvamentos';
    const slotsView = `
      <section class="t-slots t-panel">
        <header><h2>${title}</h2><span>${used}/${SLOT_COUNT}</span></header>
        ${this.note ? `<p class="t-note">${esc(this.note)}</p>` : ''}
        <div class="t-list">${rows}</div>
        <footer><button data-act="back">← Voltar</button></footer>
      </section>`;
    this.root.innerHTML = `
      <div class="t-shade"></div>
      <div class="t-col${this.view === 'slots' ? ' compact' : ''}">
        <div class="t-logo">
          <div class="t-kicker">KORA-4 · OPERAÇÃO ARCA</div>
          <h1>AGENT <br/>FRONTIER</h1>
          <p>Monte agentes de IA, automatize a colônia e prepare o planeta para a Arca.</p>
        </div>
        ${this.view === 'menu' ? menu : slotsView}
      </div>
      <div class="t-foot"${this.view === 'slots' ? ' hidden' : ''}>Protótipo · os saves ficam neste navegador · use Exportar para guardar uma cópia</div>`;
  }

  private row(m: SlotMeta | null, i: number, last: number | null): string {
    const picking = !!this.pick;
    if (!m) {
      return `<div class="t-row empty"><div class="t-thumb"></div><div class="t-info"><b>Espaço ${i + 1}</b><small>vazio</small></div>
        <div class="t-acts">${picking ? `<button class="primary" data-act="use" data-i="${i}">Usar</button>` : ''}</div></div>`;
    }
    const acts = picking
      ? `<button class="danger" data-act="use" data-i="${i}">Substituir</button>`
      : `<button class="primary" data-act="play" data-i="${i}">Jogar</button>
         <button data-act="rename" data-i="${i}" title="Renomear">Renomear</button>
         <button data-act="dup" data-i="${i}" title="Duplicar">Duplicar</button>
         <button class="danger" data-act="del" data-i="${i}" title="Apagar">Apagar</button>`;
    return `<div class="t-row${i === last ? ' last' : ''}">
      <div class="t-thumb">${m.thumb ? `<img src="${m.thumb}" alt="" />` : ''}</div>
      <div class="t-info"><b>${esc(m.name)}</b>${i === last ? '<em>último</em>' : ''}
        <small>${esc(m.arca)} · ${m.agents} agentes</small>
        <small>${fmtTime(m.time)} de jogo · ${fmtDate(m.savedAt)}</small></div>
      <div class="t-acts">${acts}</div></div>`;
  }

  private async onClick(e: MouseEvent): Promise<void> {
    const el = (e.target as HTMLElement).closest('button');
    if (!el || el.disabled) return;
    const act = el.dataset.act;
    const i = Number(el.dataset.i);
    switch (act) {
      case 'continue': {
        const last = lastSlot();
        if (last !== null) this.play(last);
        break;
      }
      case 'new': {
        const names = new Set(listSlots().map((m) => m?.name));
        let n = 1;
        while (names.has(`Colônia ${n}`)) n++;
        const name = await promptDialog('Novo jogo', 'Nome da colônia', `Colônia ${n}`, 'Começar');
        if (!name) return;
        const free = freeSlot();
        if (free >= 0) return this.start(new World(this.map), free, name);
        this.pick = { kind: 'new', name };
        this.view = 'slots';
        this.note = 'Os 10 espaços estão ocupados: escolha um para substituir.';
        return this.render();
      }
      case 'load':
        this.view = 'slots';
        this.pick = null;
        this.note = '';
        return this.render();
      case 'import':
        try {
          const w = await this.actions.importFile();
          this.placeImported(w, 'Save importado');
        } catch {
          this.note = 'Arquivo de save inválido.';
          this.state.toast('Arquivo de save inválido');
        }
        return;
      case 'back':
        this.view = 'menu';
        this.pick = null;
        this.note = '';
        return this.render();
      case 'play':
        return this.play(i);
      case 'use': {
        const p = this.pick;
        if (!p) return;
        const m = listSlots()[i];
        if (m) {
          const ok = await confirmDialog('Substituir save?', `“${m.name}” será apagado e substituído. Isso não pode ser desfeito.`, [
            { id: 'cancel', label: 'Cancelar' },
            { id: 'ok', label: 'Substituir', primary: true },
          ]);
          if (ok !== 'ok') return;
        }
        return p.kind === 'new' ? this.start(new World(this.map), i, p.name) : this.start(p.world, i, p.name);
      }
      case 'rename': {
        const m = listSlots()[i];
        if (!m) return;
        const name = await promptDialog('Renomear', 'Novo nome da colônia', m.name, 'Salvar');
        if (name) renameSlot(i, name);
        return this.render();
      }
      case 'dup': {
        const to = duplicateSlot(i);
        this.note = to < 0 ? 'Sem espaço livre (ou sem memória no navegador) para duplicar.' : `Cópia criada no espaço ${to + 1}.`;
        return this.render();
      }
      case 'del': {
        const m = listSlots()[i];
        if (!m) return;
        const ok = await confirmDialog('Apagar save?', `“${m.name}” será apagado deste navegador. Exporte antes se quiser guardar uma cópia.`, [
          { id: 'cancel', label: 'Cancelar' },
          { id: 'ok', label: 'Apagar', primary: true },
        ]);
        if (ok === 'ok') deleteSlot(i);
        this.note = '';
        if (!listSlots().some(Boolean)) this.view = 'menu';
        return this.render();
      }
    }
  }

  private play(i: number): void {
    const w = loadSlot(i, this.map);
    if (!w) {
      this.note = 'Não foi possível abrir este save (arquivo corrompido?).';
      this.view = 'slots';
      return this.render();
    }
    this.start(w, i);
  }

  private start(world: World, slot: number, name?: string): void {
    this.close();
    this.actions.enter(world, slot, name);
  }
}
