import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { getFirebaseStorage } from '@/lib/firebase'
import { ref as storageRef, getDownloadURL } from 'firebase/storage'

export function useProfileImage() {
  const { data: session } = useSession()
  const [profilePicUrl, setProfilePicUrl] = useState<string | null>(null)

  useEffect(() => {
    const fetchProfilePic = async () => {
      const storage = getFirebaseStorage();
      const userEmail = session?.user?.email;

      if (!storage || !userEmail) return;

      try {
        const fileName = `profile-pics/${userEmail.replace(/[.@]/g, "_")}.jpg`;
        const imageRef = storageRef(storage, fileName);
        const url = await getDownloadURL(imageRef);
        setProfilePicUrl(url);
      } catch (error) {
        console.log("No existing profile picture found");
        setProfilePicUrl(session?.user?.image || null);
      }
    };

    fetchProfilePic();
  }, [session]);

  return profilePicUrl;
}
