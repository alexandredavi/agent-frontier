import Phaser from 'phaser';
import { SkyScene } from './game/SkyScene';
import { WorldScene } from './game/WorldScene';
import { UIScene } from './game/UIScene';
import { GameState } from './game/state';
import { clearLegacySave, exportDiary, importSave, lastSlot, loadSlot, setCurrentSlot, setLastSlot, writeSave, writeSlot } from './game/persistence';
import { makeThumb } from './game/thumb';
import { GameMap } from './sim/map';
import { MAP_ROWS } from './sim/mapData';
import { World } from './sim/world';
import { Inspector } from './ui/inspector';
import { TitleScreen } from './ui/title';
import { Tutorial } from './ui/tutorial';
import { Victory } from './ui/victory';
import { Workshop } from './ui/workshop';
import './ui/hud.css';
import { watchOtherTabs } from './game/multitab';
import { currentSlot, onSaveError } from './game/persistence';

const map = GameMap.fromAscii(MAP_ROWS);
clearLegacySave();

// Fundo da tela de abertura: o último jogo (sem salvar nada) ou o planeta vazio
const last = lastSlot();
const background = (last !== null ? loadSlot(last, map) : null) ?? new World(map);
const state = new GameState(background);
const workshop = new Workshop(state);
state.overlayRect = () => workshop.rect();
new Victory(state);
new Tutorial(state);
new Inspector(state);

const thumb = () => makeThumb(state.world);

/** Entra no jogo: o espaço escolhido passa a receber o salvamento automático. */
function enter(world: World, slot: number, name?: string): void {
  state.replaceWorld(world);
  setCurrentSlot(slot, thumb);
  if (!writeSlot(slot, world, { name, thumb: makeThumb(world) })) state.toast('Sem espaço no navegador para salvar — exporte o save');
  setLastSlot(slot);
  state.setMode('play');
  if (name) state.toast(world.agents.size ? `Save importado em “${name}”` : `Novo jogo: “${name}” — siga os objetivos da MERIDIAN`);
}

const title = new TitleScreen(state, map, { enter, importFile: () => importSave(map) });

// Saves que se perderiam sem aviso: a mesma colônia aberta em outra aba, ou o navegador sem espaço
watchOtherTabs(window, currentSlot, () =>
  state.toast('Esta colônia também está aberta em outra aba. Feche uma delas: a última a salvar apaga o progresso da outra.'),
);
let lastSaveError = -Infinity;
onSaveError(() => {
  if (Date.now() - lastSaveError < 60_000) return;
  lastSaveError = Date.now();
  state.toast('Não foi possível salvar: armazenamento do navegador cheio. Use Exportar e apague saves antigos em Carregar.');
});

state.events.on('diary-export', () => exportDiary(state.world));

// Menu (no topo do jogo): salva e volta para a tela de abertura, com o mundo atual ao fundo
state.events.on('menu', () => {
  writeSave(state.world);
  workshop.close();
  state.events.emit('pin', null);
  state.setTool({ kind: 'none' });
  setCurrentSlot(null);
  state.setMode('title');
  title.open();
});

// Importar durante o jogo: salva o atual e coloca o arquivo num espaço livre (ou pede um para substituir)
state.events.on('import', () => {
  importSave(map)
    .then((w) => {
      writeSave(state.world);
      if (state.mode === 'play') {
        setCurrentSlot(null);
        state.setMode('title');
      }
      title.placeImported(w, 'Save importado');
    })
    .catch(() => state.toast('Arquivo de save inválido'));
});

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  backgroundColor: '#0b0d12',
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  render: { antialias: true },
  scene: [new SkyScene(state), new WorldScene(state), new UIScene(state)],
});
state.setMode('title');

// Exposto para depuração no console do navegador: agentFrontier.state.world
(window as unknown as { agentFrontier: unknown }).agentFrontier = { state, game };
