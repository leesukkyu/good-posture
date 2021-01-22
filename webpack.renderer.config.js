/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('path')
const rules = require('./webpack.rules')
const CopyPlugin = require('copy-webpack-plugin')
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin')

rules.push({
    test: /\.s?css$/,
    use: ['style-loader', 'css-loader', 'sass-loader'],
})

module.exports = {
    module: {
        rules,
    },
    plugins: [
        new CopyPlugin({
            patterns: [
                {
                    from: path.resolve(__dirname, 'src', 'assets'),
                    to: 'assets',
                },
            ],
        }),
        new ForkTsCheckerWebpackPlugin(),
    ],
    resolve: {
        extensions: ['.js', '.ts', '.jsx', '.tsx', '.css'],
    },
}
