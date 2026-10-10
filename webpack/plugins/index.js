const manifest = require('../manifest');
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');

const plugins = [];

plugins.push(
  ...(require('./htmlPlugin')),
  ...(require('./internal')),
  require('./caseSensitivePlugin'),
  require('./extractPlugin'),
  require('./copyPlugin')
);

if (manifest.IS_DEVELOPMENT) {
  plugins.push(require('./dashboardPlugin'));
}

/* Note: copyPlugin is registered once, above. It used to be pushed a second
   time under IS_PRODUCTION — and because require() is cached, that was the
   same plugin instance running its copy twice per production build. */

// Bundle analyzer - run with ANALYZE=true npm run build
if (process.env.ANALYZE === 'true') {
  plugins.push(new BundleAnalyzerPlugin({
    analyzerMode: 'static',
    reportFilename: 'bundle-report.html',
    openAnalyzer: true,
  }));
}

module.exports = plugins;
