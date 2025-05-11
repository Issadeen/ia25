import { useTheme } from "next-themes"
import { LogOut, Moon, Sun } from 'lucide-react' // Removed Pencil import
import { Button } from "@/components/ui/button"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { motion } from 'framer-motion'
import { signOut } from "next-auth/react"
import { useState } from "react"
import { ViewProfileModal } from "./ViewProfileModal"

interface DashboardHeaderProps {
  avatarSrc: string
  isLoadingProfile: boolean
  onEditProfilePic: () => void
}

export function DashboardHeader({ avatarSrc, isLoadingProfile, onEditProfilePic }: DashboardHeaderProps) {
  const { theme, setTheme } = useTheme()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [isViewingProfile, setIsViewingProfile] = useState(false)

  const handleSignOut = async () => {
    setIsLoggingOut(true)
    try {
      await signOut({ 
        redirect: true,
        callbackUrl: '/login'
      })
    } catch (error) {
      console.error('Logout error:', error)
      window.location.href = '/login'
    }
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center">
        <div className="flex-1">
          <h1 className="text-lg sm:text-2xl font-bold bg-gradient-to-r from-emerald-700 via-teal-500 to-blue-500 bg-clip-text text-transparent tracking-tight hover:opacity-80 transition-opacity">
            Issaerium-23
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="text-muted-foreground hover:text-foreground"
          >
            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSignOut}
            disabled={isLoggingOut}
            className="text-muted-foreground hover:text-foreground"
          >
            {isLoggingOut ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-current" />
            ) : (
              <LogOut className="h-5 w-5" />
            )}
          </Button>
          <motion.div 
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="cursor-pointer relative group"
            onClick={() => setIsViewingProfile(true)} // Moved onClick to the motion.div
          >
            <Avatar>
              <AvatarImage 
                src={avatarSrc} 
                alt="Profile avatar"
                className={isLoadingProfile ? 'animate-pulse' : ''}
              />
              <AvatarFallback>
                {isLoadingProfile ? (
                  <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                ) : 'U'}
              </AvatarFallback>
            </Avatar>
            
            <div className="hidden group-hover:block absolute bottom-full mb-2 left-1/2 -translate-x-1/2 whitespace-nowrap bg-popover text-popover-foreground text-xs px-2 py-1 rounded shadow">
              Click to view
            </div>
          </motion.div>

          <ViewProfileModal
            isOpen={isViewingProfile}
            onClose={() => setIsViewingProfile(false)}
            imageUrl={avatarSrc}
            onEdit={onEditProfilePic}
          />
        </div>
      </div>
    </header>
  )
}

