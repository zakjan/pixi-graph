import { Container } from '@pixi/display';
import { Sprite } from '@pixi/sprite';
import { Texture } from '@pixi/core';
import '@pixi/mixin-get-child-by-name';
import { colorToPixi } from '../utils/color';
import { EdgeStyle } from '../utils/style';
import { TextureCache } from '../texture-cache';

const EDGE_LINE = 'EDGE_LINE';

export function createEdge(edgeGfx: Container) {
  // edgeGfx -> edgeLine
  const edgeLine = new Sprite(Texture.WHITE);
  edgeLine.name = EDGE_LINE;
  edgeLine.anchor.set(0.5);
  edgeGfx.addChild(edgeLine);
}

export function updateEdgeStyle(edgeGfx: Container, edgeStyle: EdgeStyle, _textureCache: TextureCache) {
  // edgeGfx -> edgeLine
  const edgeLine = edgeGfx.getChildByName!(EDGE_LINE) as Sprite;
  edgeLine.width = edgeStyle.width;
  [edgeLine.tint, edgeLine.alpha] = colorToPixi(edgeStyle.color);
}

export function updateEdgeVisibility(edgeGfx: Container, zoomStep: number) {
  // edgeGfx -> edgeLine
  const edgeLine = edgeGfx.getChildByName!(EDGE_LINE) as Sprite;
  edgeLine.visible = edgeLine.visible && zoomStep >= 1;
}