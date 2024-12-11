import { getApps, initializeApp, cert, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';

let adminAuth: Auth | undefined;

export const initAdmin = () => {
  try {
    if (!getApps().length) {
      const privateKey = process.env.FIREBASE_PRIVATE_KEY;
      if (!privateKey) {
        throw new Error('FIREBASE_PRIVATE_KEY is not defined');
      }

      const serviceAccount = {
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey.replace(/\\n/g, '\n'),
      };

      // Validate required credentials
      if (!serviceAccount.projectId || !serviceAccount.clientEmail) {
        throw new Error('Missing Firebase Admin credentials');
      }

      initializeApp({
        credential: cert(serviceAccount),
        databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
      });
    }

    return getAuth();
  } catch (error) {
    console.error('Firebase Admin Init Error:', error);
    throw error;
  }
};