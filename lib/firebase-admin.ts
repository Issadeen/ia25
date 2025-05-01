import admin from 'firebase-admin';
import { ServiceAccount } from 'firebase-admin';

// Construct the service account object from individual environment variables
let serviceAccount: ServiceAccount;
try {
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'); // Replace literal '\n' with actual newlines

  if (!process.env.FIREBASE_ADMIN_PROJECT_ID) {
    throw new Error("FIREBASE_ADMIN_PROJECT_ID environment variable is not set.");
  }
  if (!process.env.FIREBASE_ADMIN_CLIENT_EMAIL) {
    throw new Error("FIREBASE_ADMIN_CLIENT_EMAIL environment variable is not set.");
  }
  if (!privateKey) {
    throw new Error("FIREBASE_ADMIN_PRIVATE_KEY environment variable is not set or is empty.");
  }

  serviceAccount = {
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: privateKey,
  };

} catch (e) {
  console.error("Failed to construct Firebase Admin Service Account from environment variables:", e);
  // Handle the error appropriately
  serviceAccount = {} as ServiceAccount; // Assign empty object to satisfy type checker temporarily
}

const initializeAdminApp = () => {
  // Check if the app is already initialized to prevent duplicates
  if (!admin.apps.length) {
    try {
      console.log("[Firebase Admin] Initializing app...");
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        // Ensure this environment variable is set and correct
        databaseURL: process.env.FIREBASE_DATABASE_URL || process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL
      });
      console.log("[Firebase Admin] App initialized successfully.");
    } catch (error) {
      console.error("[Firebase Admin] Error initializing app:", error);
      // Rethrow or handle as appropriate for your application
      throw error;
    }
  } else {
    console.log("[Firebase Admin] App already initialized.");
  }
};

// Modify getters to ensure initialization
export const getFirebaseAdminAuth = () => {
  initializeAdminApp(); // Ensure app is initialized before accessing auth
  return admin.auth();
};

export const getFirebaseAdminDb = () => {
  initializeAdminApp(); // Ensure app is initialized before accessing database
  return admin.database();
};