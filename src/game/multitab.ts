/**
 * A mesma colônia aberta em duas abas: cada aba salva sozinha a cada 10 s e a última a salvar
 * sobrescreve a outra, sem aviso. Aqui a aba escuta os saves das outras (evento `storage`, que só
 * dispara nas outras abas) e avisa quando alguém gravou o espaço que ela está usando.
 */
const SLOT_PREFIX = 'agent-frontier:slot:';

/** Índice do espaço de save a que a chave se refere, ou null se não for um espaço. */
export function slotOfKey(key: string | null): number | null {
  if (!key?.startsWith(SLOT_PREFIX)) return null;
  const n = Number(key.slice(SLOT_PREFIX.length));
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/**
 * Liga o aviso. `current()` = espaço em uso nesta aba (null na tela de abertura).
 * `warn` é chamado no máximo uma vez a cada `everyMs`.
 */
export function watchOtherTabs(
  target: Pick<Window, 'addEventListener'>,
  current: () => number | null,
  warn: () => void,
  everyMs = 60_000,
  now: () => number = Date.now,
): void {
  let last = -Infinity;
  target.addEventListener('storage', (e: Event) => {
    const slot = slotOfKey((e as StorageEvent).key);
    if (slot === null || slot !== current()) return;
    if (now() - last < everyMs) return;
    last = now();
    warn();
  });
}
