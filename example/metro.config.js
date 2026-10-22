const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// Rive characters ship as .riv assets.
config.resolver.assetExts.push('riv');

module.exports = config;
