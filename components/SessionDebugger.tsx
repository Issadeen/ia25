"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function SessionDebugger() {
  const { data: session } = useSession();
  const [token, setToken] = useState<any>(null);
  const [workId, setWorkId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    async function fetchToken() {
      setIsLoading(true);
      try {
        const response = await fetch('/api/auth/session-token');
        if (response.ok) {
          const data = await response.json();
          setToken(data.token);
          setWorkId(data.token?.workId || null);
        }
      } catch (error) {
        console.error('Error fetching token:', error);
      } finally {
        setIsLoading(false);
      }
    }

    if (session) {
      fetchToken();
    }
  }, [session]);

  return (
    <Card className="w-full max-w-md mx-auto mt-8">
      <CardHeader>
        <CardTitle className="text-xl">Session Debugger</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h3 className="font-medium mb-2">Session Status:</h3>
          <pre className="bg-gray-100 dark:bg-gray-800 p-2 rounded text-sm">
            {JSON.stringify(session ? 'Authenticated' : 'Not Authenticated', null, 2)}
          </pre>
        </div>

        <div>
          <h3 className="font-medium mb-2">User Information:</h3>
          <pre className="bg-gray-100 dark:bg-gray-800 p-2 rounded text-sm">
            {JSON.stringify(session?.user || 'No user', null, 2)}
          </pre>
        </div>

        <div>
          <h3 className="font-medium mb-2">Token Information:</h3>
          <pre className="bg-gray-100 dark:bg-gray-800 p-2 rounded text-sm">
            {isLoading ? 'Loading...' : JSON.stringify(token || 'No token', null, 2)}
          </pre>
        </div>

        <div>
          <h3 className="font-medium mb-2">WorkId:</h3>
          <pre className="bg-gray-100 dark:bg-gray-800 p-2 rounded text-sm">
            {isLoading ? 'Loading...' : JSON.stringify(workId || 'No workId', null, 2)}
          </pre>
        </div>

        <Button 
          onClick={() => window.location.reload()}
          className="w-full"
        >
          Refresh Page
        </Button>
      </CardContent>
    </Card>
  );
}
