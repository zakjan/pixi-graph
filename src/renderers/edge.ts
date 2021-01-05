import * as PIXI from 'pixi.js';
import { colorToPixi } from '../utils/color';
import { EdgeStyle } from '../utils/style';
import { TextureCache } from '../texture-cache';

const EDGE_LINE = 'EDGE_LINE';

export function createEdge(edgeGfx: PIXI.Container) {
  // edgeGfx -> edgeLine
  const edgeLine = new PIXI.Sprite(PIXI.Texture.WHITE);
  edgeLine.name = EDGE_LINE;
  edgeLine.anchor.set(0.5);
  edgeGfx.addChild(edgeLine);
}

export function updateEdgeStyle(edgeGfx: PIXI.Container, edgeStyle: EdgeStyle, _textureCache: TextureCache) {
  // edgeGfx -> edgeLine
  const edgeLine = edgeGfx.getChildByName(EDGE_LINE) as PIXI.Sprite;
  edgeLine.width = edgeStyle.width;
  [edgeLine.tint, edgeLine.alpha] = colorToPixi(edgeStyle.color);
}

export function updateEdgeVisibility(edgeGfx: PIXI.Container, zoomStep: number) {
  // edgeGfx -> edgeLine
  const edgeLine = edgeGfx.getChildByName(EDGE_LINE) as PIXI.Sprite;
  edgeLine.visible = edgeLine.visible && zoomStep >= 1;
}