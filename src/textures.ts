import * as PIXI from 'pixi.js';

export class TextureCache {
  app: PIXI.Application;

  private textures = new Map<string, PIXI.Texture>();

  constructor(app: PIXI.Application) {
    this.app = app;
  }

  get(key: string, defaultCallback: () => PIXI.Container): PIXI.Texture {
    let texture = this.textures.get(key);
    if (!texture) {
      const container = defaultCallback();
      const region = container.getLocalBounds(undefined, true);
      const roundedRegion = new PIXI.Rectangle(Math.floor(region.x), Math.floor(region.y), Math.ceil(region.width), Math.ceil(region.height));
      texture = this.app.renderer.generateTexture(container, PIXI.SCALE_MODES.LINEAR, this.app.renderer.resolution, roundedRegion);
      this.textures.set(key, texture);
    }
    return texture;
  }

  delete(key: string) {
    const texture = this.textures.get(key);
    if (!texture) {
      return;
    }

    texture.destroy();
    this.textures.delete(key);
  }

  clear() {
    Array.from(this.textures.keys()).forEach(key => {
      this.delete(key);
    });
  }

  destroy() {
    this.clear();
  }
}