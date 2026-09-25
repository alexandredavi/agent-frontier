# Agent Frontier

Jogo de automação com agentes de IA no planeta Kora-4. Protótipo em Phaser 3 + TypeScript.

Design completo: GDD "Agent Frontier — Game Design Doc (versão espacial)".

## Rodar

Requer Node.js 20+.

```bash
npm install
npm run dev      # abre http://localhost:5173
npm test         # testes da simulação
npm run build    # gera a versão estática em dist/
```

## Controles (M1)

| Ação | Comando |
| --- | --- |
| Construir Extrator | Tecla `1` (ou clique na barra) e clique no mapa |
| Cancelar | `Esc` ou `Q` |
| Demolir | Passe o mouse sobre o agente e aperte `X` |
| Mover câmera | Botão direito arrastando, ou `WASD` / setas |
| Zoom | Roda do mouse |
| Pausar / velocidade | `Espaço`, ou os botões ❚❚ 1× 2× 4× |

O jogo salva sozinho no navegador a cada 10 s. Use **Exportar/Importar** para backup em arquivo.

## Estrutura

```
src/
  sim/     lógica pura (sem Phaser) — mapa, mundo, relógio, save + testes
  game/    Phaser: cenas que desenham e recebem input
  main.ts  inicialização
```

A simulação é a fonte da verdade; as cenas só leem e desenham. Para balancear, mexa em `src/sim/defs.ts`. Para editar o mapa, mexa em `src/sim/mapData.ts` (ASCII com legenda no topo).

Depuração no console do navegador: `agentFrontier.state.world`.

## Marcos

- [x] **M1** — mapa, câmera, construir Extrator, produção e save
- [ ] **M2** — conexões ponto a ponto e itens fluindo
- [ ] **M3** — receitas e energia
- [ ] **M4** — Oficina, cartões de diretiva e bancada de testes
- [ ] **M5** — confiabilidade, Verificador, experiência/drift e metas da Arca
