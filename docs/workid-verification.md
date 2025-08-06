# WorkId Verification System

This document explains how the WorkId verification system works in the application.

## Overview

The WorkId verification system provides a secure way to verify user identity for sensitive operations, like editing truck details or approving gate passes. It uses a consistent, session-based approach that doesn't require repeated database lookups.

## Components

The system consists of the following components:

1. **Session Token with WorkId**: 
   - The JWT token contains the user's workId
   - The workId is set during login and authentication
   - If missing, the system attempts to fetch it from the database

2. **Session Token API**:
   - `/api/auth/session-token` endpoint returns the token with workId
   - Handles missing workId by attempting to fetch from database

3. **Hooks**:
   - `useSessionToken`: Fetches the session token with workId
   - `useWorkIdVerification`: Provides a consistent way to verify workIds

4. **Components**:
   - `WorkIdDialog`: Reusable component for workId verification UI

5. **Server-side Utilities**:
   - `verifyWorkIdByEmail`: Verifies workId against email in database
   - `getWorkIdByEmail`: Retrieves workId by email
   - `hasValidWorkId`: Checks if session has valid workId
   - `getWorkIdFromSession`: Gets workId from session

## How It Works

1. **Login Process**:
   - User logs in (email/password or token-based)
   - The system fetches the workId from the database
   - The workId is included in the JWT token

2. **Client-side Verification**:
   - Components use `useWorkIdVerification` hook
   - The hook verifies the input workId against the token
   - No database query needed for verification

3. **Server-side Verification**:
   - API routes use `verifyWorkIdByEmail` or `getWorkIdFromSession`
   - Middleware can use `hasValidWorkId` to protect routes

## Implementation Example

### Client-side Verification

```tsx
import { useWorkIdVerification } from '@/hooks/useWorkIdVerification';
import { WorkIdDialog } from '@/components/dashboard/WorkIdDialog';

export default function MyComponent() {
  const [isWorkIdDialogOpen, setIsWorkIdDialogOpen] = useState(false);
  const { verifyWorkId } = useWorkIdVerification();
  
  const handleVerify = async (inputWorkId: string): Promise<boolean> => {
    const isValid = await verifyWorkId(inputWorkId);
    
    if (isValid) {
      // Perform protected action
      setIsWorkIdDialogOpen(false);
    }
    
    return isValid;
  };
  
  return (
    <>
      <Button onClick={() => setIsWorkIdDialogOpen(true)}>
        Edit Item
      </Button>
      
      <WorkIdDialog
        isOpen={isWorkIdDialogOpen}
        onClose={() => setIsWorkIdDialogOpen(false)}
        onVerify={handleVerify}
        title="Verify Identity"
        description="Please enter your Work ID to continue with this action."
      />
    </>
  );
}
```

### Server-side Verification

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getWorkIdFromSession } from '@/lib/session-utils';
import { verifyWorkIdByEmail } from '@/lib/workid-verification';

export async function POST(request: NextRequest) {
  try {
    // Get workId from request body
    const { workId } = await request.json();
    
    // Get email from session
    const email = await getEmailFromSession(request);
    
    if (!email) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    
    // Verify workId
    const isValid = await verifyWorkIdByEmail(email, workId);
    
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid Work ID' }, { status: 403 });
    }
    
    // Perform protected action
    // ...
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in protected route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

## Troubleshooting

If you're having issues with workId verification:

1. **Invalid WorkId Errors**:
   - Check that the workId is correctly stored in the database
   - Ensure the workId is being set during login

2. **Missing WorkId in Token**:
   - Check that the JWT token contains the workId
   - The session token API will try to fetch missing workIds

3. **Case Sensitivity**:
   - WorkIds are case-sensitive
   - The WorkIdDialog component converts input to uppercase
