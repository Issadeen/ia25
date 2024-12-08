'use client'

// Update imports to include Firebase
import { useState, useEffect, useRef, useCallback } from 'react'
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { ArrowLeft, Moon, Sun, Save } from "lucide-react"
import { Button } from "components/ui/atoms/button" // Fix import path
import { Card } from "components/ui/atoms/card"
import { Input } from "components/ui/atoms/input"
import { Label } from "components/ui/atoms/label"
import { useToast } from "components/ui/use-toast"
import { database, storage } from "lib/firebase" // Import from lib/firebase instead
import { ref as databaseRef } from 'firebase/database' // Rename database ref
import { ref as storageRef } from 'firebase/storage' // Add storage ref
import { push } from 'firebase/database'
import { Avatar, AvatarFallback, AvatarImage } from "components/ui/avatar"
import Particles from "react-tsparticles"
import { loadSlim } from "tsparticles-slim"
import type { Engine } from "tsparticles-engine"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "components/ui/select"
import { getAuth } from 'firebase/auth'
import { getDownloadURL, ref } from 'firebase/storage'

export default function NewTruckPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const { toast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [lastUploadedImage, setLastUploadedImage] = useState<string | null>(null)
  const [isLoadingProfile, setIsLoadingProfile] = useState(true)

  // Define inputClassName within the component
  const inputClassName = `w-full rounded-md ${
    theme === 'dark'
      ? 'bg-gray-800 border-gray-700 text-gray-100 focus:border-blue-500'
      : 'bg-white border-gray-200 text-gray-900 focus:border-blue-500'
  }`

  // Auth protection
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login")
    }
  }, [status, router])

  const [truck, setTruck] = useState({
    id: '',
    owner: '',
    transporter: '',
    driver: '',
    agoComps: ['', '', ''], // Default to 3 components
    pmsComps: ['', '', ''], // Default to 3 components
  })
  const [addMoreComps, setAddMoreComps] = useState(false)
  const inactivityTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Inactivity handler
  useEffect(() => {
    const handleActivity = () => {
      if (inactivityTimeoutRef.current) {
        clearTimeout(inactivityTimeoutRef.current)
      }
      inactivityTimeoutRef.current = setTimeout(() => {
        router.push('/login')
      }, 7 * 60 * 1000) // 7 minutes
    }

    window.addEventListener('mousemove', handleActivity)
    window.addEventListener('keydown', handleActivity)
    handleActivity()

    return () => {
      window.removeEventListener('mousemove', handleActivity)
      window.removeEventListener('keydown', handleActivity)
      if (inactivityTimeoutRef.current) {
        clearTimeout(inactivityTimeoutRef.current)
      }
    }
  }, [router])

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) return
    setIsSaving(true)
    setIsSubmitting(true) // Add this line

    try {
      const trucksRef = databaseRef(database, 'trucks')

      // Dynamically create formattedTruckData
      const formattedTruckData: any = {
        truck_no: truck.id,
        owner: truck.owner,
        transporter: truck.transporter,
        driver: truck.driver,
        created_at: new Date().toISOString(),
        created_by: session?.user?.email || '',
      };

      // Add AGO components
      truck.agoComps.forEach((comp, index) => {
        formattedTruckData[`ago_comp_${index + 1}`] = parseFloat(comp) || 0;
      });

      // Add PMS components
      truck.pmsComps.forEach((comp, index) => {
        formattedTruckData[`pms_${index + 1}`] = parseFloat(comp) || 0;
      });

      // Calculate totals
      formattedTruckData.ago_total = calculateTotal(truck.agoComps);
      formattedTruckData.pms_total = calculateTotal(truck.pmsComps);

      const result = await push(trucksRef, formattedTruckData);

      if (result.key) {
        toast({
          title: "Success",
          description: "Truck has been added successfully",
        });
        router.push('/dashboard/trucks');
      } else {
        throw new Error('Failed to save truck data');
      }
    } catch (error) {
      console.error('Error saving truck:', error)
      toast({
        title: "Error",
        description: "Failed to add truck. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
      setIsSubmitting(false)
    }
  }

  // Validate form fields
  const validateForm = () => {
    if (!truck.id || !truck.owner || !truck.transporter || !truck.driver) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      })
      return false
    }

    // Validate at least one component in each category
    const hasAgoComp = truck.agoComps.some(comp => parseFloat(comp) > 0)
    const hasPmsComp = truck.pmsComps.some(comp => parseFloat(comp) > 0)

    if (!hasAgoComp || !hasPmsComp) {
      toast({
        title: "Validation Error",
        description: "Please enter at least one component value for both AGO and PMS",
        variant: "destructive",
      })
      return false
    }

    return true
  }

  // Initialize particles
  const particlesInit = useCallback(async (engine: Engine) => {
    await loadSlim(engine)
  }, [])

  // Calculate total components
  const calculateTotal = (comps: string[]) => {
    return comps.reduce((total, comp) => total + (parseFloat(comp) || 0), 0)
  }

  // Handle component input changes
  const handleComponentChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'agoComps' | 'pmsComps',
    index: number
  ) => {
    const value = e.target.value
    setTruck(prev => ({
      ...prev,
      [type]: prev[type].map((comp, i) => i === index ? value : comp)
    }))
  }

  // Handle basic input changes
  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    field: keyof typeof truck
  ) => {
    setTruck(prev => ({
      ...prev,
      [field]: e.target.value
    }))
  }

  // Handle adding more components
  const handleAddMore = () => {
    setAddMoreComps(prev => {
      const newValue = !prev;
      setTruck(current => ({
        ...current,
        agoComps: newValue
          ? [...current.agoComps.slice(0, 3), '', '', ''] // Ensure total of 6 components
          : current.agoComps.slice(0, 3),                 // Reduce to 3 components
        pmsComps: newValue
          ? [...current.pmsComps.slice(0, 3), '', '', '']
          : current.pmsComps.slice(0, 3),
      }));
      return newValue;
    });
  }

  // Fetch profile picture
  function generateProfileImageFilename(email: string): string {
    return email.toLowerCase().replace(/[@.]/g, '_') + '_com.jpg';
  }

  useEffect(() => {
    const fetchImageUrl = async () => {
      const userEmail = session?.user?.email
      if (!userEmail || session?.user?.image) return
  
      try {
        const filename = `${userEmail}.jpg`
        const imageRef = storageRef(storage, `profile-pics/${filename}`)
        const url = await getDownloadURL(imageRef)
        setLastUploadedImage(url)
      } catch (error) {
        console.log('Profile image not found:', error)
      } finally {
        setIsLoadingProfile(false)
      }
    }
  
    fetchImageUrl()
  }, [session?.user?.email, session?.user?.image])

  // Avatar source logic
  const avatarSrc = session?.user?.image || lastUploadedImage || ''

  if (status === "loading") return null

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Update Particles z-index and container */}
      <div className="fixed inset-0 z-0">
        <Particles
          id="tsparticles"
          init={particlesInit}
          options={{
            background: { opacity: 0 },
            particles: {
              number: { value: 50, density: { enable: true, value_area: 800 } },
              color: { value: theme === 'dark' ? "#3b82f680" : "#60a5fa40" },
              shape: { type: "circle" },
              opacity: { value: 0.3, random: false },
              size: { value: 2, random: true },
              links: {
                enable: true,
                distance: 150,
                color: theme === 'dark' ? "#3b82f650" : "#60a5fa30",
                opacity: 0.2,
                width: 1
              },
              move: {
                enable: true,
                speed: 1,
                direction: "none",
                random: false,
                straight: false,
                outModes: "out"
              }
            }
          }}
          className="absolute inset-0"
        />
      </div>

      {/* Add z-index to main content wrapper */}
      <div className={`relative z-10 min-h-screen ${
        theme === 'dark' ? 'bg-gray-900/50 text-gray-100' : 'bg-gray-50/50 text-gray-900'
      }`}>
        <header className={`fixed top-0 left-0 w-full z-20 border-b ${
          theme === 'dark'
            ? 'border-gray-800 bg-gray-900/70'
            : 'border-gray-200 bg-white/70'
        } backdrop-blur-md`}>
          <div className="container mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                onClick={() => router.back()}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <h1 className="text-xl font-semibold">New Truck</h1>
            </div>
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              >
                {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </Button>
              <Avatar>
                <AvatarImage 
                  src={avatarSrc} 
                  alt="Profile"
                  className={isLoadingProfile ? 'animate-pulse' : ''}
                />
                <AvatarFallback>
                  {isLoadingProfile ? (
                    <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                  ) : (
                    session?.user?.email?.[0]?.toUpperCase() || 'U'
                  )}
                </AvatarFallback>
              </Avatar>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-24">
          <Card className={`relative z-10 p-6 ${
            theme === 'dark' 
              ? 'bg-gray-800/95 border-gray-700' 
              : 'bg-white/95 border-gray-200'
          }`}>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Basic Information Section */}
              <div>
                <h2 className="text-xl font-semibold mb-4">Basic Information</h2>
                <div className="grid md:grid-cols-2 gap-4">
                  {/* Update basic input fields */}
                  <div className="space-y-2">
                    <Label htmlFor="id">Truck No</Label>
                    <Input
                      id="id"
                      value={truck.id}
                      onChange={(e) => handleInputChange(e, 'id')}
                      className={inputClassName}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="owner">Owner</Label>
                    <Input
                      id="owner"
                      value={truck.owner}
                      onChange={(e) => handleInputChange(e, 'owner')}
                      required
                      className={inputClassName}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="transporter">Transporter</Label>
                    <Input
                      id="transporter"
                      value={truck.transporter}
                      onChange={(e) => handleInputChange(e, 'transporter')}
                      required
                      className={inputClassName}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="driver">Driver</Label>
                    <Input
                      id="driver"
                      value={truck.driver}
                      onChange={(e) => handleInputChange(e, 'driver')}
                      required
                      className={inputClassName}
                    />
                  </div>
                </div>
              </div>

              {/* AGO Components Section */}
              <div className="border-t border-gray-700 pt-6">
                <h2 className="text-xl font-semibold mb-4">AGO Components</h2>
                <div className="grid md:grid-cols-3 gap-4">
                  {truck.agoComps.map((comp, index) => (
                    <div key={`ago${index}`} className="space-y-2">
                      <Label htmlFor={`ago${index}`}>AGO Comp {index + 1}</Label>
                      <Input
                        id={`ago${index}`}
                        type="number"
                        value={comp}
                        onChange={(e) => handleComponentChange(e, 'agoComps', index)}
                        className={inputClassName}
                        min="0"
                        step="0.01"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* PMS Components Section */}
              <div className="border-t border-gray-700 pt-6">
                <h2 className="text-xl font-semibold mb-4">PMS Components</h2>
                <div className="grid md:grid-cols-3 gap-4">
                  {truck.pmsComps.map((comp, index) => (
                    <div key={`pms${index}`} className="space-y-2">
                      <Label htmlFor={`pms${index}`}>PMS Comp {index + 1}</Label>
                      <Input
                        id={`pms${index}`}
                        type="number"
                        value={comp}
                        onChange={(e) => handleComponentChange(e, 'pmsComps', index)}
                        className={inputClassName}
                        min="0"
                        step="0.01"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Add More Components Checkbox */}
              <div className="border-t border-gray-700 pt-6 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="addMore"
                    checked={addMoreComps}
                    onChange={handleAddMore}
                  />
                  <Label htmlFor="addMore">Add 3 more components</Label>
                </div>

                <div className="flex gap-4 text-sm">
                  <div>AGO Total: {calculateTotal(truck.agoComps)}</div>
                  <div>PMS Total: {calculateTotal(truck.pmsComps)}</div>
                </div>
              </div>

              {/* Submit Button */}
              <Button 
                type="submit" 
                className={`w-full ${
                  theme === 'dark' 
                    ? 'bg-blue-600 hover:bg-blue-700' 
                    : 'bg-blue-500 hover:bg-blue-600'
                } text-white`}
                disabled={isSaving || isSubmitting}
              >
                {isSaving || isSubmitting ? (
                  <div className="flex items-center space-x-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-current" />
                    <span>Saving...</span>
                  </div>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save Truck
                  </>
                )}
              </Button>
            </form>
          </Card>
        </main>
      </div>
    </div>
  )
}