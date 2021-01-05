import * as PIXI from 'pixi.js';
import { EventEmitter } from 'events';
import { createNode, updateNodeStyle, updateNodeVisibility } from './renderers/node';
import { createNodeLabel, updateNodeLabelStyle, updateNodeLabelVisibility } from './renderers/node-label';
import { NodeStyle } from './utils/style';
import { TextureCache } from './texture-cache';

export class PixiNode extends EventEmitter {
  nodeGfx: PIXI.Container;
  nodeLabelGfx: PIXI.Container;
  nodePlaceholderGfx: PIXI.Container;
  nodeLabelPlaceholderGfx: PIXI.Container;

  hovered: boolean = false;

  constructor() {
    super();

    this.nodeGfx = this.createNode();
    this.nodeLabelGfx = this.createNodeLabel();
    this.nodePlaceholderGfx = new PIXI.Container();
    this.nodeLabelPlaceholderGfx = new PIXI.Container();
  }

  private createNode() {
    const nodeGfx = new PIXI.Container();
    nodeGfx.interactive = true;
    nodeGfx.buttonMode = true;
    nodeGfx.on('mouseover', (event: PIXI.InteractionEvent) => this.emit('mouseover', event.data.originalEvent));
    nodeGfx.on('mouseout', (event: PIXI.InteractionEvent) => this.emit('mouseout', event.data.originalEvent));
    nodeGfx.on('mousedown', (event: PIXI.InteractionEvent) => this.emit('mousedown', event.data.originalEvent));
    nodeGfx.on('mouseup', (event: PIXI.InteractionEvent) => this.emit('mouseup', event.data.originalEvent));
    createNode(nodeGfx);
    return nodeGfx;
  }

  private createNodeLabel() {
    const nodeLabelGfx = new PIXI.Container();
    nodeLabelGfx.interactive = true;
    nodeLabelGfx.buttonMode = true;
    nodeLabelGfx.on('mouseover', (event: PIXI.InteractionEvent) => this.emit('mouseover', event.data.originalEvent));
    nodeLabelGfx.on('mouseout', (event: PIXI.InteractionEvent) => this.emit('mouseout', event.data.originalEvent));
    nodeLabelGfx.on('mousedown', (event: PIXI.InteractionEvent) => this.emit('mousedown', event.data.originalEvent));
    nodeLabelGfx.on('mouseup', (event: PIXI.InteractionEvent) => this.emit('mouseup', event.data.originalEvent));
    createNodeLabel(nodeLabelGfx);
    return nodeLabelGfx;
  }

  updatePosition(position: PIXI.IPointData) {
    this.nodeGfx.position.copyFrom(position);
    this.nodeLabelGfx.position.copyFrom(position);
  }

  updateStyle(nodeStyle: NodeStyle, textureCache: TextureCache) {
    updateNodeStyle(this.nodeGfx, nodeStyle, textureCache);
    updateNodeLabelStyle(this.nodeLabelGfx, nodeStyle, textureCache);
  }

  updateVisibility(zoomStep: number) {
    updateNodeVisibility(this.nodeGfx, zoomStep);
    updateNodeLabelVisibility(this.nodeLabelGfx, zoomStep);
  }
}