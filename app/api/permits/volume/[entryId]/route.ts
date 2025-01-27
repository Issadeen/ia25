import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/lib/auth';
import { updateEntryVolume, checkEntryVolumes } from '@/utils/permit-helpers';
import { firebaseConfig } from '@/lib/firebase';

// Initialize Firebase if not already initialized
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export async function GET(
  request: NextRequest,
  { params }: { params: { entryId: string } }
) {
  try {
    const db = getDatabase(app);
    const volumes = await checkEntryVolumes(db, params.entryId);
    
    return NextResponse.json({
      success: true,
      volumes
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

export async function PUT(
  request: NextRequest,
  { params }: { params: { entryId: string } }
) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const db = getDatabase(app);
    const { newVolume } = await request.json();

    if (typeof newVolume !== 'number' || newVolume < 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid volume value' },
        { status: 400 }
      );
    }

    await updateEntryVolume(db, params.entryId, newVolume);
    
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Volume update error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}
