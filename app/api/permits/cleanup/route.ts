import { NextResponse } from 'next/server';
import { getDatabase } from 'firebase/database';
import { cleanupDuplicateAllocations, validateAllocations } from '@/lib/permit-cleanup';

export async function POST() {
  try {
    const db = getDatabase();
    
    // Run cleanup
    const cleanupResult = await cleanupDuplicateAllocations(db);
    
    // Validate after cleanup
    const validationErrors = await validateAllocations(db);
    
    return NextResponse.json({
      success: true,
      ...cleanupResult,
      validationErrors
    });
  } catch (error) {
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}
