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
    path: path.resolve(__dirname, 'assets/js'),
  },
  mode: 'production',
  optimization: {
    minimizer: [new TerserPlugin()],
  },
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
    modules: ['node_modules'],
  },
};
