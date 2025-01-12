import { useState, useRef, useCallback, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { useTheme } from "next-themes"
import ReactCrop, { Crop } from 'react-image-crop'
import { Upload, X, Image as ImageIcon } from 'lucide-react'
import 'react-image-crop/dist/ReactCrop.css'

interface ProfilePicModalProps {
  isOpen: boolean
  onClose: () => void
  onUpload: (imageBlob: Blob) => Promise<void>
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export function ProfilePicModal({ isOpen, onClose, onUpload }: ProfilePicModalProps) {
  const { theme } = useTheme()
  const [imageSrc, setImageSrc] = useState<string>('')
  const [crop, setCrop] = useState<Crop>()
  const [completedCrop, setCompletedCrop] = useState<Crop>()
  const imgRef = useRef<HTMLImageElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const defaultCrop: Crop = {
    unit: '%',
    width: 90,
    height: 90,
    x: 5,
    y: 5
  }

  const validateFile = (file: File): boolean => {
    setError(null)
    
    if (file.size > MAX_FILE_SIZE) {
      setError("File size must be less than 5MB")
      return false
    }
    
    if (!file.type.startsWith('image/')) {
      setError("Only image files are allowed")
      return false
    }
    
    return true
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && validateFile(file)) {
      setIsProcessing(true)
      const reader = new FileReader()
      reader.onloadend = () => {
        setImageSrc(reader.result as string)
        setIsProcessing(false)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const file = e.dataTransfer.files[0]
    if (file && validateFile(file)) {
      setIsProcessing(true)
      const reader = new FileReader()
      reader.onloadend = () => {
        setImageSrc(reader.result as string)
        setIsProcessing(false)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    if (crop) return // Don't set crop if it's already set
    const { width, height } = e.currentTarget
    const cropWidth = Math.min(width, height)
    const x = (width - cropWidth) / 2
    const y = (height - cropWidth) / 2
    setCrop({
      unit: 'px',
      width: cropWidth,
      height: cropWidth,
      x,
      y
    })
    setImageDimensions({ width, height })
  }, [crop])

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
      setError('Upload failed. Please try again.')
    } finally {
      setIsUploading(false)
    }
  }, [generateCanvas, onUpload, onClose])

  // Add keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Enter' && !isUploading && completedCrop) handleUpload()
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, isUploading, completedCrop, handleUpload, onClose])

  // Simulate upload progress
  useEffect(() => {
    if (isUploading) {
      const interval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(interval)
            return prev
          }
          return prev + 10
        })
      }, 100)
      return () => clearInterval(interval)
    } else {
      setUploadProgress(0)
    }
  }, [isUploading])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-50 p-4">
      <div className="w-full max-w-md rounded-xl shadow-lg border bg-card">
        <div className="p-6 border-b">
          <h2 className="text-2xl font-semibold text-foreground">Edit Profile Picture</h2>
        </div>
        
        <div className="p-6 space-y-6">
          {error && (
            <div className="bg-destructive/10 text-destructive px-4 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}

          {isProcessing && (
            <div className="text-center py-8">
              <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">Processing image...</p>
            </div>
          )}

          {!imageSrc && (
            <div
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center hover:border-primary/50 transition-colors"
            >
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="hidden"
                id="file-upload"
              />
              <label 
                htmlFor="file-upload" 
                className="cursor-pointer flex flex-col items-center gap-2"
              >
                <Upload className="w-8 h-8 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  Drop an image here or click to upload
                </span>
                <span className="text-xs text-muted-foreground/75">
                  Supports: JPG, PNG, GIF
                </span>
              </label>
            </div>
          )}

          {imageSrc && (
            <div className="relative border rounded-lg overflow-hidden bg-muted/25">
              <ReactCrop
                crop={crop}
                onChange={(newCrop) => setCrop(newCrop)}
                onComplete={(c) => setCompletedCrop(c)}
                aspect={1}
                className="flex items-center justify-center"
                minWidth={100}
                minHeight={100}
              >
                <img
                  ref={imgRef}
                  src={imageSrc}
                  alt="Crop preview"
                  className="max-h-[350px] object-contain"
                  onLoad={handleImageLoad}
                />
              </ReactCrop>
              <Button
                variant="outline"
                size="sm"
                className="absolute top-2 right-2"
                onClick={() => {
                  setImageSrc('')
                  setCrop(undefined)
                  setCompletedCrop(undefined)
                }}
              >
                Change Image
              </Button>
            </div>
          )}

          {imageSrc && imageDimensions && (
            <div className="text-xs text-muted-foreground text-center">
              <ImageIcon className="w-4 h-4 inline mr-1" />
              {imageDimensions.width} x {imageDimensions.height}px
            </div>
          )}

          {isUploading && (
            <div className="space-y-2">
              <Progress value={uploadProgress} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">
                Uploading... {uploadProgress}%
              </p>
            </div>
          )}
        </div>

        <div className="p-6 border-t flex gap-2 justify-end bg-muted/50">
          <Button
            variant="outline"
            onClick={onClose}
            className="w-24"
          >
            Cancel
          </Button>
          <Button
            onClick={handleUpload}
            disabled={isUploading || !completedCrop}
            className="w-24"
          >
            {isUploading ? 'Uploading...' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  )
}

