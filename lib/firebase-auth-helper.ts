import { getFirebaseAuth } from './firebase';
import { signInWithCustomToken } from 'firebase/auth';

/**
 * Attempts to initialize Firebase authentication with a retry mechanism
 * @param maxRetries Maximum number of retry attempts
 * @param initialDelay Initial delay in ms (will increase exponentially)
 * @returns Promise resolving to true if successful, or error on failure
 */
export async function ensureFirebaseAuth(maxRetries = 3, initialDelay = 1000): Promise<boolean> {
  const auth = getFirebaseAuth();
  
  // If already authenticated, resolve immediately
  if (auth?.currentUser) {
    return true;
  }
  
  // Function to attempt authentication
  const attemptAuth = async (retryCount = 0): Promise<boolean> => {
    try {
      const response = await fetch('/api/auth/firebase-token');
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error(`Firebase token fetch failed (${response.status}):`, errorData);
        throw new Error(`Token fetch failed: ${response.status}`);
      }
      
      const { customToken } = await response.json();
      
      if (!customToken) {
        throw new Error('No custom token returned from API');
      }
      
      // Sign in with the custom token
      await signInWithCustomToken(getFirebaseAuth()!, customToken);
      console.log('Firebase auth initialized successfully');
      return true;
      
    } catch (error) {
      console.error(`Firebase auth attempt ${retryCount + 1}/${maxRetries} failed:`, error);
      
      // If we still have retries left
      if (retryCount < maxRetries - 1) {
        // Exponential backoff
        const delay = initialDelay * Math.pow(2, retryCount);
        console.log(`Retrying in ${delay}ms...`);
        
        // Wait and retry
        await new Promise(resolve => setTimeout(resolve, delay));
        return attemptAuth(retryCount + 1);
      }
      
      // Out of retries
      throw error;
    }
  };
  
  return attemptAuth();
}
