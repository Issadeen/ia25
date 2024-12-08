import { useInactivityTimer } from 'hooks/useInactivityTimer';

interface AuthWrapperProps {
  children: React.ReactNode;
}

export function AuthWrapper({ children }: AuthWrapperProps) {
  useInactivityTimer(7 * 60 * 1000); // 7 minutes in milliseconds

  return <>{children}</>;
}
