import Phaser from 'phaser';
import { WorldScene } from './game/WorldScene';
import { UIScene } from './game/UIScene';
import { GameState } from './game/state';
import { exportDiary, exportSave, loadSave, writeSave } from './game/persistence';
import { GameMap } from './sim/map';
import { MAP_ROWS } from './sim/mapData';
import { World } from './sim/world';
import { Inspector } from './ui/inspector';
import { confirmDialog } from './ui/modal';
import { Tutorial } from './ui/tutorial';
import { Victory } from './ui/victory';
import { Workshop } from './ui/workshop';

const map = GameMap.fromAscii(MAP_ROWS);
const world = loadSave(map) ?? new World(map);
const state = new GameState(world);
const workshop = new Workshop(state);
state.overlayRect = () => workshop.rect();
new Victory(state);
new Tutorial(state);
new Inspector(state);

state.events.on('diary-export', () => exportDiary(state.world));
state.events.on('new-game', async () => {
  const choice = await confirmDialog('Começar um jogo novo?', 'O progresso atual será apagado deste navegador. Você pode exportar o save antes para guardá-lo.', [
    { id: 'cancel', label: 'Cancelar' },
    { id: 'plain', label: 'Recomeçar' },
    { id: 'export', label: 'Exportar save e recomeçar', primary: true },
  ]);
  if (choice === 'cancel') return;
  if (choice === 'export') exportSave(state.world);
  const fresh = new World(map);
  state.replaceWorld(fresh);
  writeSave(fresh);
  state.toast('Jogo novo: siga os objetivos da MERIDIAN');
});

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  backgroundColor: '#0b0d12',
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  render: { antialias: true },
  scene: [new WorldScene(state), new UIScene(state)],
});

// Exposto para depuração no console do navegador: agentFrontier.state.world
(window as unknown as { agentFrontier: unknown }).agentFrontier = { state, game };
