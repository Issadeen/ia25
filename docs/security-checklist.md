# Security Checklist for Production

## Debug Endpoints
For security reasons, please remove these endpoints before deploying to production:

- `/api/debug-token` - This endpoint exposes sensitive token information and should be removed
- Remove any console.log statements that might leak sensitive information

## How to Remove Debug Endpoints
1. Delete the following files:
   ```
   app/api/debug-token/route.ts
   ```

2. Check that no sensitive information is being logged:
   - Review all console.log statements in authentication-related files
   - Remove any that expose user credentials, tokens, or other sensitive data

## User-Info API
The `/api/user-info` endpoint is now secured and only returns the necessary user information:
- email (required for some existing workId verification flows)
- name
- image

No JWT token data or user ID is exposed in the response.

## Secure Login Process
The application uses a secure login process:

1. **Client-Side Obfuscation**:
   - User credentials are never sent directly in the request body
   - The Web Crypto API is used to create a secure token on the client
   - A hash of the credentials is sent for validation
   - Timestamp and nonce values prevent replay attacks

2. **Server-Side Validation**:
   - Authentication is performed by the `/api/login` endpoint
   - Only necessary data is returned in the response
   - Credentials are validated against Firebase securely
   - Session tokens include the workId for verification

3. **Token-Based Authentication**:
   - NextAuth uses a token-based approach without exposing credentials
   - The session is established without sending passwords in network requests
   - All sensitive operations use JWT tokens instead of credentials

## Work ID Verification
For secure workId verification, we have two approaches:

### API-Based Verification (Legacy)
The `/api/auth/verify-approver` endpoint provides verification without exposing sensitive user data:
- Takes a workId in the request body
- Verifies it against the logged-in user's record
- Returns a simple success/error response
- Doesn't expose sensitive user data

### Session-Based Verification (Recommended)
A more secure approach used in the truck page and gatepass approver:
- Stores minimal required data in the session token during login
- Uses the session data directly in components that need verification
- No additional API calls needed for basic verification
- No sensitive data transmitted over the network
- Verification happens on the client using securely stored session data

Implementation details:
- The workId is stored in the JWT token at login time
- Components access the token via the `useSessionToken` hook
- The `/api/auth/session-token` endpoint provides only necessary token data
- API-based verification is used as a fallback only when needed

## Authentication Security
- Firebase Admin SDK is used for authentication, bypassing Firebase security rules
- Users collection in Firebase is now protected with proper security rules
- Authentication credentials are never exposed client-side
- Token verification is handled securely on the server side

## Firebase Security Rules
The security rules have been updated to make the users collection private:
- Only authenticated users can access the users collection
- Individual users can only modify their own data
- Password field has additional protection

If you need to make changes to the security rules, use:
```
npm run deploy:rules
```
