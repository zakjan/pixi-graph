import * as PIXI from 'pixi.js';
import { EventEmitter } from 'events';
import { createEdge, updateEdgeStyle, updateEdgeVisibility } from './renderers/edge';
import { EdgeStyle } from './utils/style';
import { TextureCache } from './texture-cache';

export class PixiEdge extends EventEmitter {
  edgeGfx: PIXI.Container;
  edgePlaceholderGfx: PIXI.Container;

  hovered: boolean = false;

  constructor() {
    super();

    this.edgeGfx = this.createEdge();
    this.edgePlaceholderGfx = new PIXI.Container();
  }

  createEdge() {
    const edgeGfx = new PIXI.Container();
    edgeGfx.interactive = true;
    edgeGfx.buttonMode = true;
    edgeGfx.on('mouseover', (event: PIXI.InteractionEvent) => this.emit('mouseover', event.data.originalEvent));
    edgeGfx.on('mouseout', (event: PIXI.InteractionEvent) => this.emit('mouseout', event.data.originalEvent));
    edgeGfx.on('mousedown', (event: PIXI.InteractionEvent) => this.emit('mousedown', event.data.originalEvent));
    edgeGfx.on('mouseup', (event: PIXI.InteractionEvent) => this.emit('mouseup', event.data.originalEvent));
    createEdge(edgeGfx);
    return edgeGfx;
  }

  updatePosition(sourceNodePosition: PIXI.IPointData, targetNodePosition: PIXI.IPointData) {
    const position = { x: (sourceNodePosition.x + targetNodePosition.x) / 2, y: (sourceNodePosition.y + targetNodePosition.y) / 2 };
    const rotation = -Math.atan2(targetNodePosition.x - sourceNodePosition.x, targetNodePosition.y - sourceNodePosition.y);
    const length = Math.hypot(targetNodePosition.x - sourceNodePosition.x, targetNodePosition.y - sourceNodePosition.y);
    this.edgeGfx.position.copyFrom(position);
    this.edgeGfx.rotation = rotation;
    this.edgeGfx.height = length;
  }

  updateStyle(edgeStyle: EdgeStyle, textureCache: TextureCache) {
    updateEdgeStyle(this.edgeGfx, edgeStyle, textureCache);
  }

  updateVisibility(zoomStep: number) {
    updateEdgeVisibility(this.edgeGfx, zoomStep);
  }
}