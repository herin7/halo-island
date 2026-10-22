import { IslandTemplate, bar, button, column, icon, image, ring, row, text, timer } from './spec';

/**
 * Ready-made templates. Each lists the state keys it reads. Customize by spreading:
 * `island({ ...presets.timer, theme: { accent: '#FF7657' } })`.
 */
export const presets = {
  /** state: title, eta, progress (0–1), driver */
  ride: {
    compact: { leading: icon('car', { color: '#5FCB9C' }), trailing: text('{eta}', { weight: 'bold', mono: true }) },
    expanded: column(
      text('{title}', { size: 17, weight: 'bold' }),
      text('{driver}', { color: '#9AA09A' }),
      bar('{progress}', { height: 6 }),
    ),
  },

  /** state: label, endsAt (epoch ms) */
  timer: {
    compact: { leading: icon('timer', { color: '#FFB86B' }), trailing: timer('{endsAt}', { style: { weight: 'bold', color: '#FFB86B' } }) },
    expanded: row(
      column({ gap: 2, grow: true }, text('{label}', { color: '#9AA09A' }), timer('{endsAt}', { style: { size: 36, weight: 'heavy' } })),
      button('stop', undefined, { icon: 'stop', color: '#3A2323', textColor: '#EC8585' }),
    ),
    theme: { accent: '#FFB86B' },
  },

  /** state: title, artist, artwork (uri), progress (0–1), playIcon ('play' | 'pause') */
  media: {
    compact: { leading: image('{artwork}', { size: 24, radius: 6 }), trailing: icon('music', { color: '#C7B2FF' }) },
    expanded: column(
      row(image('{artwork}', { size: 52, radius: 12 }), column({ gap: 2, grow: true }, text('{title}', { size: 16, weight: 'bold' }), text('{artist}', { color: '#9AA09A' }))),
      bar('{progress}', { color: '#C7B2FF' }),
      row({ justify: 'center', gap: 12 }, button('previous', undefined, { icon: 'play', color: '#24212E', textColor: '#F7F7F2' }), button('toggle', undefined, { icon: '{playIcon}' }), button('next', undefined, { icon: 'play', color: '#24212E', textColor: '#F7F7F2' })),
    ),
    theme: { accent: '#C7B2FF' },
  },

  /** state: label, value, goal, progress (0–1) — e.g. steps, calories, reading */
  goal: {
    compact: { leading: ring('{progress}', { size: 20 }), trailing: text('{value}', { weight: 'bold', mono: true }) },
    expanded: column(
      row(ring('{progress}', { size: 44, thickness: 5 }), column({ gap: 2, grow: true }, text('{label}', { color: '#9AA09A' }), text('{value} / {goal}', { size: 20, weight: 'bold', mono: true }))),
      row({ gap: 8 }, button('end', 'End', { icon: 'stop', color: '#361E1E', textColor: '#EC8585' }), button('open', 'Open', { icon: 'check' })),
    ),
  },

  /** state: title, percent (text), progress (0–1) — downloads, uploads, exports, AI generation */
  progress: {
    compact: { leading: ring('{progress}', { size: 20, color: '#9C9EFF' }), trailing: text('{percent}', { weight: 'bold', mono: true }) },
    expanded: column(
      row({ justify: 'between' }, text('{title}', { weight: 'semibold' }), text('{percent}', { weight: 'bold', mono: true, color: '#9C9EFF' })),
      bar('{progress}', { color: '#9C9EFF', height: 6 }),
      button('cancel', 'Cancel', { color: '#232329', textColor: '#F7F7F2' }),
    ),
  },

  /** state: name, startedAt (epoch ms) */
  call: {
    compact: { leading: icon('phone', { color: '#5FCB9C' }), trailing: timer('{startedAt}', { countUp: true, style: { color: '#5FCB9C', weight: 'semibold' } }) },
    expanded: row(
      column({ gap: 2, grow: true }, text('{name}', { size: 17, weight: 'bold' }), timer('{startedAt}', { countUp: true, style: { color: '#9AA09A' } })),
      button('mute', undefined, { icon: 'mic', color: '#2A2D2A', textColor: '#F7F7F2' }),
      button('hangup', undefined, { icon: 'phone', color: '#E5484D', textColor: '#FFFFFF' }),
    ),
  },

  /** state: home, away, homeScore, awayScore, clock */
  score: {
    compact: { leading: text('{home} {homeScore}', { weight: 'bold', mono: true }), trailing: text('{awayScore} {away}', { weight: 'bold', mono: true }) },
    expanded: row({ justify: 'between' },
      text('{home}', { size: 18, weight: 'bold' }),
      column({ align: 'center', gap: 0 }, text('{homeScore} – {awayScore}', { size: 28, weight: 'heavy', mono: true }), text('{clock}', { color: '#E5484D', size: 12, weight: 'bold' })),
      text('{away}', { size: 18, weight: 'bold' }),
    ),
  },

  /** state: title, message, icon — use with `.show()` for in-app toasts */
  toast: {
    compact: { leading: icon('{icon}', { color: '#5FCB9C' }), trailing: text('{title}', { weight: 'semibold' }) },
    expanded: column({ gap: 2 }, text('{title}', { weight: 'bold', size: 16 }), text('{message}', { color: '#9AA09A', lines: 2 })),
  },
} satisfies Record<string, IslandTemplate>;
