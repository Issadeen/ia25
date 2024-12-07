import { initializeApp } from 'firebase/app';
import { getDatabase, ref, get, update } from 'firebase/database';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const data = require('./truckEntries.json');

const firebaseConfig = {
    apiKey: "AIzaSyDklv5Sgwiy84_fCOqiQRCiuTBVRZ_2EvY",
    authDomain: "my-1-wb.firebaseapp.com",
        projectId: "my-1-wb",
        storageBucket: "my-1-wb.appspot.com",
        messagingSenderId: "865633557898",
        appId: "1:865633557898:web:5e8a848b08d7475054bc73"
  };

async function migrateData() {
  const app = initializeApp(firebaseConfig);
  const db = getDatabase(app);
  const truckEntriesRef = ref(db, 'truckEntries');

  try {
    // First get existing data
    const snapshot = await get(truckEntriesRef);
    const existingData = snapshot.val() || {};

    // Merge existing data with new data
    const mergedData = {
      ...existingData,
      ...data
    };

    // Update database with merged data
    await update(ref(db), {
      'truckEntries': mergedData
    });

    console.log('Migration completed successfully');
    // Log the number of truck entries
    console.log('Total truck entries:', Object.keys(mergedData).length);
  } catch (error) {
    console.error('Migration failed:', error);
  }
}

migrateData();