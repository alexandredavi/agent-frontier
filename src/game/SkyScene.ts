import Phaser from 'phaser';
import { PALETTES, renderSky, terraStage } from './iso/terrain';
import type { GameState } from './state';

/** Céu de fundo, atrás do mapa: muda de cor com a terraformação (câmera própria, sem zoom). */
export class SkyScene extends Phaser.Scene {
  private img?: Phaser.GameObjects.Image;
  private seq = 0;

  constructor(private readonly state: GameState) {
    super({ key: 'sky', active: true });
  }

  create(): void {
    this.show(terraStage(this.state.world.arca), false);
    this.state.events.on('terra-stage', this.onStage, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.state.events.off('terra-stage', this.onStage, this));
    this.scale.on('resize', this.fit, this);
  }

  private onStage(stage: number, fade: boolean): void {
    this.show(stage, fade);
  }

  private show(stage: number, fade: boolean): void {
    const key = `sky-${++this.seq}`;
    this.textures.addCanvas(key, renderSky(PALETTES[stage]));
    const img = this.add.image(0, 0, key).setOrigin(0).setDepth(this.seq);
    const old = this.img;
    this.img = img;
    this.fit();
    const drop = () => {
      if (!old) return;
      const k = old.texture.key;
      old.destroy();
      if (this.textures.exists(k)) this.textures.remove(k);
    };
    if (fade && old) {
      img.setAlpha(0);
      this.tweens.add({ targets: img, alpha: 1, duration: 2500, ease: 'Sine.easeInOut', onComplete: drop });
    } else drop();
  }

  private fit(): void {
    const { width, height } = this.scale;
    for (const o of this.children.list) {
      if (o instanceof Phaser.GameObjects.Image) {
        // cobre a tela mantendo a proporção (as estrelas não esticam)
        const s = Math.max(width / o.width, height / o.height);
        o.setScale(s).setPosition((width - o.width * s) / 2, (height - o.height * s) / 2);
      }
    }
  }
}
