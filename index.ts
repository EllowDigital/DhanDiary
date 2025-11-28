import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';

import App from './App';

// Initialize LogRocket for web only. Use dynamic import to avoid bundling web-only
// packages into native builds.
if (Platform.OS === 'web') {
  (async () => {
    try {
      // LOGROCKET_APPID should be provided via environment variables for web builds
      const appId = process.env.LOGROCKET_APPID || '';
      if (!appId) return;
      const LogRocketModule = await import('logrocket');
      const setupLogRocketReactModule = await import('logrocket-react');
      const LogRocket = LogRocketModule.default || LogRocketModule;
      const setupLogRocketReact = setupLogRocketReactModule.default || setupLogRocketReactModule;
      LogRocket.init(appId);
      setupLogRocketReact(LogRocket);
    } catch (e) {
      // Do not break the app if LogRocket fails to load on web

      console.warn('LogRocket web init failed', e);
    }
  })();
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
