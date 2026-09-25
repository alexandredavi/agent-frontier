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

## Controles

| Ação | Comando |
| --- | --- |
| Escolher agente | `1` Extrator · `2` Silo · `3` Divisor · `4` Unificador (ou clique na barra) |
| Construir | Clique no mapa com um agente escolhido |
| Conectar | Arraste de um agente até outro (alcance 12 células, 60 itens/min) |
| Demolir agente ou conexão | Passe o mouse por cima e aperte `X` |
| Cancelar | `Esc` ou `Q` |
| Mover câmera | Botão direito arrastando, ou `WASD` / setas |
| Zoom | Roda do mouse |
| Pausar / velocidade | `Espaço`, ou os botões ❚❚ 1× 2× 4× |

## Regras do M2

- O estoque conta só o que está guardado em **Silos**.
- **Contrapressão:** nada se perde. Se o destino trava, a linha enche, o buffer da origem enche e a origem para. Anel âmbar = bloqueado; vermelho = bloqueado há mais de 5 s.
- **Divisor:** 1 entrada, até 3 saídas, em rodízio (pula saídas travadas). **Unificador:** até 3 entradas alternadas, 1 saída.

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
- [x] **M2** — conexões ponto a ponto, itens fluindo, Silo, Divisor, Unificador
- [ ] **M3** — receitas e energia
- [ ] **M4** — Oficina, cartões de diretiva e bancada de testes
- [ ] **M5** — confiabilidade, Verificador, experiência/drift e metas da Arca
