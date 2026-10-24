/**
 * The showcase's named assets, so templates stay plain JSON: icon('moped'), lottie('lottie:confetti').
 * Glyphs are Phosphor (MIT); Lottie credits are in the root README.
 */
import { registerAssets, registerIcons } from 'halo-island';

import { glyphs } from './glyphs';

registerIcons(glyphs);
registerAssets({
  'lottie:confetti': require('./assets/lottie/confetti.json'),
  'lottie:checkmark': require('./assets/lottie/checkmark.json'),
});
