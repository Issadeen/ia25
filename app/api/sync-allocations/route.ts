import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth'; // Updated import path
import { getDatabase } from 'firebase/database';
import { ensureEntryInAllocations, syncAllocationsToEntriesDb } from '@/lib/allocation-sync';
import { database } from '@/lib/firebase'; // Fixed: imported database instead of initFirebase

export async function GET(req: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json(
        { success: false, message: 'Authentication required' },
        { status: 401 }
      );
    }

    // Run sync operation
    const db = getDatabase();
    const result = await syncAllocationsToEntriesDb(db);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error syncing allocations:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: error instanceof Error ? error.message : 'Unknown error during sync' 
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json(
        { success: false, message: 'Authentication required' },
        { status: 401 }
      );
    }

    // Get entry ID from request body
    const body = await req.json();
    if (!body.entryId) {
      return NextResponse.json(
        { success: false, message: 'Entry ID is required' },
        { status: 400 }
      );
    }

    // Run sync operation for specific entry
    const db = getDatabase();
    const result = await ensureEntryInAllocations(db, body.entryId);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error syncing specific entry:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: error instanceof Error ? error.message : 'Unknown error during sync' 
      },
      { status: 500 }
    );
  }
}
