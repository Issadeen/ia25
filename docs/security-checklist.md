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

## Work ID Verification
For secure workId verification, use the `/api/auth/verify-approver` endpoint rather than direct database queries. This endpoint:
- Takes a workId in the request body
- Verifies it against the logged-in user's record
- Returns a simple success/error response
- Doesn't expose sensitive user data

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
