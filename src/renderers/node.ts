import { colorToPixi } from '../color';
import { NodeStyle } from '../style';
import { textToPixi } from '../text';
import { TextureCache } from '../textures';

const DELIMETER = '::';
const WHITE = 0xffffff;

const NODE_CIRCLE = 'NODE_CIRCLE';
const NODE_CIRCLE_BORDER = 'NODE_CIRCLE_BORDER';
const NODE_ICON = 'NODE_ICON';

export function createNode(nodeGfx: PIXI.Container) {
  // nodeGfx
  nodeGfx.hitArea = new PIXI.Circle(0, 0);

  // nodeGfx -> nodeCircle
  const nodeCircle = new PIXI.Sprite();
  nodeCircle.name = NODE_CIRCLE;
  nodeCircle.anchor.set(0.5);
  nodeGfx.addChild(nodeCircle);

  // nodeGfx -> nodeCircleBorder
  const nodeCircleBorder = new PIXI.Sprite();
  nodeCircleBorder.name = NODE_CIRCLE_BORDER;
  nodeCircleBorder.anchor.set(0.5);
  nodeGfx.addChild(nodeCircleBorder);

  // nodeGfx -> nodeIcon
  const nodeIcon = new PIXI.Sprite();
  nodeIcon.name = NODE_ICON;
  nodeIcon.anchor.set(0.5);
  nodeGfx.addChild(nodeIcon);
}

export function updateNodeStyle(nodeGfx: PIXI.Container, nodeStyle: NodeStyle, textureCache: TextureCache) {
  const nodeOuterSize = nodeStyle.size + nodeStyle.border.width;

  const nodeCircleTextureKey = [NODE_CIRCLE, nodeStyle.size].join(DELIMETER);
  const nodeCircleTexture = textureCache.get(nodeCircleTextureKey, () => {
    const graphics = new PIXI.Graphics();
    graphics.beginFill(WHITE);
    graphics.drawCircle(nodeStyle.size, nodeStyle.size, nodeStyle.size);
    return graphics;
  });

  const nodeCircleBorderTextureKey = [NODE_CIRCLE_BORDER, nodeStyle.size, nodeStyle.border.width].join(DELIMETER);
  const nodeCircleBorderTexture = textureCache.get(nodeCircleBorderTextureKey, () => {
    const graphics = new PIXI.Graphics();
    graphics.lineStyle(nodeStyle.border.width, WHITE);
    graphics.drawCircle(nodeOuterSize, nodeOuterSize, nodeStyle.size);
    return graphics;
  });

  const nodeIconTextureKey = [NODE_ICON, nodeStyle.icon.fontFamily, nodeStyle.icon.fontSize, nodeStyle.icon.content].join(DELIMETER);
  const nodeIconTexture = textureCache.get(nodeIconTextureKey, () => {
    const text = textToPixi(nodeStyle.icon.type, nodeStyle.icon.content, {
      fontFamily: nodeStyle.icon.fontFamily,
      fontSize: nodeStyle.icon.fontSize
    });
    return text;
  });

  // nodeGfx
  (nodeGfx.hitArea as PIXI.Circle).radius = nodeOuterSize;

  // nodeGfx -> nodeCircle
  const nodeCircle = nodeGfx.getChildByName(NODE_CIRCLE) as PIXI.Sprite;
  nodeCircle.texture = nodeCircleTexture;
  [nodeCircle.tint, nodeCircle.alpha] = colorToPixi(nodeStyle.color);

  // nodeGfx -> nodeCircleBorder
  const nodeCircleBorder = nodeGfx.getChildByName(NODE_CIRCLE_BORDER) as PIXI.Sprite;
  nodeCircleBorder.texture = nodeCircleBorderTexture;
  [nodeCircleBorder.tint, nodeCircleBorder.alpha] = colorToPixi(nodeStyle.border.color);

  // nodeGfx -> nodeIcon
  const nodeIcon = nodeGfx.getChildByName(NODE_ICON) as PIXI.Sprite;
  nodeIcon.texture = nodeIconTexture;
  [nodeIcon.tint, nodeIcon.alpha] = colorToPixi(nodeStyle.icon.color);
  nodeGfx.addChild(nodeIcon);
}

export function updateNodeVisibility(nodeGfx: PIXI.Container, zoomStep: number) {
  // nodeGfx -> nodeCircleBorder
  const nodeCircleBorder = nodeGfx.getChildByName(NODE_CIRCLE_BORDER) as PIXI.Sprite;
  nodeCircleBorder.visible = nodeCircleBorder.visible && zoomStep >= 1;

  // nodeGfx -> nodeIcon
  const nodeIcon = nodeGfx.getChildByName(NODE_ICON) as PIXI.Sprite;
  nodeIcon.visible = nodeIcon.visible && zoomStep >= 2;
}