import { useState } from 'react';
import { useSessionToken, verifyWorkId as verifyWorkIdHelper } from './useSessionToken';
import { toast } from '@/components/ui/use-toast';

// This hook provides a consistent way to verify workIds across the application
export function useWorkIdVerification() {
  const { token, isLoading, error } = useSessionToken();
  const [isVerifying, setIsVerifying] = useState(false);

  // This function returns a Promise<boolean> for compatibility with the WorkIdDialog
  const verifyWorkId = async (inputWorkId: string): Promise<boolean> => {
    if (isLoading) {
      toast({
        title: "Loading",
        description: "Please wait while we load your session data",
        variant: "default"
      });
      return false;
    }

    if (error) {
      console.error('Session token error:', error);
      toast({
        title: "Error",
        description: "There was an error verifying your session. Please try logging in again.",
        variant: "destructive"
      });
      return false;
    }

    setIsVerifying(true);
    
    try {
      // Use the helper function from useSessionToken to verify the workId
      const isValid = verifyWorkIdHelper(token, inputWorkId);
      
      if (!isValid) {
        toast({
          title: "Error",
          description: "Invalid Work ID",
          variant: "destructive"
        });
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Work ID verification error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Verification failed",
        variant: "destructive"
      });
      return false;
    } finally {
      setIsVerifying(false);
    }
  };

  return {
    verifyWorkId,
    isLoading,
    isVerifying,
    error
  };
}
