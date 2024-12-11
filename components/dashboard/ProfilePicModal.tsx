import { useState, useRef, useCallback } from 'react'
import { Button } from "@/components/ui/button"
import { useTheme } from "next-themes"
import ReactCrop, { Crop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'

interface ProfilePicModalProps {
  isOpen: boolean
  onClose: () => void
  onUpload: (imageBlob: Blob) => Promise<void>
}

export function ProfilePicModal({ isOpen, onClose, onUpload }: ProfilePicModalProps) {
  const { theme } = useTheme()
  const [imageSrc, setImageSrc] = useState<string>('')
  const [crop, setCrop] = useState<Crop>()
  const [completedCrop, setCompletedCrop] = useState<Crop>()
  const imgRef = useRef<HTMLImageElement>(null)
  const [isUploading, setIsUploading] = useState(false)

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setImageSrc(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const generateCanvas = useCallback(() => {
    if (!completedCrop || !imgRef.current) return null

    const image = imgRef.current
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    if (!ctx) return null

    const scaleX = image.naturalWidth / image.width
    const scaleY = image.naturalHeight / image.height

    canvas.width = completedCrop.width
    canvas.height = completedCrop.height

    ctx.drawImage(
      image,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0,
      0,
      completedCrop.width,
      completedCrop.height
    )

    return canvas
  }, [completedCrop])

  const handleUpload = useCallback(async () => {
    const canvas = generateCanvas()
    if (!canvas) return

    setIsUploading(true)
    try {
      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob)
        }, 'image/jpeg')
      })
      await onUpload(blob)
      onClose()
    } catch (error) {
      console.error('Upload failed:', error)
    } finally {
      setIsUploading(false)
    }
  }, [generateCanvas, onUpload, onClose])

  if (!isOpen) return null

  return (
    <div className={`fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-50 p-4 ${
      theme === 'dark' ? 'text-gray-100' : 'text-gray-900'
    }`}>
      <div className={`w-full max-w-md max-h-[80vh] rounded-lg shadow-lg ${
        theme === 'dark' ? 'bg-gray-800' : 'bg-white'
      }`}>
        <div className="p-4 border-b">
          <h2 className="text-xl font-bold">Edit Profile Picture</h2>
        </div>
        <div className="p-4 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(80vh - 130px)' }}>
          <input 
            type="file" 
            accept="image/*" 
            onChange={handleImageChange}
            className="w-full"
          />
          {imageSrc && (
            <ReactCrop
              crop={crop}
              onChange={(newCrop) => setCrop(newCrop)}
              onComplete={(c) => setCompletedCrop(c)}
              aspect={1}
            >
              <img 
                ref={imgRef}
                src={imageSrc} 
                alt="Crop preview"
                style={{ maxHeight: '50vh', maxWidth: '100%' }}
              />
            </ReactCrop>
          )}
        </div>
        <div className="p-4 border-t">
          <Button 
            onClick={handleUpload} 
            disabled={isUploading || !completedCrop} 
            className="w-full"
          >
            {isUploading ? 'Uploading...' : 'Upload Picture'}
          </Button>
          <Button 
            onClick={onClose}
            variant="outline" 
            className="w-full mt-2"
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}

