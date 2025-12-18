// Google/social sign-in is not available in local-only mode.
export const configureGoogleSignIn = () => {
  // noop
};

export const signInWithGoogle = async () => {
  throw new Error('Google Sign-In is not supported in local-only mode');
};
