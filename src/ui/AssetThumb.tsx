import { useEffect, useRef } from 'react';
import type { Asset } from '../core/types';
import { getFrameCanvas } from '../render/compose';
import { onImageLoad } from '../render/imageCache';

export function AssetThumb({ asset, frameId, w = 72, h = 56 }: { asset: Asset; frameId?: string; w?: number; h?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const draw = () => {
      const c = ref.current;
      if (!c) return;
      const g = c.getContext('2d')!;
      c.width = w * 2; c.height = h * 2;
      g.clearRect(0, 0, c.width, c.height);
      const doc = asset.art;
      if (!doc) {
        g.fillStyle = '#ccc';
        g.font = '40px sans-serif';
        g.textAlign = 'center';
        g.fillText(asset.kind === 'audio' ? '♪' : '?', c.width / 2, c.height / 2 + 14);
        return;
      }
      const fid = frameId ?? doc.frames[0]?.id;
      if (!fid) return;
      const img = getFrameCanvas(doc, fid);
      const k = Math.min(c.width / doc.width, c.height / doc.height);
      g.imageSmoothingEnabled = k < 1;
      g.drawImage(img, (c.width - doc.width * k) / 2, (c.height - doc.height * k) / 2, doc.width * k, doc.height * k);
    };
    draw();
    return onImageLoad(draw);
  }, [asset, frameId, w, h]);
  return <canvas ref={ref} style={{ width: w, height: h }} />;
}
