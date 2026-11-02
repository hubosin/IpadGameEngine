// Decodes data-URL images once and notifies listeners when they finish loading
// (renderers subscribe so they can redraw once art becomes available).

const cache = new Map<string, HTMLImageElement>();
const listeners = new Set<() => void>();

export function getImage(src: string): HTMLImageElement {
  let img = cache.get(src);
  if (!img) {
    img = new Image();
    img.onload = () => listeners.forEach((l) => l());
    img.src = src;
    cache.set(src, img);
    if (cache.size > 4000) {
      const first = cache.keys().next().value as string;
      cache.delete(first);
    }
  }
  return img;
}

export function isReady(img: HTMLImageElement) {
  return img.complete && img.naturalWidth > 0;
}

export function onImageLoad(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  const img = getImage(src);
  if (isReady(img)) return Promise.resolve(img);
  return new Promise((resolve, reject) => {
    img.addEventListener('load', () => resolve(img), { once: true });
    img.addEventListener('error', reject, { once: true });
  });
}
