import { useInactivityTimer } from '@/hooks/useInactivityTimer';

interface AuthWrapperProps {
  children: React.ReactNode;
}

export function AuthWrapper({ children }: AuthWrapperProps) {
  useInactivityTimer({ timeout: 7 * 60 * 1000, onTimeout: () => { /* handle timeout */ } }); // 7 minutes in milliseconds

  return <>{children}</>;
}

