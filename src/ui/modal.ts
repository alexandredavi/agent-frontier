/** Janela de confirmação simples. Resolve com o `id` do botão escolhido (ou 'cancel' com Esc). */
export function confirmDialog(title: string, body: string, buttons: { id: string; label: string; primary?: boolean }[]): Promise<string> {
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.className = 'modal';
    root.innerHTML = `<div class="card"><h2></h2><p></p><div class="actions"></div></div>`;
    root.querySelector('h2')!.textContent = title;
    root.querySelector('p')!.textContent = body;
    const actions = root.querySelector('.actions')!;
    const close = (id: string) => {
      root.remove();
      resolve(id);
    };
    for (const b of buttons) {
      const el = document.createElement('button');
      el.textContent = b.label;
      if (b.primary) el.className = 'primary';
      el.addEventListener('click', () => close(b.id));
      actions.appendChild(el);
    }
    root.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') close('cancel');
    });
    root.tabIndex = -1;
    document.body.appendChild(root);
    root.focus();
  });
}
