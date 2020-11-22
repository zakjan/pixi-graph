import { colorToPixi } from '../color';
import { EdgeStyle } from '../style';
import { TextureCache } from '../textures';

const EDGE_LINE = 'EDGE_LINE';

export function createEdge(edgeGfx: PIXI.Container) {
  // edgeGfx -> edgeLine
  const edgeLine = new PIXI.Sprite(PIXI.Texture.WHITE);
  edgeLine.name = EDGE_LINE;
  edgeLine.anchor.set(0.5, 0);
  edgeGfx.addChild(edgeLine);
}

export function updateEdgeStyle(edgeGfx: PIXI.Container, edgeStyle: EdgeStyle, sourceNodeGfx: PIXI.Container, targetNodeGfx: PIXI.Container, _textureCache: TextureCache) {
  const rotation = -Math.atan2(targetNodeGfx.x - sourceNodeGfx.x, targetNodeGfx.y - sourceNodeGfx.y);
  const length = Math.hypot(targetNodeGfx.x - sourceNodeGfx.x, targetNodeGfx.y - sourceNodeGfx.y);

  // edgeGfx -> edgeLine
  const edgeLine = edgeGfx.getChildByName(EDGE_LINE) as PIXI.Sprite;
  edgeLine.width = edgeStyle.width;
  edgeLine.rotation = rotation;
  edgeLine.height = length;
  [edgeLine.tint, edgeLine.alpha] = colorToPixi(edgeStyle.color);
}

export function updateEdgeVisibility(edgeGfx: PIXI.Container, zoomStep: number) {
  // edgeGfx -> edgeLine
  const edgeLine = edgeGfx.getChildByName(EDGE_LINE) as PIXI.Sprite;
  edgeLine.visible = edgeLine.visible && zoomStep >= 1;
}