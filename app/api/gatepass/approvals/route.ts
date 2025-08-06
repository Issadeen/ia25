import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { getDatabase, ref, push, set, DatabaseReference } from 'firebase/database';
import { database } from '@/lib/firebase';
import { getFirebaseAdminDb } from '@/lib/firebase-admin';

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Extract query parameters
  const url = new URL(request.url);
  const orderId = url.searchParams.get('orderId');
  const status = url.searchParams.get('status');
  
  try {
    // Use Firebase Admin SDK to bypass security rules
    const adminDb = getFirebaseAdminDb();
    const approvalsRef = adminDb.ref('gatepass_approvals');
    
    // Apply filters if provided
    let snapshot;
    if (orderId) {
      snapshot = await approvalsRef.orderByChild('orderNo').equalTo(orderId).once('value');
    } else if (status) {
      snapshot = await approvalsRef.orderByChild('status').equalTo(status).once('value');
    } else {
      snapshot = await approvalsRef.once('value');
    }
    
    if (!snapshot.exists()) {
      return NextResponse.json({ approvals: [] });
    }
    
    // Convert the data to an array and sanitize sensitive fields
    const approvals = Object.entries(snapshot.val()).map(([id, data]: [string, any]) => ({
      id,
      orderNo: data.orderNo,
      status: data.status,
      requestedAt: data.requestedAt,
      respondedAt: data.respondedAt || null,
      truckNo: data.truckNo,
      product: data.product,
      destination: data.destination,
      // Do not include requesterEmail or other sensitive data
    }));
    
    return NextResponse.json({ approvals });
    
  } catch (error) {
    console.error('Error fetching gate pass approvals:', error);
    return NextResponse.json(
      { error: 'Failed to fetch approvals' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const { orderNo, truckNo, product, destination } = await request.json();
    
    if (!orderNo || !truckNo) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    // Use Firebase Admin SDK to bypass security rules
    const adminDb = getFirebaseAdminDb();
    const approvalsRef = adminDb.ref('gatepass_approvals');
    
    // Generate a unique ID
    const newApprovalRef = approvalsRef.push();
    
    await newApprovalRef.set({
      orderNo,
      truckNo,
      product,
      destination,
      status: 'pending',
      requestedAt: new Date().toISOString(),
      requesterEmail: session.user.email,
      expiryTime: Date.now() + (1000 * 60 * 60) // 1 hour expiry
    });
    
    return NextResponse.json({ 
      success: true, 
      approvalId: newApprovalRef.key
    });
    
  } catch (error) {
    console.error('Error creating gate pass approval:', error);
    return NextResponse.json(
      { error: 'Failed to create approval request' },
      { status: 500 }
    );
  }
}
