# TODO List

## Security Improvements

### Session-Based Verification Implementation
- [x] Create `useSessionToken` hook for client-side token access
- [x] Create `/api/auth/session-token` endpoint for secure token access
- [x] Update `lib/auth.ts` to include workId in JWT token
- [x] Implement session-based verification in gatepass approvals page
- [x] Update security checklist documentation
- [x] Implement secure login flow that doesn't expose credentials in network requests
- [ ] Update work entries page to use session-based verification
- [ ] Update work owner page to use session-based verification 
- [ ] Review any other pages still using API-based verification

### Additional Security Enhancements
- [x] Secure login credentials by using a two-step authentication process
- [ ] Add rate limiting to verification endpoints to prevent brute force attacks
- [ ] Review error handling in session token access to prevent information leakage
- [ ] Consider adding request IP logging for sensitive operations
- [ ] Update unit tests to cover session-based verification
