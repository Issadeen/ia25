import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { getFirebaseAuth } from '@/lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';

export const useProfileImage = () => {
  const { data: session, status } = useSession();
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    const auth = getFirebaseAuth();
    let unsubscribe: (() => void) | null = null;

    const updateUserImage = (currentUser: User | null) => {
      let finalUrl: string | null = null;

      if (currentUser?.photoURL) {
        finalUrl = currentUser.photoURL;
      } else if (session?.user?.image) {
        finalUrl = session.user.image;
      }

      if (finalUrl) {
        // Add a cache-busting query parameter
        const url = new URL(finalUrl);
        url.searchParams.set('v', Date.now().toString());
        setImageUrl(url.toString());
      } else {
        setImageUrl(null);
      }
    };

    if (auth) {
      // Initial check with currentUser if already available
      if (auth.currentUser) {
        updateUserImage(auth.currentUser);
      }

      // Listen for auth state changes
      unsubscribe = onAuthStateChanged(auth, (user) => {
        updateUserImage(user);
      });
    } else if (session?.user?.image) {
      // Fallback if Firebase auth is not immediately available but session is
      updateUserImage(null); // Pass null to rely on session within updateUserImage
    }

    // Cleanup listener on component unmount
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [session, status]); // Re-run when session or auth status changes

  return imageUrl;
};
