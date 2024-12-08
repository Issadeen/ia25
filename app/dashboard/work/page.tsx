'use client'

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { 
  LogOut, 
  ArrowLeft,
  FileText,
  Receipt,
  BarChart,
  ChevronRight,
  Plus,
  FileSearch,
  FileSpreadsheet,
  PieChart,
  Moon,
  Sun
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "components/ui/avatar"
import { motion, AnimatePresence } from 'framer-motion'
import { auth, storage } from "lib/firebase"
import { getDownloadURL, ref } from "firebase/storage"

interface WorkCardProps {
  title: string;
  mainDescription: string;
  links: Array<{
    icon: React.ComponentType<{ className?: string }>;
    description: string;
    href: string;
  }>;
}

const WorkCard = ({ title, mainDescription, links }: WorkCardProps) => {
  const { theme } = useTheme()
  const router = useRouter()

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      className="h-full"
    >
      <Card className={`h-full ${
        theme === 'dark' 
          ? 'bg-gradient-to-br from-gray-800 to-gray-900 border-gray-700' 
          : 'bg-gradient-to-br from-white to-gray-100 border-gray-200'
      }`}>
        <CardHeader>
          <CardTitle className={`text-xl font-semibold ${
            theme === 'dark' ? 'text-gray-200' : 'text-gray-800'
          }`}>{title}</CardTitle>
          <CardDescription className={
            theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
          }>{mainDescription}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {links.map((link, index) => (
            <motion.div
              key={index}
              whileHover={{ x: 5 }}
              onClick={() => router.push(link.href)}
              className={`flex items-center justify-between p-3 rounded-lg cursor-pointer ${
                theme === 'dark' 
                  ? 'hover:bg-gray-700/50' 
                  : 'hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`rounded-full p-2 ${
                  theme === 'dark' 
                    ? 'bg-blue-500/20' 
                    : 'bg-blue-100'
                }`}>
                  <link.icon className="h-4 w-4 text-blue-500" />
                </div>
                <span className={
                  theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                }>{link.description}</span>
              </div>
              <ChevronRight className="h-4 w-4 text-gray-500" />
            </motion.div>
          ))}
        </CardContent>
      </Card>
    </motion.div>
  )
}

export default function WorkDetailsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [lastUploadedImage, setLastUploadedImage] = useState<string | null>(null)

  // Replace the profile image fetch effect with the simplified version
  useEffect(() => {
    const fetchImageUrl = async () => {
      const userEmail = session?.user?.email
      if (!userEmail || session?.user?.image) return

      try {
        const filename = `${userEmail}.jpg`
        const imageRef = ref(storage, `profile-pics/${filename}`)
        const url = await getDownloadURL(imageRef)
        setLastUploadedImage(url)
      } catch (error) {
        console.log('Profile image not found:', error)
      }
    }

    fetchImageUrl()
  }, [session?.user?.email, session?.user?.image])

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login")
    }
  }, [status, router])

  if (!mounted || status === "loading") return null

  const cards = [
    {
      title: "Entry Details",
      mainDescription: "View and manage Entries.",
      links: [
        {
          icon: Plus,
          description: "Add Entries",
          href: "/dashboard/work/entries/new"
        },
        {
          icon: FileSearch,
          description: "View and Manage Entries",
          href: "/dashboard/work/entries"
        },
        {
          icon: FileText,
          description: "View and Manage Orders",
          href: "/dashboard/work/orders"
        }
      ]
    },
    {
      title: "Invoices",
      mainDescription: "View and manage Invoices & Expenses.",
      links: [
        {
          icon: Receipt,
          description: "Add Invoices",
          href: "/dashboard/work/invoices/new"
        },
        {
          icon: FileSpreadsheet,
          description: "View Invoices",
          href: "/dashboard/work/invoices"
        }
      ]
    },
    {
      title: "Reports",
      mainDescription: "View and generate reports.",
      links: [
        {
          icon: PieChart,
          description: "View Expenses Tracker",
          href: "/dashboard/work/reports"
        },
        {
          icon: BarChart,
          description: "Generate Reports",
          href: "/dashboard/work/reports/generate"
        }
      ]
    }
  ]

  // Update the avatar source in the header
  const avatarSrc = session?.user?.image || lastUploadedImage || ''

  return (
    <div className={`min-h-screen ${
      theme === 'dark' ? 'bg-gray-900 text-gray-100' : 'bg-gray-50 text-gray-900'
    }`}>
      <header className={`fixed top-0 left-0 right-0 z-50 border-b ${
        theme === 'dark' 
          ? 'bg-gray-900/70 border-gray-800' 
          : 'bg-white/70 border-gray-200'
      } backdrop-blur-md`}>
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push('/dashboard')}
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-semibold">Work Details</h1>
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
            <Avatar>
              <AvatarImage src={avatarSrc} />
              <AvatarFallback>
                {session?.user?.email?.[0]?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 pt-24 pb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {cards.map((card, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <WorkCard {...card} />
            </motion.div>
          ))}
        </div>
      </main>
    </div>
  )
}