import './workshop.css';
import { type BenchResult, runBench } from '../sim/bench';
import { AGENT_DEFS, recipeText } from '../sim/defs';
import { CARDS, CORES, type CardId, type CoreId, type Design, MACHINE_ROLES, TOOLS, type ToolId, designStats } from '../sim/designs';
import { Rng } from '../sim/rng';
import { initialWorkshopDesign } from '../sim/workshopSelection';
import type { AgentType } from '../sim/types';
import type { GameState } from '../game/state';

interface Draft {
  baseId: string;
  name: string;
  nameEdited: boolean;
  role: AgentType;
  core: CoreId;
  tool: ToolId;
  cards: CardId[];
}

interface Bench {
  running: boolean;
  progress: number;
  draft?: BenchResult;
  base?: BenchResult;
}

const BENCH_MS = 3000;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const fmt = (n: number, d = 1) => n.toLocaleString('pt-BR', { maximumFractionDigits: d });

/** Oficina: painel HTML à direita para montar versões de agentes de IA. */
export class Workshop {
  readonly root: HTMLDivElement;
  private selectedId: string;
  /** Agente com o cartão fixado no mapa (a Oficina abre na versão dele). */
  private pinnedId: number | null = null;
  /** Houve um evento de pin desde a última abertura (reabrir sem fixar nada preserva a navegação). */
  private pinFresh = false;
  private draft: Draft | null = null;
  private bench: Bench = { running: false, progress: 0 };
  /** Recalibração em andamento (animação da bancada com dados novos). */
  private recal: { id: string; progress: number } | null = null;
  /** Pergunta pendente depois de salvar: atualizar agentes da versão anterior? */
  private ask: { fromId: string; toId: string; count: number } | null = null;

  constructor(private readonly state: GameState) {
    this.root = document.createElement('div');
    this.root.className = 'ws';
    // Teclas digitadas na Oficina não devem controlar o jogo
    this.root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
      e.stopPropagation();
    });
    this.root.addEventListener('keyup', (e) => e.stopPropagation());
    this.root.addEventListener('wheel', (e) => e.stopPropagation());
    document.body.appendChild(this.root);
    this.selectedId = initialWorkshopDesign(state.world, null, null);
    state.events.on('pin', (id: number | null) => {
      this.pinnedId = id;
      this.pinFresh = true;
    });
    state.events.on('workshop-toggle', () => this.toggle());
    state.events.on('world-replaced', () => {
      this.draft = null;
      this.ask = null;
      this.pinnedId = null;
      this.pinFresh = false;
      this.selectedId = initialWorkshopDesign(this.world, null, null);
      this.render();
    });
  }

  get isOpen(): boolean {
    return this.root.classList.contains('open');
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  open(): void {
    // Pin novo manda na seleção; o mesmo pin de antes não desfaz a navegação. Nunca abre numa versão travada.
    this.selectedId = initialWorkshopDesign(this.world, this.pinFresh ? this.pinnedId : null, this.selectedId);
    this.pinFresh = false;
    this.root.classList.add('open');
    this.world.mark('oficina_aberta');
    this.render();
    this.state.events.emit('overlay', true);
  }

  close(): void {
    this.root.classList.remove('open');
    this.state.events.emit('overlay', false);
  }

  /** Retângulo em pixels de tela (para o jogo não construir por baixo). */
  rect(): DOMRect | null {
    return this.isOpen ? this.root.getBoundingClientRect() : null;
  }

  // ---------- ações ----------

  private get world() {
    return this.state.world;
  }

  private startDraft(from: Design): void {
    const v = this.world.nextVersion(from.role);
    this.draft = {
      baseId: from.id,
      name: `${AGENT_DEFS[from.role].name} v${v}`,
      nameEdited: false,
      role: from.role,
      core: from.core,
      tool: from.tool,
      cards: [...from.cards],
    };
    this.bench = { running: false, progress: 0 };
    this.ask = null;
  }

  private autoName(): void {
    const d = this.draft!;
    if (!d.nameEdited) d.name = `${AGENT_DEFS[d.role].name} v${this.world.nextVersion(d.role)}`;
  }

  private runBench(): void {
    if (!this.draft || this.bench.running) return;
    this.world.mark('primeira_bancada');
    this.world.count('bancadas');
    const seed = (Math.random() * 2 ** 32) >>> 0;
    const base = this.world.designs.get(this.draft.baseId)!;
    const draftDesign = this.draftDesign();
    // A versão base só serve de comparação se for do mesmo papel
    const result = { draft: runBench(draftDesign, 100, new Rng(seed)), base: base.role === draftDesign.role ? runBench(base, 100, new Rng(seed ^ 0x5bd1e995)) : undefined };
    this.bench = { running: true, progress: 0 };
    const t0 = performance.now();
    const step = () => {
      this.bench.progress = Math.min(1, (performance.now() - t0) / BENCH_MS);
      if (this.bench.progress < 1) {
        this.renderBench(result.draft);
        requestAnimationFrame(step);
      } else {
        this.bench = { running: false, progress: 1, ...result };
        this.render();
      }
    };
    this.render();
    requestAnimationFrame(step);
  }

  private draftDesign(): Design {
    const d = this.draft!;
    return { id: 'draft', name: d.name, role: d.role, core: d.core, tool: d.tool, cards: d.cards, version: 0, factory: false };
  }

  private save(): void {
    const d = this.draft!;
    const version = this.world.nextVersion(d.role);
    const id = `u-${d.role}-${version}-${Date.now().toString(36)}`;
    const design: Design = { id, name: d.name.trim() || `${AGENT_DEFS[d.role].name} v${version}`, role: d.role, core: d.core, tool: d.tool, cards: [...d.cards], version, factory: false };
    this.world.addDesign(design);
    this.world.setActive(id);
    this.world.mark('primeira_versao');
    this.world.count('versoes');
    const base = this.world.designs.get(d.baseId)!;
    const count = base.role === design.role ? this.world.agentsUsing(base.id).length : 0;
    this.draft = null;
    this.selectedId = id;
    this.ask = count > 0 ? { fromId: base.id, toId: id, count } : null;
    this.state.events.emit('designs-changed');
    this.state.toast(`${design.name} salva e colocada na barra`);
    this.render();
  }

  private recalibrate(id: string): void {
    if (this.recal) return;
    const t0 = performance.now();
    this.recal = { id, progress: 0 };
    const step = () => {
      if (!this.recal) return;
      this.recal.progress = Math.min(1, (performance.now() - t0) / 1500);
      const bar = this.root.querySelector<HTMLDivElement>('[data-recal] > div');
      if (bar) bar.style.width = `${this.recal.progress * 100}%`;
      if (this.recal.progress < 1) requestAnimationFrame(step);
      else {
        this.world.recalibrate(id);
        this.world.mark('primeira_recalibracao');
        this.world.count('recalibracoes');
        const n = this.world.agentsUsing(id).length;
        this.recal = null;
        this.state.toast(`${this.world.designs.get(id)!.name} recalibrada · ${n} agente${n === 1 ? '' : 's'} sem drift`);
        this.state.events.emit('designs-changed');
        this.render();
      }
    };
    this.render();
    requestAnimationFrame(step);
  }

  private answer(all: boolean): void {
    if (!this.ask) return;
    if (all) {
      const n = this.world.applyDesign(this.ask.fromId, this.ask.toId);
      this.state.toast(`${n} agente${n === 1 ? '' : 's'} atualizado${n === 1 ? '' : 's'}`);
    }
    this.ask = null;
    this.render();
  }

  // ---------- desenho ----------

  render(): void {
    if (!this.isOpen) return;
    const w = this.world;
    const sel = w.designs.get(this.selectedId) ?? w.designs.get(initialWorkshopDesign(w, null, null))!;
    this.selectedId = sel.id;

    const list = MACHINE_ROLES.map((role) => {
      const designs = [...w.designs.values()].filter((d) => d.role === role).sort((a, b) => a.version - b.version);
      const rows = designs
        .map((d) => {
          const n = w.agentsUsing(d.id).length;
          const star = w.activeDesign[role] === d.id ? '<span class="badge star" title="Na barra">★</span>' : '';
          const drift = d.drift ? `<span class="badge" style="color:#f5b041" title="Precisa recalibrar">⚠ drift −${d.drift}</span>` : '';
          const lock = !w.isUnlocked(role) ? '<span class="badge">🔒 Tier 1</span>' : '';
          return `<div class="row ${d.id === sel.id && !this.draft ? 'sel' : ''}" data-sel="${d.id}">
            <span>${esc(d.name)}${d.factory ? '<span class="badge">fábrica</span>' : ''}${star}${drift}${lock}</span>
            <span class="badge">${n} agente${n === 1 ? '' : 's'}</span></div>`;
        })
        .join('');
      return `<div class="role">${AGENT_DEFS[role].name}</div>${rows}`;
    }).join('');

    this.root.innerHTML = `
      <header><h2>OFICINA</h2><button class="x" data-act="close" title="Fechar (O)">×</button></header>
      <div class="body">
        <h3>Versões</h3>
        <div class="list">${list}</div>
        ${this.draft ? this.editorHtml() : this.viewHtml(sel)}
      </div>`;
    this.bind();
  }

  private statsTable(cur: Design, base?: Design): string {
    const a = designStats(cur);
    const b = base ? designStats(base) : undefined;
    const kw = (d: Design) => (d.role === 'extrator' ? 4 : AGENT_DEFS[d.role].kw) * designStats(d).kwMult;
    const cmp = (x: number, y: number | undefined, higherIsBetter = true, unit = '') => {
      if (y === undefined || Math.abs(x - y) < 1e-6) return `${fmt(x)}${unit}`;
      const better = higherIsBetter ? x > y : x < y;
      return `${fmt(x)}${unit} <span class="${better ? 'up' : 'down'}">${x > y ? '▲' : '▼'}</span>`;
    };
    return `<table>
      <tr><th></th><th>${base ? 'Esta' : ''}</th>${b ? '<th>Base</th>' : ''}</tr>
      <tr><td>${cur.role === 'verificador' ? 'Inspeções/min' : 'Itens/min'}</td><td>${cmp(a.perMin, b?.perMin)}</td>${b ? `<td>${fmt(b.perMin)}</td>` : ''}</tr>
      <tr><td>${cur.role === 'verificador' ? 'Detecção' : 'Confiabilidade'} (bancada)</td><td>${cmp(a.reliability, b?.reliability, true, '%')}</td>${b ? `<td>${fmt(b.reliability)}%</td>` : ''}</tr>
      <tr><td>Consumo (trabalhando)</td><td>${cmp(kw(cur), base ? kw(base) : undefined, false, ' kW')}</td>${base ? `<td>${fmt(kw(base))} kW</td>` : ''}</tr>
    </table>`;
  }

  private viewHtml(d: Design): string {
    const cards = d.cards.length ? d.cards.map((c) => CARDS[c].name).join(', ') : 'nenhum';
    const active = this.world.activeDesign[d.role] === d.id;
    const locked = !this.world.designUnlocked(d);
    const n = this.world.agentsUsing(d.id).length;
    const drift = d.drift
      ? `<div class="ask" style="border-color:#f5b041;background:#2a2110">⚠ <b>Drift −${d.drift} pp</b>: o ambiente mudou depois que esta versão foi calibrada. ${n} agente${n === 1 ? '' : 's'} afetado${n === 1 ? '' : 's'}.
         ${this.recal?.id === d.id ? '<div class="bar" data-recal><div></div></div><div class="note">Recalibrando com dados novos…</div>' : `<div class="actions"><button class="primary" data-act="recal">Recalibrar (rodar bancada com dados novos)</button></div>`}</div>`
      : '';
    return `
      <h3>${esc(d.name)}</h3>
      <div class="note">${CORES[d.core].name} · ${TOOLS[d.tool].name} · Cartões: ${esc(cards)}</div>
      <div class="note">Receita: ${recipeText(d.role)}</div>
      ${this.statsTable(d)}
      ${drift}
      ${locked ? '<div class="note">🔒 Liberado no Tier 1 (entregue 20 Mapas de pouso à Arca).</div>' : ''}
      <div class="actions">
        <button class="primary" data-act="dup" ${locked ? 'disabled' : ''}>${d.factory ? 'Duplicar para editar' : 'Criar nova versão a partir desta'}</button>
        <button data-act="activate" ${active || locked ? 'disabled' : ''}>${active ? '★ Na barra' : 'Usar na barra'}</button>
      </div>
      ${
        this.ask
          ? `<div class="ask">Atualizar os <b>${this.ask.count}</b> agente${this.ask.count === 1 ? '' : 's'} da <b>${esc(this.world.designs.get(this.ask.fromId)!.name)}</b> para esta versão?
             <div class="actions"><button class="primary" data-act="apply-all">Todos</button><button data-act="apply-new">Só os novos</button></div></div>`
          : ''
      }`;
  }

  private editorHtml(): string {
    const d = this.draft!;
    const base = this.world.designs.get(d.baseId)!;
    const core = CORES[d.core];
    const cur = this.draftDesign();
    const w = this.world;
    const toolBtns = (Object.keys(TOOLS) as ToolId[])
      .map((t) => {
        const ok = TOOLS[t].roles.some((r) => w.isUnlocked(r));
        return `<button class="${t === d.tool ? 'on' : ''}" data-tool="${t}" ${ok ? '' : 'disabled title="Tier 1"'}>${TOOLS[t].name}${ok ? '' : ' 🔒'}</button>`;
      })
      .join('');
    const roles = TOOLS[d.tool].roles;
    const recipeBtns =
      roles.length > 1
        ? `<h3>Receita</h3><div class="actions" style="margin-top:0">${roles
            .map((r) => `<button class="${r === d.role ? 'on' : ''}" data-role="${r}" ${w.isUnlocked(r) ? '' : 'disabled'}>${AGENT_DEFS[r].name}${w.isUnlocked(r) ? '' : ' 🔒'}</button>`)
            .join('')}</div>`
        : '';
    const slots = Array.from({ length: core.slots }, (_, i) => {
      const c = d.cards[i];
      return c ? `<div class="slot filled" data-rm="${i}" title="Clique para remover">${CARDS[c].name} ×</div>` : '<div class="slot">vazio</div>';
    }).join('');
    const full = d.cards.length >= core.slots;
    const cardBtns = (Object.keys(CARDS) as CardId[])
      .map((c) => {
        const cd = CARDS[c];
        const dis = cd.lockedUntil || full;
        return `<button class="card" data-card="${c}" ${dis ? 'disabled' : ''}><span>${cd.name}${cd.lockedUntil ? ` <small>(${cd.lockedUntil})</small>` : ''}</span><small>${cd.effect}</small></button>`;
      })
      .join('');
    const sameRole = base.role === d.role;
    const changed = !sameRole || d.core !== base.core || d.cards.join() !== base.cards.join();

    return `
      <h3>Nova versão · a partir de ${esc(base.name)}</h3>
      <input type="text" data-name value="${esc(d.name)}" maxlength="40" />
      <h3>Núcleo</h3>
      <div class="actions" style="margin-top:0">${(Object.keys(CORES) as CoreId[])
        .map((c) => {
          const lockedCore = c === 'avancado' && w.tier < 1;
          return `<button class="${c === d.core ? 'on' : ''}" data-core="${c}" ${lockedCore ? 'disabled' : ''}>${CORES[c].name} <small>(${CORES[c].slots} slots${lockedCore ? ' · 🔒 Tier 1' : ''})</small></button>`;
        })
        .join('')}</div>
      <h3>Ferramenta</h3>
      <div class="grid">${toolBtns}</div>
      ${recipeBtns}
      <div class="note">Receita: ${recipeText(d.role)}</div>
      <h3>Cartões de diretiva · cada um custa −5% de velocidade</h3>
      <div class="slots">${slots}</div>
      <div class="cards" style="margin-top:6px">${cardBtns}</div>
      <h3>Ficha técnica</h3>
      ${this.statsTable(cur, sameRole ? base : undefined)}
      <h3>Bancada de testes</h3>
      <div data-bench>${this.benchHtml()}</div>
      <div class="actions">
        <button data-act="bench" ${this.bench.running ? 'disabled' : ''}>▶ Rodar bancada (100 amostras)</button>
        <button class="primary" data-act="save" ${changed && !this.bench.running ? '' : 'disabled'}>Salvar como nova versão</button>
        <button data-act="cancel">Descartar</button>
      </div>`;
  }

  private benchHtml(live?: BenchResult): string {
    const b = this.bench;
    if (b.running && live) {
      const shown = Math.floor(live.samples * b.progress);
      const good = Math.round(live.good * b.progress);
      return `<div class="bar"><div style="width:${b.progress * 100}%"></div></div>
        <div class="note">Rodando amostras… ${shown}/${live.samples} · confiáveis ${good} · alucinações ${Math.max(0, shown - good)}</div>`;
    }
    if (!b.draft) return '<div class="note">Roda a versão com 100 amostras limpas, como um eval. Cada rodada varia um pouco.</div>';
    const r = b.draft;
    const base = b.base;
    const cmp = (x: number, y: number | undefined, unit = '', higher = true) => {
      if (y === undefined || Math.abs(x - y) < 1e-6) return `${fmt(x)}${unit}`;
      const better = higher ? x > y : x < y;
      return `${fmt(x)}${unit} <span class="${better ? 'up' : 'down'}">${x > y ? '▲' : '▼'}</span>`;
    };
    return `<table>
      <tr><th></th><th>Esta</th>${base ? '<th>Base</th>' : ''}</tr>
      <tr><td>Confiáveis</td><td>${cmp(r.good, base?.good, '/100')}</td>${base ? `<td>${base.good}/100</td>` : ''}</tr>
      <tr><td>Alucinações</td><td>${cmp(r.failures, base?.failures, '', false)}</td>${base ? `<td>${base.failures}</td>` : ''}</tr>
      <tr><td>Itens/min</td><td>${cmp(r.perMin, base?.perMin)}</td>${base ? `<td>${fmt(base.perMin)}</td>` : ''}</tr>
      <tr><td>Consumo</td><td>${cmp(r.kw, base?.kw, ' kW', false)}</td>${base ? `<td>${fmt(base.kw)} kW</td>` : ''}</tr>
      <tr><td>Tempo de jogo</td><td>${fmt(r.gameSeconds / 60)} min</td>${base ? `<td>${fmt(base.gameSeconds / 60)} min</td>` : ''}</tr>
    </table>`;
  }

  private renderBench(live: BenchResult): void {
    const el = this.root.querySelector('[data-bench]');
    if (el) el.innerHTML = this.benchHtml(live);
  }

  private bind(): void {
    const q = <T extends HTMLElement>(sel: string) => [...this.root.querySelectorAll<T>(sel)];
    q('[data-act="close"]').forEach((b) => b.addEventListener('click', () => this.close()));
    q('[data-sel]').forEach((r) =>
      r.addEventListener('click', () => {
        this.selectedId = r.dataset.sel!;
        this.draft = null;
        this.ask = null;
        this.render();
      }),
    );
    const act = (name: string, fn: () => void) => q(`[data-act="${name}"]`).forEach((b) => b.addEventListener('click', fn));
    act('dup', () => {
      this.startDraft(this.world.designs.get(this.selectedId)!);
      this.render();
    });
    act('activate', () => {
      this.world.setActive(this.selectedId);
      this.state.events.emit('designs-changed');
      this.render();
    });
    act('recal', () => this.recalibrate(this.selectedId));
    act('apply-all', () => this.answer(true));
    act('apply-new', () => this.answer(false));
    act('bench', () => this.runBench());
    act('save', () => this.save());
    act('cancel', () => {
      this.draft = null;
      this.render();
    });
    const d = this.draft;
    if (!d) return;
    const changed = () => {
      this.bench = { running: false, progress: 0 };
      this.render();
    };
    const name = this.root.querySelector<HTMLInputElement>('[data-name]');
    name?.addEventListener('input', () => {
      d.name = name.value;
      d.nameEdited = true;
    });
    q('[data-core]').forEach((b) =>
      b.addEventListener('click', () => {
        d.core = b.dataset.core as CoreId;
        d.cards = d.cards.slice(0, CORES[d.core].slots);
        changed();
      }),
    );
    q('[data-tool]').forEach((b) =>
      b.addEventListener('click', () => {
        d.tool = b.dataset.tool as ToolId;
        if (!TOOLS[d.tool].roles.includes(d.role)) d.role = TOOLS[d.tool].roles.find((r) => this.world.isUnlocked(r)) ?? TOOLS[d.tool].roles[0];
        this.autoName();
        changed();
      }),
    );
    q('[data-role]').forEach((b) =>
      b.addEventListener('click', () => {
        d.role = b.dataset.role as AgentType;
        this.autoName();
        changed();
      }),
    );
    q('[data-card]').forEach((b) =>
      b.addEventListener('click', () => {
        if (d.cards.length < CORES[d.core].slots) d.cards.push(b.dataset.card as CardId);
        changed();
      }),
    );
    q('[data-rm]').forEach((b) =>
      b.addEventListener('click', () => {
        d.cards.splice(Number(b.dataset.rm), 1);
        changed();
      }),
    );
  }
}
