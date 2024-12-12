import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const getFirebaseAdminApp = () => {
  try {
    const apps = getApps();
    if (apps.length > 0) {
      return apps[0];
    }

    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error('Firebase Admin credentials are missing');
    }

    // Replace escaped newline characters with actual newlines
    privateKey = privateKey.replace(/\\n/g, '\n');

    console.log('Initializing Firebase Admin with:', {
      projectId,
      clientEmail,
      privateKeyLength: privateKey.length,
      hasValidHeader: privateKey.includes('-----BEGIN PRIVATE KEY-----'),
      hasValidFooter: privateKey.includes('-----END PRIVATE KEY-----')
    });

    return initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
      databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
    });
  } catch (error) {
    console.error('Firebase Admin initialization error details:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    throw error;
  }
};

export const initAdmin = () => {
  try {
    const app = getFirebaseAdminApp();
    const auth = getAuth(app);
    return auth;
  } catch (error) {
    console.error('Firebase Admin auth initialization failed:', error);
    throw error; // Throw instead of returning null
  }
};