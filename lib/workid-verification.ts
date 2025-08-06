import { getFirebaseAdminDb } from '@/lib/firebase-admin';

/**
 * Verifies a workId against the user's email in the database
 * This can be used in API routes to verify workId
 * 
 * @param email - User email
 * @param workId - Work ID to verify
 * @returns Promise<boolean> - True if verification is successful
 */
export async function verifyWorkIdByEmail(email: string, workId: string): Promise<boolean> {
  if (!email || !workId) {
    return false;
  }

  try {
    const adminDb = getFirebaseAdminDb();
    const usersRef = adminDb.ref('users');
    
    // Find the user by email
    const snapshot = await usersRef
      .orderByChild('email')
      .equalTo(email.toLowerCase())
      .once('value');
    
    if (!snapshot.exists()) {
      return false;
    }
    
    // Check if any user with this email has the matching workId
    let isValid = false;
    
    snapshot.forEach((childSnapshot) => {
      const userData = childSnapshot.val();
      if (userData.workId === workId.trim()) {
        isValid = true;
        return true; // Break the loop
      }
      return false;
    });
    
    return isValid;
  } catch (error) {
    console.error('WorkId verification error:', error);
    return false;
  }
}

/**
 * Retrieves a user's workId by their email
 * This can be used in API routes to get the workId
 * 
 * @param email - User email
 * @returns Promise<string | null> - The workId or null if not found
 */
export async function getWorkIdByEmail(email: string): Promise<string | null> {
  if (!email) {
    return null;
  }

  try {
    const adminDb = getFirebaseAdminDb();
    const usersRef = adminDb.ref('users');
    
    // Find the user by email
    const snapshot = await usersRef
      .orderByChild('email')
      .equalTo(email.toLowerCase())
      .once('value');
    
    if (!snapshot.exists()) {
      return null;
    }
    
    // Get the workId from the user record
    let workId: string | null = null;
    
    snapshot.forEach((childSnapshot) => {
      const userData = childSnapshot.val();
      if (userData.workId) {
        workId = userData.workId;
        return true; // Break the loop
      }
      return false;
    });
    
    return workId;
  } catch (error) {
    console.error('Error getting workId by email:', error);
    return null;
  }
}
