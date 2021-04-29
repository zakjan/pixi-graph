import { AbstractRenderer } from '@pixi/core';
import { Container } from '@pixi/display';
import { Texture } from '@pixi/core';
import { Rectangle } from '@pixi/math';
import { SCALE_MODES } from '@pixi/constants';

export class TextureCache {
  renderer: AbstractRenderer;

  private textures = new Map<string, Texture>();

  constructor(renderer: AbstractRenderer) {
    this.renderer = renderer;
  }

  get(key: string, defaultCallback: () => Container): Texture {
    let texture = this.textures.get(key);
    if (!texture) {
      const container = defaultCallback();
      const region = container.getLocalBounds(undefined, true);
      const roundedRegion = new Rectangle(Math.floor(region.x), Math.floor(region.y), Math.ceil(region.width), Math.ceil(region.height));
      texture = this.renderer.generateTexture(container, SCALE_MODES.LINEAR, this.renderer.resolution, roundedRegion);
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