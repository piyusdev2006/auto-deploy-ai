/**
 * @file babel.config.js
 * @description Babel config used ONLY by Jest to transform ESM-only
 * node_modules (@octokit/*) into CommonJS so they work with Jest's
 * default module system.
 *
 * This does NOT affect production code (Node runs server.js directly).
 */

module.exports = {
  presets: [
    [
      "@babel/preset-env",
      {
        targets: { node: "current" },
      },
    ],
  ],
};
