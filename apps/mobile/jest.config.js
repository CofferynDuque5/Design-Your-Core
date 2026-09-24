/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/src/test/setup.ts'],
  setupFilesAfterEnv: ['<rootDir>/src/test/setupAfterEnv.ts'],
  // Los paquetes internos (@dyc/*) y los de Expo se publican sin compilar para RN.
  transformIgnorePatterns: [
    'node_modules/(?!(?:.pnpm/[^/]+/node_modules/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|react-native-svg|lucide-react-native|@dyc/.*|standard-navigation))',
  ],
  // Lucide publica ESM en .mjs para React Native; en Jest se usa su versión CommonJS.
  moduleNameMapper: {
    '^lucide-react-native$': require.resolve('lucide-react-native', { paths: [__dirname] }),
  },
  // El primer recorrido transforma todas las pantallas en frío (más de 10 s en CI).
  testTimeout: 30_000,
  testPathIgnorePatterns: ['/node_modules/', '/dist-web/'],
};
