const path = require('path');

module.exports = {
    mode: 'production',
    entry: {
        'script': './src/frontend/overlay/script.ts',
        'dashboard': './src/frontend/dashboard/dashboard.ts',
    },
    output: {
        filename: '[name].js',
        path: path.resolve(__dirname, './public'),
    },
    resolve: {
        extensions: ['.ts', '.js']
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
        ],
    },
    target: 'web',
    devServer: {
        static: './public',
        hot: true,
    },
};
