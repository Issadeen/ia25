
import { signInWithEmailAndPassword as firebaseSignIn } from 'firebase/auth';
import { auth } from './firebase';

export async function signInWithEmailAndPassword(email: string, password: string) {
  try {
    const userCredential = await firebaseSignIn(auth, email, password);
    return userCredential.user;
  } catch (error) {
    console.error('Firebase sign in error:', error);
    throw error;
  }
}