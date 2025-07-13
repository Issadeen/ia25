import { useState, useEffect } from 'react';
import { getFirebaseAuth, getFirebaseStorage } from '@/lib/firebase';
import { getDownloadURL, ref as storageRef } from 'firebase/storage';
import { useSession } from 'next-auth/react';
import { ensureFirebaseAuth } from '@/lib/firebase-auth-helper';

export function useProfileImage() {
  const [profilePicUrl, setProfilePicUrl] = useState<string | null>(null);
  const { data: session } = useSession();
  
  useEffect(() => {
    let isMounted = true;
    
    const fetchProfilePic = async () => {
      try {
        // Try to use the session image first if available
        if (session?.user?.image) {
          setProfilePicUrl(session.user.image);
          return;
        }

        // Wait for Firebase auth to be initialized
        try {
          await ensureFirebaseAuth();
        } catch (error) {
          console.error("Firebase auth initialization failed:", error);
          // Continue anyway - we might have session image
        }
        
        const auth = getFirebaseAuth();
        const currentUser = auth?.currentUser;
        
        if (!currentUser) {
          console.warn("No authenticated user found for profile image");
          return;
        }
        
        // If user has a photoURL in their profile, use that
        if (currentUser.photoURL) {
          if (isMounted) setProfilePicUrl(currentUser.photoURL);
          return;
        }
        
        // Otherwise try to fetch from storage
        const storage = getFirebaseStorage();
        if (!storage) return;
        
        const userId = currentUser.uid;
        const imageRef = storageRef(storage, `profile_pictures/${userId}/profile_pic`);
        
        try {
          const url = await getDownloadURL(imageRef);
          if (isMounted) setProfilePicUrl(url);
        } catch (error) {
          console.log("No custom profile image found in storage");
          // No profile pic found, that's okay
        }
      } catch (error) {
        console.error("Error fetching profile picture:", error);
      }
    };

    if (session) {
      fetchProfilePic();
    }

    return () => {
      isMounted = false;
    };
  }, [session]);

  return profilePicUrl;
}
