const path = require('path');
const glob = require('glob');

// Get all JS files from src/js directory (relative to project root)
const entries = glob.sync('./src/js/**/*.js').reduce((acc, file) => {
    const name = path.relative('./src/js', file).replace(/\.js$/, '');
    acc[name] = path.resolve(__dirname, file);
    return acc;
}, {});

module.exports = {
    mode: 'development',
    entry: entries,
    output: {
        filename: '[name].js',
        path: path.resolve(__dirname, './public/js'),
    },
    resolve: {
        extensions: ['.js']
    },
    target: 'web',
    devServer: {
        static: './public',
        hot: true,
    },
};