import { useEffect, useState } from 'react';
import { getToken } from 'next-auth/jwt';
import { useSession } from 'next-auth/react';

// This hook allows components to access the JWT token for client-side verification
export function useSessionToken() {
  const { data: session } = useSession();
  const [token, setToken] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchToken = async () => {
      if (!session) {
        setIsLoading(false);
        return;
      }

      try {
        // Use a dedicated API endpoint to get the token securely
        const response = await fetch('/api/auth/session-token');
        if (!response.ok) {
          throw new Error('Failed to fetch token');
        }
        
        const data = await response.json();
        setToken(data.token);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
      } finally {
        setIsLoading(false);
      }
    };

    fetchToken();
  }, [session]);

  return { token, isLoading, error };
}

// Verification utility function
export function verifyWorkId(token: any, inputWorkId: string): boolean {
  if (!token || !token.workId || !inputWorkId) {
    return false;
  }
  
  return token.workId === inputWorkId;
}
