import Phaser from 'phaser';
import { WorldScene } from './game/WorldScene';
import { UIScene } from './game/UIScene';
import { GameState } from './game/state';
import { loadSave } from './game/persistence';
import { GameMap } from './sim/map';
import { MAP_ROWS } from './sim/mapData';
import { World } from './sim/world';
import { Victory } from './ui/victory';
import { Workshop } from './ui/workshop';

const map = GameMap.fromAscii(MAP_ROWS);
const world = loadSave(map) ?? new World(map);
const state = new GameState(world);
const workshop = new Workshop(state);
state.overlayRect = () => workshop.rect();
new Victory(state);

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
