import { Text } from '@pixi/text';
import { BitmapText } from '@pixi/text-bitmap';

const WHITE = 0xffffff;

export enum TextType {
  TEXT = 'TEXT',
  BITMAP_TEXT = 'BITMAP_TEXT',
  // TODO: SDF_TEXT
  // see https://github.com/PixelsCommander/pixi-sdf-text/issues/12
}

// TODO: use TextStyle from @pixi/text directly?
export interface TextStyle {
  fontFamily: string;
  fontSize: number;
}

export function textToPixi(type: TextType, content: string, style: TextStyle) {
  let text;
  if (type === TextType.TEXT) {
    // TODO: convert to bitmap font with BitmapFont.from?
    text = new Text(content, {
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fill: WHITE
    });
  } else if (type === TextType.BITMAP_TEXT) {
    text = new BitmapText(content, {
      fontName: style.fontFamily,
      fontSize: style.fontSize
    });
  } else {
    throw new Error('Invalid state');
  }
  text.roundPixels = true;
  return text;
}