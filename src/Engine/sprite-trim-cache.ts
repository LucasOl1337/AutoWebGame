export interface SpriteTrimBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class SpriteTrimCache {
  private readonly cache = new WeakMap<HTMLImageElement, SpriteTrimBounds | null>();
  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;

  public getBounds(sprite: HTMLImageElement): SpriteTrimBounds | null {
    if (this.cache.has(sprite)) {
      return this.cache.get(sprite) ?? null;
    }

    const width = sprite.naturalWidth || sprite.width || 0;
    const height = sprite.naturalHeight || sprite.height || 0;
    if (width <= 0 || height <= 0) {
      this.cache.set(sprite, null);
      return null;
    }

    const context = this.ensureContext();
    if (!this.canvas || !context) {
      this.cache.set(sprite, null);
      return null;
    }

    this.canvas.width = width;
    this.canvas.height = height;
    context.clearRect(0, 0, width, height);

    try {
      context.drawImage(sprite, 0, 0, width, height);
      const data = context.getImageData(0, 0, width, height).data;
      let minX = width;
      let minY = height;
      let maxX = -1;
      let maxY = -1;

      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const alphaIndex = (y * width + x) * 4 + 3;
          if (data[alphaIndex] === 0) {
            continue;
          }
          if (x < minX) {
            minX = x;
          }
          if (x > maxX) {
            maxX = x;
          }
          if (y < minY) {
            minY = y;
          }
          if (y > maxY) {
            maxY = y;
          }
        }
      }

      if (maxX < minX || maxY < minY) {
        this.cache.set(sprite, null);
        return null;
      }

      const bounds = {
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
      };
      this.cache.set(sprite, bounds);
      return bounds;
    } catch {
      const fallback = { x: 0, y: 0, width, height };
      this.cache.set(sprite, fallback);
      return fallback;
    }
  }

  private ensureContext(): CanvasRenderingContext2D | null {
    if (this.context) {
      return this.context;
    }

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true }) ?? canvas.getContext("2d");
    if (!context) {
      return null;
    }

    this.canvas = canvas;
    this.context = context;
    return context;
  }
}
