/** Cartão rico ao passar o mouse sobre um agente (HTML sobre o canvas, sem capturar o mouse). */
export class HoverCard {
  private readonly el: HTMLDivElement;
  private html = '';
  private lastAt = 0;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'hovercard';
    document.body.appendChild(this.el);
  }

  /** (x, y) = ponto da tela junto ao agente; abre à direita, ou à esquerda perto da borda. */
  show(html: () => string, x: number, y: number, gap: number): void {
    const now = performance.now();
    if (now - this.lastAt > 150 || !this.el.classList.contains('open')) {
      this.lastAt = now;
      const h = html();
      if (h !== this.html) {
        this.html = h;
        this.el.innerHTML = h;
      }
    }
    this.el.classList.add('open');
    const w = this.el.offsetWidth, hh = this.el.offsetHeight;
    const right = x + gap + w < window.innerWidth - 12;
    const left = right ? x + gap : Math.max(8, x - gap - w);
    const top = Math.max(8, Math.min(window.innerHeight - hh - 8, y - 40));
    this.el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }

  hide(): void {
    if (this.el.classList.contains('open')) this.el.classList.remove('open');
  }
}

export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
