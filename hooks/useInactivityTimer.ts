import { useState, useEffect, useCallback, useRef } from 'react';
import { AUTH_CONSTANTS } from '@/lib/constants';

interface UseInactivityTimerProps {
  timeout: number;
  warningTime?: number;
  onTimeout: () => void;
}

export function useInactivityTimer({
  timeout = AUTH_CONSTANTS.INACTIVITY_TIMEOUT,
  warningTime = AUTH_CONSTANTS.WARNING_BEFORE_TIMEOUT,
  onTimeout,
}: UseInactivityTimerProps) {
  const [sessionExpiryWarning, setSessionExpiryWarning] = useState<boolean>(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const warningTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isTimedOut = useRef<boolean>(false);

  const resetInactivityTimer = useCallback(() => {
    if (isTimedOut.current) return; // Don't reset if already timed out

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
    
    setSessionExpiryWarning(false);

    warningTimeoutRef.current = setTimeout(() => {
      if (!isTimedOut.current) {
        setSessionExpiryWarning(true);
      }
    }, timeout - warningTime);

    timeoutRef.current = setTimeout(() => {
      isTimedOut.current = true;
      onTimeout();
    }, timeout);
  }, [timeout, warningTime, onTimeout]);

  useEffect(() => {
    resetInactivityTimer();
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
    };
  }, [resetInactivityTimer]);

  return { sessionExpiryWarning, resetInactivityTimer };
}

