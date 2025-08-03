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
        
        // Try using the user's email first (which matches your storage structure)
        if (currentUser.email) {
          try {
            const emailRef = storageRef(storage, `profile_pictures/${currentUser.email}/profile_pic`);
            const url = await getDownloadURL(emailRef);
            if (isMounted) setProfilePicUrl(url);
            return;
          } catch (emailError) {
            console.log("No profile image found with email path, trying UID");
          }
        }
        
        // Fall back to using UID if email approach fails
        const userId = currentUser.uid;
        const imageRef = storageRef(storage, `profile_pictures/${userId}/profile_pic`);
        
        try {
          const url = await getDownloadURL(imageRef);
          if (isMounted) setProfilePicUrl(url);
        } catch (error) {
          // Try one more approach - using the session email if available
          if (session?.user?.email) {
            try {
              const sessionEmailRef = storageRef(storage, `profile_pictures/${session.user.email}/profile_pic`);
              const sessionUrl = await getDownloadURL(sessionEmailRef);
              if (isMounted) setProfilePicUrl(sessionUrl);
              return;
            } catch (sessionError) {
              console.log("No profile image found with any method");
            }
          }
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
