const expoPreset = require('jest-expo/jest-preset');
const expoSetupFile = require.resolve('jest-expo/src/preset/setup.js');
const presetSetupFiles = (expoPreset.setupFiles || []).filter((file) => file !== expoSetupFile);

module.exports = {
  ...expoPreset,
  testEnvironment: 'jsdom',
  transform: {
    ...expoPreset.transform,
    '^.+\\.[jt]sx?$': 'babel-jest',
  },
  moduleFileExtensions: expoPreset.moduleFileExtensions || [
    'ts',
    'tsx',
    'js',
    'jsx',
    'json',
    'node',
  ],
  transformIgnorePatterns: expoPreset.transformIgnorePatterns || [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|native-base|react-native-svg)',
  ],
  moduleNameMapper: {
    ...(expoPreset.moduleNameMapper || {}),
    '^expo-modules-core/build/(.*)$': '<rootDir>/node_modules/expo-modules-core/src/$1',
  },
  setupFiles: [
    ...presetSetupFiles,
    '<rootDir>/jest.setupNativeMocks.js',
    expoSetupFile,
    '<rootDir>/jest.setup.js',
  ],
};
