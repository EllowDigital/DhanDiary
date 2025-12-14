import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { getFirebaseAuth } from '../firebase';

export const configureGoogleSignIn = () => {
  GoogleSignin.configure({
    webClientId: '315200510366-8ek2cvlnsidt7e6bgi16tn0kinvtasgb.apps.googleusercontent.com',
    offlineAccess: false,
  });
};

export const signInWithGoogle = async () => {
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const userInfo = await GoogleSignin.signIn();
  const idToken = (userInfo as any).idToken;
  if (!idToken) throw new Error('Google Sign-In did not return an idToken');
  const credential = GoogleAuthProvider.credential(idToken);
  const auth = getFirebaseAuth();
  return signInWithCredential(auth, credential);
};
