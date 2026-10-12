const
  path              = require('path'),
  manifest          = require('../manifest'),
  CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = new CopyWebpackPlugin({
  patterns: [
    {
      from : path.join(manifest.paths.src, 'assets/static'),
      to   : path.join(manifest.paths.build, 'assets/static'),
      // The 2026 pages use inline SVG icons and backgrounds. Keep legacy source
      // assets intact, but do not ship the unreferenced icon-font pack/bg.jpg.
      globOptions: { ignore: ['**/fonts/icons/**', '**/images/bg.jpg'] },
    },
  ],
});
