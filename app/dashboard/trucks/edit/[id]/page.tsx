'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useToast } from '@/components/ui/use-toast'
import { ArrowLeft, Moon, Sun } from 'lucide-react'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ref as databaseRef, get, update } from 'firebase/database'
import { database, storage } from '@/lib/firebase'
import { Label } from "@/components/ui/label"
import { ref as storageRef, getDownloadURL } from 'firebase/storage'
import { Input } from "@/components/ui/input"  // Add this import

interface TruckDetail {
  truck_no: string;
  driver: string;
  transporter: string;
  ago_comp_1: string;
  ago_comp_2: string;
  ago_comp_3: string;
  ago_comp_4: string;
  ago_comp_5?: string;
  ago_comp_6?: string;
  ago_comp_7?: string;
  pms_1: string;
  pms_2: string;
  pms_3: string;
  pms_4: string;
  pms_5?: string;
  pms_6?: string;
  pms_7?: string;
}

function generateProfileImageFilename(email: string): string {
  return email.toLowerCase().replace(/[@.]/g, '_') + '_com.jpg';
}

export default function EditTruck() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const { theme, setTheme } = useTheme()
  const { toast } = useToast()
  const [truckData, setTruckData] = useState<TruckDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUploadedImage, setLastUploadedImage] = useState<string | null>(null)
  const [isVerified, setIsVerified] = useState(false)
  const [verifying, setVerifying] = useState(true)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Update verification effect to include 'mounted' and ensure it runs after mount
  useEffect(() => {
    if (!mounted) return; // Ensure the component is mounted

    // Wait until session is loaded
    if (status === 'loading') return

    // Verify that user is authenticated
    if (status !== 'authenticated' || !session?.user?.email) {
      router.push('/login')
      return
    }

    // Check sessionStorage for verification data
    const editVerified = sessionStorage.getItem('editVerified')
    const verifiedEmail = sessionStorage.getItem('editVerifiedEmail')
    const editVerifiedTruck = sessionStorage.getItem('editVerifiedTruck')

    if (
      editVerified === 'true' &&
      verifiedEmail === session.user.email.toLowerCase() && // Ensure case consistency
      editVerifiedTruck === params.id
    ) {
      setIsVerified(true)
      setVerifying(false)
    } else {
      toast({
        title: 'Access Denied',
        description: 'You are not authorized to edit this truck',
      })
      router.push('/dashboard/trucks')
    }
  }, [mounted, status, session, router, params.id, toast])

  // Fetch truck data once verified
  useEffect(() => {
    if (isVerified && params.id) {
      // Fetch the truck data from Firebase
      const truckRef = databaseRef(database, `trucks/${params.id}`) // Changed ref to databaseRef
      get(truckRef).then((snapshot) => {
        if (snapshot.exists()) {
          setTruckData(snapshot.val() as TruckDetail)
        } else {
          toast({
            title: 'Error',
            description: 'Truck not found',
            variant: 'destructive',
          })
          router.push('/dashboard/trucks')
        }
        setLoading(false)
      })
    }
  }, [isVerified, params.id, router, toast])

  useEffect(() => {
    const fetchImageUrl = async () => {
      if (session?.user?.email && !session?.user?.image) {
        const path = generateProfileImageFilename(session.user.email); // Define `path` outside `try`
        try {
          const url = await getDownloadURL(storageRef(storage, `profile-pics/${path}`)); // Use `storageRef` from 'firebase/storage'
          if (url) {
            setLastUploadedImage(url);
          }
        } catch {
          console.log('No image at path:', `profile-pics/${path}`);
        }
      }
    };
    fetchImageUrl();
  }, [session?.user?.email, session?.user?.image]);

  // Remove clearing sessionStorage on before unload to preserve verification
  useEffect(() => {
    // Remove the handleBeforeUnload effect
    // ...existing code...
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!truckData || !params.id || !isVerified) return

    try {
      await update(databaseRef(database, `trucks/${params.id}`), truckData) // Changed ref to databaseRef
      toast({
        title: "Success",
        description: "Truck details updated successfully",
      })
      router.push('/dashboard/trucks')
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update truck details",
        variant: "destructive"
      })
    }
  }

  const handleInputChange = (field: keyof TruckDetail, value: string) => {
    if (truckData) {
      setTruckData({ ...truckData, [field]: value })
    }
  }

  // Update loading and verification check
  if (loading || verifying || !mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-900">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Loading...</h2>
          <p className="text-sm text-gray-500">Please wait while we verify your access</p>
        </div>
      </div>
    )
  }

  // Only render the main content if verified and mounted
  if (!isVerified) {
    return null
  }

  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'bg-gray-900 text-gray-100' : 'bg-gray-50 text-gray-900'}`}>
      <header className={`fixed top-0 left-0 w-full z-10 border-b backdrop-blur-md ${
        theme === 'dark' ? 'border-gray-800 bg-gray-900/70' : 'border-gray-200 bg-white/70'
      }`}>
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => router.push('/dashboard/trucks')}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-semibold">Edit Truck</h1>
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
              <AvatarImage src={session?.user?.image || lastUploadedImage || ''} />
              <AvatarFallback>{session?.user?.email?.[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 pt-24">
        <Card className={`max-w-2xl mx-auto ${
          theme === 'dark' ? 'bg-gray-800' : 'bg-white'
        }`}>
          <CardHeader>
            <CardTitle>Edit Truck Details</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="truck_no">Truck Number</Label>
                <Input
                  id="truck_no"
                  value={truckData?.truck_no || ''}
                  onChange={(e) => handleInputChange('truck_no', e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="driver">Driver</Label>
                <Input
                  id="driver"
                  value={truckData?.driver || ''}
                  onChange={(e) => handleInputChange('driver', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="transporter">Transporter</Label>
                <Input
                  id="transporter"
                  value={truckData?.transporter || ''}
                  onChange={(e) => handleInputChange('transporter', e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>AGO Components</Label>
                  {[1, 2, 3, 4, 5, 6, 7].map((num) => (
                    <Input
                      key={`ago_${num}`}
                      type="number"
                      placeholder={`AGO ${num}`}
                      value={truckData?.[`ago_comp_${num}` as keyof TruckDetail] || ''}
                      onChange={(e) => handleInputChange(`ago_comp_${num}` as keyof TruckDetail, e.target.value)}
                    />
                  ))}
                </div>

                <div className="space-y-2">
                  <Label>PMS Components</Label>
                  {[1, 2, 3, 4, 5, 6, 7].map((num) => (
                    <Input
                      key={`pms_${num}`}
                      type="number"
                      placeholder={`PMS ${num}`}
                      value={truckData?.[`pms_${num}` as keyof TruckDetail] || ''}
                      onChange={(e) => handleInputChange(`pms_${num}` as keyof TruckDetail, e.target.value)}
                    />
                  ))}
                </div>
              </div>

              <div className="flex justify-end space-x-4">
                <Button type="button" variant="outline" onClick={() => router.push('/dashboard/trucks')}>
                  Cancel
                </Button>
                <Button type="submit">
                  Save Changes
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
