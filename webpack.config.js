import { fileURLToPath } from 'url';
import path from 'path';
import TerserPlugin from 'terser-webpack-plugin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  entry: {
    'nostrly-cashu': './src/main.js',
  },
  output: {
    filename: '[name].min.js',
    path: path.resolve(__dirname, 'public'),
  },
  mode: 'production',
  optimization: {
    minimizer: [new TerserPlugin()],
  },
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
    modules: ['node_modules'],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,           // Match .ts and .tsx files
        use: 'ts-loader',          // Use ts-loader to compile
        exclude: /node_modules/,   // Skip node_modules
      },
    ],
  },
};
