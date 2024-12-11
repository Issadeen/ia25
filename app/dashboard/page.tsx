"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { useTheme } from "next-themes";
import { toast } from "@/components/ui/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { auth, storage } from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { updateProfile, User as FirebaseUser } from "firebase/auth";
import {
  GoogleAuthProvider,
  signInWithCredential,
  signInWithCustomToken,
} from "firebase/auth";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { DashboardContent } from "@/components/dashboard/DashboardContent";
import { ProfilePicModal } from "@/components/dashboard/ProfilePicModal";
import { useInactivityTimer } from "@/hooks/useInactivityTimer";
import { ParticlesBackground } from "@/components/Particles";
import { AUTH_CONSTANTS } from "@/lib/constants";

// Remove this line since we're using the constant now
// const INACTIVITY_TIMEOUT = 7 * 60 * 1000; // 7 minutes in milliseconds

declare module "next-auth" {
  interface Session {
    accessToken?: string;
  }
}

export default function DashboardPage() {
  const { data: session, status, update } = useSession();
  const accessToken = session?.user?.accessToken || '';
  const router = useRouter();
  const { theme } = useTheme();
  const [isEditingProfilePic, setIsEditingProfilePic] = useState(false);
  const [profilePicUrl, setProfilePicUrl] = useState<string | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [lastLogin, setLastLogin] = useState<string | null>(null);
  const [profileUpdated, setProfileUpdated] = useState(false);

  const { sessionExpiryWarning, resetInactivityTimer } = useInactivityTimer({
    timeout: AUTH_CONSTANTS.INACTIVITY_TIMEOUT,
    warningTime: AUTH_CONSTANTS.WARNING_BEFORE_TIMEOUT,
    onTimeout: async () => {
      try {
        localStorage.clear();
        sessionStorage.clear();
        await signOut({ 
          redirect: true,
          callbackUrl: '/login'
        });
      } catch (error) {
        console.error('Logout error:', error);
        window.location.href = '/login';
      }
    },
  });

  useEffect(() => {
    const handleActivity = () => resetInactivityTimer();
    
    if (status === "authenticated") {
      setLastLogin(new Date().toLocaleString());
      
      window.addEventListener('mousemove', handleActivity);
      window.addEventListener('keydown', handleActivity);
      window.addEventListener('click', handleActivity);
      window.addEventListener('scroll', handleActivity);
      window.addEventListener('touchstart', handleActivity);

      return () => {
        window.removeEventListener('mousemove', handleActivity);
        window.removeEventListener('keydown', handleActivity);
        window.removeEventListener('click', handleActivity);
        window.removeEventListener('scroll', handleActivity);
        window.removeEventListener('touchstart', handleActivity);
      };
    }
  }, [status, resetInactivityTimer]);

  useEffect(() => {
    const initFirebase = async () => {
      if (status !== "authenticated" || auth.currentUser) {
        return;
      }

      try {
        const response = await fetch("/api/auth/firebase-token");
        if (!response.ok) {
          throw new Error('Failed to fetch Firebase token');
        }
        
        const { customToken } = await response.json();
        await signInWithCustomToken(auth, customToken);
      } catch (error) {
        console.error("Firebase Auth Error:", error);
        toast({
          title: "Authentication Error",
          description: "Please try logging in again",
          variant: "destructive",
        });
      }
    };

    initFirebase();
  }, [status, toast]);

  useEffect(() => {
    const fetchProfilePic = async () => {
      try {
        const currentUser = auth.currentUser as FirebaseUser | null;

        if (!currentUser) return;

        if (currentUser.photoURL) {
          setProfilePicUrl(currentUser.photoURL);
        } else if (currentUser.email) {
          const fileName = `profile-pics/${currentUser.email.replace(
            /[.@]/g,
            "_"
          )}.jpg`;
          const imageRef = ref(storage, fileName);

          try {
            const url = await getDownloadURL(imageRef);
            setProfilePicUrl(url);
            await updateProfile(currentUser, { photoURL: url });
          } catch (error) {
            console.log("No existing profile picture found");
          }
        }
      } catch (error) {
        console.error("Error fetching profile picture:", error);
      } finally {
        setIsLoadingProfile(false);
        setProfileUpdated(false);
      }
    };

    if (auth.currentUser || profileUpdated) {
      fetchProfilePic();
    }
  }, [auth.currentUser, profileUpdated]);

  const handleUploadImage = useCallback(
    async (imageBlob: Blob) => {
      if (!auth.currentUser) {
        toast({
          title: "Error",
          description: "You must be logged in to upload images",
          variant: "destructive",
        });
        return;
      }

      try {
        const fileName = `profile-pics/${auth.currentUser.email?.replace(
          /[.@]/g,
          "_"
        )}.jpg`;
        const imageRef = ref(storage, fileName);

        const metadata = {
          contentType: "image/jpeg",
          customMetadata: {
            userEmail: auth.currentUser.email || "unknown",
          },
        };

        const uploadResult = await uploadBytes(imageRef, imageBlob, metadata);
        const downloadURL = await getDownloadURL(imageRef);

        if (auth.currentUser) {
          await updateProfile(auth.currentUser, {
            photoURL: downloadURL,
          });
        }

        await update();
        setProfileUpdated(true);

        toast({
          title: "Success",
          description: "Profile picture updated successfully",
        });
      } catch (error) {
        console.error("handleUploadImage error:", error);
        toast({
          title: "Upload Failed",
          description:
            error instanceof Error
              ? `Error: ${error.message}`
              : "Failed to upload image",
          variant: "destructive",
        });
      }
    },
    [toast, update]
  );

  if (status === "loading") return null;

  return (
    <div className="relative min-h-screen">
      <ParticlesBackground />
      <DashboardHeader
        avatarSrc={profilePicUrl || session?.user?.image || ""}
        isLoadingProfile={isLoadingProfile}
        onEditProfilePic={() => setIsEditingProfilePic(true)}
      />

      <main className="container mx-auto px-4 pt-16">
        <DashboardContent
          userName={session?.user?.name || session?.user?.email || "User"}
          lastLogin={lastLogin}
        />
      </main>

      <AnimatePresence>
        {sessionExpiryWarning && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-20 right-4 z-50 bg-yellow-500/90 text-white px-4 py-2 rounded-md shadow-lg"
          >
            Session expiring in less than 1 minute. Move your mouse or press any
            key to stay logged in.
          </motion.div>
        )}
      </AnimatePresence>

      <ProfilePicModal
        isOpen={isEditingProfilePic}
        onClose={() => setIsEditingProfilePic(false)}
        onUpload={handleUploadImage}
      />
    </div>
  );
}

