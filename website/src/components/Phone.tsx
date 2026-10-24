import { ReactNode } from 'react';

import { useWidth } from '../island/graphics';

/** A phone at real point size (393 wide, like an iPhone 15 Pro), scaled down to fit its column. */
export const SCREEN_W = 393;
const W = SCREEN_W + 20;
const H = 872;
const CROP_MASK = 'linear-gradient(to bottom, #000 78%, transparent)';

/** `crop` shows only the top part of the phone (where the island lives), fading out below. */
export function Phone({ kind = 'iphone', children, max = 1, crop = 1, label }: { kind?: 'iphone' | 'pixel'; children?: ReactNode; max?: number; crop?: number; label?: string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const k = w ? Math.min(max, w / W) : 0;
  return (
    <div ref={ref} className="phone-wrap" style={{ height: H * k * crop || undefined, aspectRatio: k ? undefined : `${W} / ${H * crop}`, maxWidth: W * max, overflow: crop < 1 ? 'hidden' : undefined, WebkitMaskImage: crop < 1 ? CROP_MASK : undefined, maskImage: crop < 1 ? CROP_MASK : undefined }} role={label ? 'group' : undefined} aria-label={label}>
      {k ? (
        <div className={`phone phone-${kind}`} style={{ width: W, height: H, transform: `scale(${k})` }}>
          <div className="phone-screen">
            <StatusBar kind={kind} />
            {kind === 'pixel' ? <span className="punch" aria-hidden /> : null}
            {children}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StatusBar({ kind }: { kind: 'iphone' | 'pixel' }) {
  return (
    <div className={`status status-${kind}`} aria-hidden>
      <span className="status-time">9:41</span>
      <span className="status-icons">
        <svg width="18" height="12" viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1" fill="currentColor" /><rect x="5" y="5.5" width="3" height="6.5" rx="1" fill="currentColor" /><rect x="10" y="3" width="3" height="9" rx="1" fill="currentColor" /><rect x="15" y="0" width="3" height="12" rx="1" fill="currentColor" /></svg>
        <svg width="16" height="12" viewBox="0 0 16 12"><path d="M8 11.5 5.6 9a3.4 3.4 0 0 1 4.8 0L8 11.5Zm-4.2-4.3L2.2 5.6a8.2 8.2 0 0 1 11.6 0l-1.6 1.6a5.9 5.9 0 0 0-8.4 0ZM.6 4 0 3.4a11.3 11.3 0 0 1 16 0l-.6.6-1 1A9.8 9.8 0 0 0 1.6 5L.6 4Z" fill="currentColor" /></svg>
        <span className="battery"><span /></span>
      </span>
    </div>
  );
}
