import { rgb2hex } from '@pixi/utils';
import rgba from 'color-rgba';

export function colorToPixi(color: string) {
  const rgbaColor = rgba(color);
  if (!rgbaColor) {
    throw new Error(`Invalid color ${color}`);
  }
  const pixiColor = rgb2hex([rgbaColor[0] / 255, rgbaColor[1] / 255, rgbaColor[2] / 255]);
  const alpha = rgbaColor[3];
  return [pixiColor, alpha] as [number, number];
}