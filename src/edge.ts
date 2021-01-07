import * as PIXI from 'pixi.js';
import { TypedEmitter } from 'tiny-typed-emitter';
import { createEdge, updateEdgeStyle, updateEdgeVisibility } from './renderers/edge';
import { EdgeStyle } from './utils/style';
import { TextureCache } from './texture-cache';

interface PixiEdgeEvents {
  click: (event: MouseEvent) => void;
  mousemove: (event: MouseEvent) => void;
  mouseover: (event: MouseEvent) => void;
  mouseout: (event: MouseEvent) => void;
  mousedown: (event: MouseEvent) => void;
  mouseup: (event: MouseEvent) => void;
}

export class PixiEdge extends TypedEmitter<PixiEdgeEvents> {
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
    edgeGfx.on('mouseover', (event: PIXI.InteractionEvent) => this.emit('mouseover', event.data.originalEvent as MouseEvent));
    edgeGfx.on('mouseout', (event: PIXI.InteractionEvent) => this.emit('mouseout', event.data.originalEvent as MouseEvent));
    edgeGfx.on('mousedown', (event: PIXI.InteractionEvent) => this.emit('mousedown', event.data.originalEvent as MouseEvent));
    edgeGfx.on('mouseup', (event: PIXI.InteractionEvent) => this.emit('mouseup', event.data.originalEvent as MouseEvent));
    edgeGfx.on('mousemove', (event: PIXI.InteractionEvent) => this.emit('mousemove', event.data.originalEvent as MouseEvent));
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