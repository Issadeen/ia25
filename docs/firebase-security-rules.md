# Firebase Security Rules Update

## Summary of Changes

We've updated the Firebase Realtime Database security rules to enhance the security of user data, particularly the sensitive information in the `users` collection. These changes align with the updated authentication flow that now uses the Firebase Admin SDK for authentication instead of the client SDK.

## Key Changes

1. **Users Collection Security**:
   - Changed `.read` access from `true` (public) to `auth != null` (authenticated users only)
   - Added specific password field protection to limit access to sensitive data
   - Maintained the ability for new users to sign up

2. **User Authentication**:
   - The authentication flow now uses the Firebase Admin SDK, which bypasses security rules
   - This means authentication will still work even with the stricter security rules

## Why These Changes Matter

1. **Enhanced Security**: 
   - User data, especially passwords, is now protected from unauthorized access
   - Only authenticated users can read the users collection
   - Individual users can only write to their own data

2. **Preserved Functionality**:
   - User registration still works (new records can be created)
   - Authentication continues to function properly through the Admin SDK
   - Password hashing and upgrading still occurs for plain text passwords

## Deploying the Rules

To deploy the updated security rules to Firebase:

```bash
npm run deploy:rules
```

This will execute the script at `scripts/deploy-rules.js`, which uses the Firebase CLI to deploy the database rules.

## Testing the Changes

After deploying the rules, you should test:

1. **Authentication**: Ensure users can still log in
2. **Registration**: Verify new users can still register
3. **Client Access**: Confirm that unauthenticated clients cannot access user data

## Rollback Plan

If issues arise, you can revert to the previous rules by:

1. Changing the `users` collection rules back to:
```json
"users": {
  ".read": true,
  ".write": "auth != null || !data.exists()",
  ".indexOn": ["email", "workId"],
  "$user_id": {
    ".read": true,
    ".write": "auth != null && (!data.exists() || data.child('email').val() === auth.token.email)",
    ".validate": "newData.hasChildren(['email', 'workId'])"
  }
}
```

2. Re-deploying the rules with `npm run deploy:rules`
