
export const EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx',
  '/index.ts', '/index.tsx', '/index.js', '/index.jsx'
];

export const ALIASES = {
  '@utils/': 'utils',
  '@services/': 'services',
  '@store/': 'store',
  '@components/': 'components',
  '@views/': 'views',
  '@modules/': 'modules',
};

export const SKIPPED_PACKAGES = [
  'react',
  'react-dom',
  'lodash',
  'axios',
  'mobx',
  'mobx-react',
  'redux',
  'react-redux',
  'next',
  'vue',
  'vuex',
  'svelte',
];

export const INPUT_FILE_PATTERNS = ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'];

export const INPUT_ROOT_FOLDER = 'src/';
