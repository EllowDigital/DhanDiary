// Minimal firebase helper used by the SplashScreen bootstrap logic.
// If you already use Firebase in this project, replace this file with your real initialisation.

export const getFirebaseAuth = () => {
  // Dummy auth object with `currentUser` property to avoid runtime crashes
  return {
    currentUser: null,
  } as any;
};
