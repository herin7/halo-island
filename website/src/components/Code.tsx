import { motion } from 'motion/react';
import { useMemo, useState } from 'react';

import { Token, tokenize } from '../highlight';

/** Splits tokens into lines, keeping multi-line tokens (comments, template strings) intact per line. */
function lines(src: string): Token[][] {
  const out: Token[][] = [[]];
  for (const [kind, text] of tokenize(src)) {
    text.split('\n').forEach((part, i) => {
      if (i > 0) out.push([]);
      if (part) out[out.length - 1].push([kind, part]);
    });
  }
  return out;
}

export function Code({ src, active, onLine, onLeave, interactive, changed, id = 'code' }: { src: string; active?: number; onLine?: (i: number) => void; onLeave?: () => void; interactive?: (i: number) => boolean; changed?: Set<number>; id?: string }) {
  const rows = useMemo(() => lines(src), [src]);
  return (
    <pre className="code" onPointerLeave={onLeave}>
      <code>
        {rows.map((row, i) => {
          const live = interactive?.(i) ?? false;
          const Tag = live ? 'button' : 'span';
          return (
            <Tag key={changed?.has(i) ? `${i}:${row.map((t) => t[1]).join("")}` : i} type={live ? 'button' : undefined} className={`code-line${live ? ' code-live' : ''}${active === i ? ' is-active' : ''}${changed?.has(i) ? ' is-changed' : ''}`}
              onPointerEnter={live ? () => onLine?.(i) : undefined} onFocus={live ? () => onLine?.(i) : undefined} onClick={live ? () => onLine?.(i) : undefined}>
              {active === i ? <motion.span layoutId={`${id}-hl`} className="code-hl" transition={{ type: 'spring', stiffness: 500, damping: 40 }} /> : null}
              <span className="code-n" aria-hidden>{i + 1}</span>
              <span className="code-t">{row.length ? row.map(([k, t], j) => <span key={j} className={`t-${k}`}>{t}</span>) : ' '}</span>
            </Tag>
          );
        })}
      </code>
    </pre>
  );
}

export function CopyButton({ text, label = 'Copy', className = '' }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className={`copy ${className}`} onClick={() => { navigator.clipboard?.writeText(text).catch(() => {}); setDone(true); setTimeout(() => setDone(false), 1400); }} aria-label={done ? 'Copied' : `${label}: ${text}`}>
      {done ? 'Copied' : label}
    </button>
  );
}
