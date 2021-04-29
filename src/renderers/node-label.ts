import { Container } from '@pixi/display';
import { Sprite } from '@pixi/sprite';
import { Texture } from '@pixi/core';
import { BitmapText } from '@pixi/text-bitmap';
import '@pixi/mixin-get-child-by-name';
import { colorToPixi } from '../utils/color';
import { NodeStyle } from '../utils/style';
import { textToPixi } from '../utils/text';
import { TextureCache } from '../texture-cache';

const DELIMETER = '::';

const NODE_LABEL_BACKGROUND = 'NODE_LABEL_BACKGROUND';
const NODE_LABEL_TEXT = 'NODE_LABEL_TEXT';

export function createNodeLabel(nodeLabelGfx: Container) {
  // nodeLabelGfx -> nodeLabelBackground
  const nodeLabelBackground = new Sprite(Texture.WHITE);
  nodeLabelBackground.name = NODE_LABEL_BACKGROUND;
  nodeLabelBackground.anchor.set(0.5);
  nodeLabelGfx.addChild(nodeLabelBackground);

  // nodeLabelGfx -> nodeLabelText
  const nodeLabelText = new Sprite();
  nodeLabelText.name = NODE_LABEL_TEXT;
  nodeLabelText.anchor.set(0.5);
  nodeLabelGfx.addChild(nodeLabelText);
}

export function updateNodeLabelStyle(nodeLabelGfx: Container, nodeStyle: NodeStyle, textureCache: TextureCache) {
  const nodeOuterSize = nodeStyle.size + nodeStyle.border.width;

  const nodeLabelTextTextureKey = [NODE_LABEL_TEXT, nodeStyle.label.fontFamily, nodeStyle.label.fontSize, nodeStyle.label.content].join(DELIMETER);
  const nodeLabelTextTexture = textureCache.get(nodeLabelTextTextureKey, () => {
    const text = textToPixi(nodeStyle.label.type, nodeStyle.label.content, {
      fontFamily: nodeStyle.label.fontFamily,
      fontSize: nodeStyle.label.fontSize
    });
    return text;
  });

  // nodeLabelGfx -> nodeLabelBackground
  const nodeLabelBackground = nodeLabelGfx.getChildByName!(NODE_LABEL_BACKGROUND) as Sprite;
  nodeLabelBackground.y = nodeOuterSize + (nodeLabelTextTexture.height + nodeStyle.label.padding * 2) / 2;
  nodeLabelBackground.width = nodeLabelTextTexture.width + nodeStyle.label.padding * 2;
  nodeLabelBackground.height = nodeLabelTextTexture.height + nodeStyle.label.padding * 2;
  [nodeLabelBackground.tint, nodeLabelBackground.alpha] = colorToPixi(nodeStyle.label.backgroundColor);

  // nodeLabelGfx -> nodeLabelText
  const nodeLabelText = nodeLabelGfx.getChildByName!(NODE_LABEL_TEXT) as Sprite;
  nodeLabelText.texture = nodeLabelTextTexture;
  nodeLabelText.y = nodeOuterSize + (nodeLabelTextTexture.height + nodeStyle.label.padding * 2) / 2;
  [nodeLabelText.tint, nodeLabelText.alpha] = colorToPixi(nodeStyle.label.color);
}

export function updateNodeLabelVisibility(nodeLabelGfx: Container, zoomStep: number) {
  // nodeLabelGfx -> nodeLabelBackground
  const nodeLabelBackground = nodeLabelGfx.getChildByName!(NODE_LABEL_BACKGROUND) as Sprite;
  nodeLabelBackground.visible = nodeLabelBackground.visible && zoomStep >= 3;
  
  // nodeLabelGfx -> nodeLabelText
  const nodeLabelText = nodeLabelGfx.getChildByName!(NODE_LABEL_TEXT) as BitmapText;
  nodeLabelText.visible = nodeLabelText.visible && zoomStep >= 3;
}