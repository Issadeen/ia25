import { useEffect, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export function useInactivityTimer(inactivityTime: number) {
  const { data: session } = useSession();
  const router = useRouter();
  const timer = useRef<NodeJS.Timeout | null>(null);

  const resetTimer = () => {
    if (timer.current) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(() => {
      if (session) {
        signOut({ redirect: false });
        router.push('/login');
      }
    }, inactivityTime);
  };

  useEffect(() => {
    if (session) {
      resetTimer();
      window.addEventListener('mousemove', resetTimer);
      window.addEventListener('keypress', resetTimer);

      return () => {
        if (timer.current) {
          clearTimeout(timer.current);
        }
        window.removeEventListener('mousemove', resetTimer);
        window.removeEventListener('keypress', resetTimer);
      };
    }
  }, [session, inactivityTime]);
}
