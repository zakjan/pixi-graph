import * as PIXI from 'pixi.js';

const WHITE = 0xffffff;

export enum TextType {
  TEXT = 'TEXT',
  BITMAP_TEXT = 'BITMAP_TEXT',
  // TODO: SDF_TEXT
  // see https://github.com/PixelsCommander/pixi-sdf-text/issues/12
}

// TODO: use PIXI.TextStyle directly?
export interface TextStyle {
  fontFamily: string;
  fontSize: number;
}

export function textToPixi(type: TextType, content: string, style: TextStyle) {
  let text;
  if (type === TextType.TEXT) {
    // TODO: convert to bitmap font with PIXI.BitmapFont.from?
    text = new PIXI.Text(content, {
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fill: WHITE
    });
  } else if (type === TextType.BITMAP_TEXT) {
    text = new PIXI.BitmapText(content, {
      fontName: style.fontFamily,
      fontSize: style.fontSize
    });
  } else {
    throw new Error('Invalid state');
  }
  text.roundPixels = true;
  return text;
}