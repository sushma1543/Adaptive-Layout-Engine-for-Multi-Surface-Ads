/** Same font, weights, and line spacing for solver, DOM and SVG backends. */
export const AD_FONT = 'Arial, Helvetica, sans-serif';
export const AD_LINE_HEIGHT = 1.22;
export type TextMeasurer = (text: string, fontSize: number, weight: number) => number;

export const estimateText: TextMeasurer = (text, fontSize) =>
  Array.from(text).reduce((sum, character) => {
    if ((character.codePointAt(0) ?? 0) > 127) return sum + 1.05;
    if (/[MW@%]/.test(character)) return sum + 0.98;
    if (/[A-Z]/.test(character)) return sum + 0.75;
    if (/[il.,'! :;]/.test(character)) return sum + 0.3;
    return sum + 0.62;
  }, 0) * fontSize;

/** Optional browser adapter; the core does not depend on DOM or Canvas. */
export function createCanvasMeasurer(): TextMeasurer | undefined {
  if (typeof document === 'undefined') return undefined;
  const context = document.createElement('canvas').getContext('2d');
  if (!context) return undefined;
  const cache = new Map<string, number>();
  return (text, fontSize, weight) => {
    const key = fontSize + '/' + weight + '/' + text;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    context.font = weight + ' ' + fontSize + 'px ' + AD_FONT;
    const width = context.measureText(text).width + 1;
    if (cache.size > 8000) cache.clear();
    cache.set(key, width);
    return width;
  };
}
