import { InteractionManager } from 'react-native';

// Run a function in a background-ish task after yielding to the UI thread.
// This helps keep press/tap animations and navigation responsive by deferring
// heavier async work until after the interaction has finished.
export const runInBackground = (fn: () => Promise<any> | void) => {
  // Yield to the event loop so the UI can update (button press ripple, nav).
  setTimeout(() => {
    try {
      // Prefer InteractionManager to wait until animations/interactions finish.
      InteractionManager.runAfterInteractions(() => {
        try {
          const res = fn();
          // If fn returns a promise, attach a catch to avoid unhandled rejections.
          if (res && typeof (res as any).catch === 'function') {
            (res as any).catch((e: any) => console.warn('background task error', e));
          }
        } catch (e) {
          console.warn('background task sync error', e);
        }
      });
    } catch (e) {
      // Fallback if InteractionManager is not available for some reason.
      try {
        const res = fn();
        if (res && typeof (res as any).catch === 'function') {
          (res as any).catch((er: any) => console.warn('background task error', er));
        }
      } catch (er) {
        console.warn('background task fallback error', er);
      }
    }
  }, 0);
};

export default runInBackground;
