"use client";

import { getFirebaseAuth, getFirebaseStorage } from "@/lib/firebase";
import { ref, getDownloadURL, uploadBytes } from "firebase/storage";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback, useRef } from "react";
import { useTheme } from "next-themes";
import { toast } from "@/components/ui/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { updateProfile, signInWithCustomToken } from "firebase/auth";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { DashboardContent } from "@/components/dashboard/DashboardContent";
import { ProfilePicModal } from "@/components/dashboard/ProfilePicModal";
import { useInactivityTimer } from "@/hooks/useInactivityTimer";
import { ParticlesBackground } from "@/components/Particles";
import { AUTH_CONSTANTS } from "@/lib/constants";
import { useProfileImage } from "@/hooks/useProfileImage";
import { SessionDebugger } from "@/components/SessionDebugger";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
  }
}

export default function DashboardPage() {
  const { data: session, status, update: updateSession } = useSession();
  const router = useRouter();
  const { theme } = useTheme();
  const [isEditingProfilePic, setIsEditingProfilePic] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [lastLogin, setLastLogin] = useState<string | null>(null);
  const [profileUpdated, setProfileUpdated] = useState(false);
  const profilePicUrl = useProfileImage();

  const firebaseInitialized = useRef(false);
  const retryAttempts = useRef(0);
  const maxRetries = 3;

  const { sessionExpiryWarning, resetInactivityTimer } = useInactivityTimer({
    timeout: AUTH_CONSTANTS.INACTIVITY_TIMEOUT,
    warningTime: AUTH_CONSTANTS.WARNING_BEFORE_TIMEOUT,
    onTimeout: async () => {
      try {
        localStorage.clear();
        sessionStorage.clear();
        await signOut({
          redirect: true,
          callbackUrl: "/login",
        });
      } catch (error) {
        console.error("Logout error:", error);
        window.location.href = "/login";
      }
    },
  });

  useEffect(() => {
    const handleActivity = () => resetInactivityTimer();

    if (status === "authenticated") {
      setLastLogin(new Date().toLocaleString());

      window.addEventListener("mousemove", handleActivity);
      window.addEventListener("keydown", handleActivity);
      window.addEventListener("click", handleActivity);
      window.addEventListener("scroll", handleActivity);
      window.addEventListener("touchstart", handleActivity);

      return () => {
        window.removeEventListener("mousemove", handleActivity);
        window.removeEventListener("keydown", handleActivity);
        window.removeEventListener("click", handleActivity);
        window.removeEventListener("scroll", handleActivity);
        window.removeEventListener("touchstart", handleActivity);
      };
    }
  }, [status, resetInactivityTimer]);

  useEffect(() => {
    const initFirebase = async () => {
      if (status !== "authenticated" || firebaseInitialized.current) {
        return;
      }

      const auth = getFirebaseAuth();
      if (auth?.currentUser) {
        firebaseInitialized.current = true;
        setIsLoadingProfile(false);
        return;
      }

      try {
        const response = await fetch("/api/auth/firebase-token");
        if (!response.ok) {
          throw new Error(`Failed to fetch Firebase token: ${response.status}`);
        }

        const { customToken } = await response.json();

        if (!auth) {
          throw new Error("Firebase auth is not initialized");
        }

        await signInWithCustomToken(auth, customToken);
        console.log("Firebase auth initialized successfully");
        firebaseInitialized.current = true;
        setIsLoadingProfile(false);
      } catch (error) {
        console.error("Firebase Auth Error:", error);

        if (retryAttempts.current >= maxRetries) {
          toast({
            title: "Authentication Notice",
            description: "Session is active, but some features may be limited. Try refreshing the page if needed.",
            variant: "default",
          });
        } else {
          retryAttempts.current += 1;
          const delay = Math.min(1000 * Math.pow(2, retryAttempts.current), 8000);
          setTimeout(initFirebase, delay);
        }
      }
    };

    initFirebase();
  }, [status, toast]);

  const handleUploadImage = useCallback(
    async (imageBlob: Blob) => {
      const auth = getFirebaseAuth();
      const storage = getFirebaseStorage();

      if (!auth || !auth.currentUser) {
        toast({
          title: "Error",
          description: "You must be logged in to upload images",
          variant: "destructive",
        });
        return;
      }

      const userId = auth.currentUser.uid;
      const fileName = `profile_pictures/${userId}/profile_pic`;
      const imageRef = ref(storage, fileName);

      try {
        const metadata = {
          contentType: "image/jpeg",
        };

        await uploadBytes(imageRef, imageBlob, metadata);
        const downloadURL = await getDownloadURL(imageRef);

        await updateProfile(auth.currentUser, {
          photoURL: downloadURL,
        });

        const newSessionData = await updateSession();

        if (!newSessionData) {
          console.error("NextAuth session update returned no data.");
          throw new Error("Failed to refresh user session data after image upload.");
        }

        if (newSessionData.user?.image !== downloadURL) {
          console.warn(
            `Session image URL (${newSessionData.user?.image}) does not match new photoURL (${downloadURL}). There might be a delay or issue in the session callback.`
          );
        }

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
              : "Failed to upload image or update profile",
          variant: "destructive",
        });
      }
    },
    [updateSession, toast]
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
          userName={session?.user?.name || "User"}
          lastLogin={lastLogin}
        />
        
        {/* Debug session information */}
        <div className="mt-8">
          <SessionDebugger />
        </div>
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
