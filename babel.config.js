module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      'add-react-displayname',
      'expo-router/babel',
      'react-native-reanimated/plugin', // <--- Must be last. No duplicates!
    ],
  };
};
