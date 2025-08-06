// test-security-rules.js
// Script to test the new Firebase security rules

async function testSecurityRules() {
  console.log('Testing Firebase security rules...');
  
  // Import necessary modules
  const { getClientDatabase, ref, get } = require('firebase/database');
  const { getFirebaseAdminDb } = require('../lib/firebase-admin');
  const { app } = require('../lib/firebase');
  
  try {
    // 1. Test client-side access to users collection when not authenticated
    console.log('\n1. Testing unauthenticated client access to users:');
    const clientDb = getClientDatabase(app);
    const usersRef = ref(clientDb, 'users');
    
    try {
      console.log('Attempting to read users collection from client SDK without auth...');
      const snapshot = await get(usersRef);
      console.log('Result:', snapshot.exists() ? 'Access Granted (FAIL)' : 'No Data (Expected)');
    } catch (error) {
      console.log('Access Denied (SUCCESS):', error.message);
    }
    
    // 2. Test admin SDK access (should always work)
    console.log('\n2. Testing Admin SDK access to users:');
    const adminDb = getFirebaseAdminDb();
    const adminUsersRef = adminDb.ref('users');
    
    try {
      console.log('Attempting to read users collection from Admin SDK...');
      const snapshot = await adminUsersRef.once('value');
      console.log('Result:', snapshot.exists() ? 'Access Granted (SUCCESS)' : 'No Data (Unexpected)');
    } catch (error) {
      console.log('Access Denied (FAIL):', error.message);
    }
    
    console.log('\nSecurity rules testing complete');
    
  } catch (error) {
    console.error('Error testing security rules:', error);
  }
}

// Run the tests
testSecurityRules();
