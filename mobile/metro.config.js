// Learn more https://docs.expo.dev/guides/monorepos
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// Watch the whole repo root so shared/ edits trigger reloads.
config.watchFolders = [workspaceRoot];

// Let Metro see node_modules in both mobile/ and the repo root (if any).
// Keep hierarchical lookup enabled — react-native's own transitive deps
// (e.g. @react-native/virtualized-lists) live inside react-native/node_modules
// and need hierarchical resolution to be found.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;
