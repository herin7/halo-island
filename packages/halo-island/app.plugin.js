const { AndroidConfig, withAndroidManifest, withGradleProperties } = require('expo/config-plugins');

const SERVICE = 'expo.modules.haloisland.IslandService';
const OVERLAY_PERMISSIONS = [
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_SPECIAL_USE',
];

/**
 * `["halo-island", { "overlay": true }]` adds the Android cross-app island. Off by default: it
 * needs SYSTEM_ALERT_WINDOW and a specialUse foreground service, which Google Play reviews.
 */
module.exports = function withHaloIsland(config, { overlay = false, rive = false, overlayReason = 'Shows the live activity the user started as a floating island across apps.' } = {}) {
  if (rive) {
    config = withGradleProperties(config, (mod) => {
      mod.modResults = mod.modResults.filter((p) => p.key !== 'haloIsland.rive');
      mod.modResults.push({ type: 'property', key: 'haloIsland.rive', value: 'true' });
      return mod;
    });
  }
  if (!overlay) return config;
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    manifest['uses-permission'] = manifest['uses-permission'] ?? [];
    for (const name of OVERLAY_PERMISSIONS) {
      if (!manifest['uses-permission'].some((p) => p.$['android:name'] === name)) {
        manifest['uses-permission'].push({ $: { 'android:name': name } });
      }
    }
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    app.service = (app.service ?? []).filter((s) => s.$['android:name'] !== SERVICE);
    app.service.push({
      $: { 'android:name': SERVICE, 'android:exported': 'false', 'android:foregroundServiceType': 'specialUse' },
      property: [{ $: { 'android:name': 'android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE', 'android:value': overlayReason } }],
    });
    return mod;
  });
};
