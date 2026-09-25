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

## Publicar no GitHub Pages (playtest)

O workflow `.github/workflows/pages.yml` testa, gera e publica o jogo a cada push na `main`.

1. No GitHub, crie um repositório vazio (ex.: `agent-frontier`), sem README.
2. Nesta pasta, rode (troque `SEU-USUARIO`):
   ```bash
   git remote add origin https://github.com/SEU-USUARIO/agent-frontier.git
   git push -u origin main
   ```
3. No repositório: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Aguarde a aba **Actions** terminar (~1 min). O link fica em `https://SEU-USUARIO.github.io/agent-frontier/`.

Cada `git push` depois disso atualiza o link. O save e o Diário ficam no navegador de cada jogador.

## Controles

| Ação | Comando |
| --- | --- |
| Oficina (montar versões de agentes) | `O` ou botão ⚙ Oficina |
| Trocar aba da barra | `Tab` (Shift+Tab volta) ou clique na aba |
| Escolher agente | `1`–`9` dentro da aba (ou clique no espaço) |
| Construir | Clique no mapa com um agente escolhido |
| Conectar | Arraste de um agente até outro (alcance 12 células, 60 itens/min) |
| Fixar o cartão de um agente | Clique no agente (sem arrastar); `Esc` fecha |
| Mover agente | `M` sobre o agente, clique para soltar (`Esc` cancela) |
| Demolir agente ou conexão | Passe o mouse por cima e aperte `X` |
| Cancelar | `Esc` ou `Q` |
| Mover câmera | Botão direito arrastando, ou `WASD` / setas |
| Zoom | Roda do mouse |
| Pausar / velocidade | `Espaço`, ou os botões ❚❚ 1× 2× 4× |

## Agentes

| Aba | Agentes |
| --- | --- |
| Extração | Extrator (Gelo/Regolito 4 kW, Minério 6 kW) · Sensor (Telemetria) |
| Processamento | Derretedor · Cartógrafo · Analista · Eletrolisador · Fundidor · Prensa · Construtor |
| Logística | Silo · Divisor · Unificador · Descarte |
| Energia | Painel Solar (+20 kW) |

Receitas e números: `src/sim/defs.ts`. Matéria anda nas linhas como círculos; dados, como losangos.

## Oficina (M4)

Agentes de IA (extração e processamento) são montados com **Núcleo + Ferramenta + Cartões de diretiva**. As máquinas originais são as versões **v1 de fábrica**; na Oficina você duplica, ajusta, roda a **bancada de testes** (100 amostras) e salva como nova versão, que vai para a barra. Ao salvar, escolha se os agentes da versão anterior são atualizados (Todos) ou não (Só os novos).

| Módulo | Opções |
| --- | --- |
| Núcleo | Básico (2 slots) · Avançado (×1,5 velocidade, +10 pp, ×2 kW, 4 slots) |
| Cartões | Acelerar (×1,5 vel., −10 pp) · Cuidadoso (×0,5 vel., +15 pp) · Econômico (−30% kW, ×0,8 vel.) · cada cartão −5% de velocidade |

**Alucinações:** cada item pode sair defeituoso. Parece normal, mas contamina quem o consome: a chance de cada item sair bom é *confiabilidade × (fração de ingredientes bons)²*. No HUD, "+N def." mostra os defeituosos guardados nos silos. A confiabilidade se acumula na cadeia (Módulo de habitat: ~63% bons com versões de fábrica, ~91% com Núcleo Avançado, ~96% com Avançado + Cuidadoso).

## Arca, tiers e qualidade (M5)

- **Metas da Arca** (painel ARCA no HUD): entregue cargas numa **Plataforma de Carga**. Fase 1: 20 Mapas de pouso → libera o **Tier 1** (Minério, Analista, Eletrolisador, Fundidor, Prensa, Construtor, Núcleo Avançado). Fase 2: 50 Módulos de habitat → protótipo concluído. Só itens bons contam; a Plataforma recusa cargas de outra fase.
- **Verificador** (ferramenta Scanner, na Oficina): inspeciona 30 itens/min. Detecta 90% dos defeituosos (até 99% com Núcleo Avançado + Cuidadoso) e rejeita 2% dos bons por engano (1% com Cuidadoso). 1ª saída = aprovados, 2ª = rejeitados.
- **Confiabilidade real** = versão − sujeira do bioma (Crateras −10, Cordilheira −5) − drift + experiência (+1 pp a cada 500 itens, até +10). A bancada testa com amostras limpas: **teste ≠ produção**. O cartão **Filtrar entrada suja** anula o bioma (×0,85 velocidade).
- **Drift:** ao liberar o Tier 1 o ambiente muda e as versões existentes perdem 5 pp. Recalibre cada versão na Oficina.

## Regras

- O estoque conta só o que está guardado em **Silos**.
- **Contrapressão:** nada se perde. Se o destino trava, a linha enche, o buffer da origem enche e a origem para. Anel âmbar = bloqueado; vermelho = bloqueado há mais de 5 s.
- **Receitas:** cada ingrediente tem buffer para 2 ciclos; a máquina aceita até 2 entradas. Item que ela não usa é recusado e trava a linha.
- **Energia:** rede global. A cápsula de pouso dá 10 kW; cada Painel Solar, 20 kW. Máquinas só consomem trabalhando. Faltou energia, extração e processamento rodam na proporção disponível.

O jogo salva sozinho no navegador a cada 10 s. Use **Exportar/Importar** para backup em arquivo, **Novo jogo** para recomeçar e **Diário** para exportar as métricas do playtest (marcos, contagens e uma amostra por minuto de jogo).

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
- [x] **M3** — receitas Tier 0/1, energia, Cordilheira Ferrosa, barra com abas
- [x] **M4** — Oficina, cartões de diretiva, bancada de testes, versões e confiabilidade
- [x] **M5** — Verificador, sujeira do bioma, experiência/drift, tiers e metas da Arca (MVP completo)
