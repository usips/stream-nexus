const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = (env = {}) => {
    const target = env.target || 'chrome'; // 'chrome' or 'firefox'
    const outputDir = path.resolve(__dirname, `dist/${target}`);

    return {
        mode: 'production',
        entry: {
            'injected': path.resolve(__dirname, 'src/userscript.js'),
            'content-script': path.resolve(__dirname, 'src/content-script.js'),
        },
        output: {
            filename: '[name].js',
            path: outputDir,
            clean: true,
        },
        resolve: {
            extensions: ['.js'],
            fullySpecified: false,
        },
        target: 'web',
        optimization: {
            minimize: false, // Keep readable for debugging
        },
        plugins: [
            new CopyPlugin({
                patterns: [
                    {
                        from: path.resolve(__dirname, `extension/manifest.${target}.json`),
                        to: 'manifest.json',
                    },
                    {
                        from: path.resolve(__dirname, 'extension/background.js'),
                        to: 'background.js',
                    },
                    {
                        from: path.resolve(__dirname, 'extension/popup'),
                        to: 'popup',
                    },
                    {
                        from: path.resolve(__dirname, 'extension/icons'),
                        to: 'icons',
                        noErrorOnMissing: true,
                    },
                ],
            }),
        ],
        module: {
            rules: [
                {
                    test: /\.js$/,
                    type: 'javascript/auto',
                }
            ]
        }
    };
};
