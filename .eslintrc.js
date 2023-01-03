module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: ['./tsconfig.json'],
  },
  plugins: ['@typescript-eslint', 'prettier'],
  root: true,
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'airbnb-base',
    'airbnb-typescript/base',
    'plugin:prettier/recommended',
    'prettier',
  ],
  rules: {
    'prettier/prettier': ['warn'],
    '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: true }],
    'no-void': ['error', { allowAsStatement: true }],
    'import/prefer-default-export': 'off',
    '@typescript-eslint/no-misused-promises': 'off'
  }
};