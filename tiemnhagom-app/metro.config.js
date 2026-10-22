// metro.config.js
// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Hỗ trợ đóng gói các định dạng ESM / CJS hiện đại (.mjs, .cjs)
if (config.resolver && config.resolver.sourceExts) {
  const exts = new Set([...config.resolver.sourceExts, 'mjs', 'cjs']);
  config.resolver.sourceExts = Array.from(exts);
}

module.exports = config;
