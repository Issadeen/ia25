import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { getDatabase, Database } from 'firebase/database';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Validate config
const validateConfig = () => {
  const requiredFields = [
    'apiKey',
    'authDomain',
    'databaseURL',
    'projectId',
    'storageBucket',
    'messagingSenderId',
    'appId',
  ];

  const missingFields = requiredFields.filter(
    field => !firebaseConfig[field as keyof typeof firebaseConfig]
  );

  if (missingFields.length > 0) {
    throw new Error(
      `Missing Firebase configuration fields: ${missingFields.join(', ')}`)
  }
};

// Initialize Firebase with validation and retry mechanism
let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let storage: FirebaseStorage | undefined;
let database: Database | undefined;
let initializationAttempts = 0;
const MAX_ATTEMPTS = 3;

const initializeFirebase = async () => {
  try {
    validateConfig();
    
    if (!getApps().length) {
      app = initializeApp(firebaseConfig);
    } else {
      app = getApps()[0];
    }

    if (!app) throw new Error('Failed to initialize Firebase app');

    auth = getAuth(app);
    await setPersistence(auth, browserLocalPersistence);
    storage = getStorage(app);
    database = getDatabase(app);

    return true;
  } catch (error) {
    console.error(`Firebase initialization attempt ${initializationAttempts + 1} failed:`, error);
    return false;
  }
};

// Try to initialize Firebase with retries
const initializeWithRetry = async () => {
  while (initializationAttempts < MAX_ATTEMPTS && !database) {
    const success = await initializeFirebase();
    if (success) break;
    initializationAttempts++;
    await new Promise(resolve => setTimeout(resolve, 1000 * initializationAttempts));
  }
};

// Initialize immediately
initializeWithRetry();

// Export with getters to ensure initialization
export const getFirebaseAuth = () => auth;
export const getFirebaseStorage = () => storage;
export const getFirebaseDatabase = () => database;

