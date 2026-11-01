const { getDefaultConfig } = require("expo/metro-config");

// Expo wires up the monorepo itself; @edge/contracts and @edge/domain are plain TypeScript and Metro transforms them.
module.exports = getDefaultConfig(__dirname);
