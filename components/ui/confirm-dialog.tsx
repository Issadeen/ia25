import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./dialog"
import { Button } from "./button"

interface ConfirmDialogOptions {
  title: string
  description: string
  confirmText?: string
  cancelText?: string
}

export const confirmDialog = async (options: ConfirmDialogOptions): Promise<boolean> => {
  return new Promise((resolve) => {
    const dialog = document.createElement('div')
    dialog.id = 'confirm-dialog'
    document.body.appendChild(dialog)

    const cleanup = () => {
      document.body.removeChild(dialog)
    }

    const ConfirmationDialog = () => {
      const [open, setOpen] = useState(true)

      const handleConfirm = () => {
        setOpen(false)
        cleanup()
        resolve(true)
      }

      const handleCancel = () => {
        setOpen(false)
        cleanup()
        resolve(false)
      }

      return (
        <Dialog open={open} onOpenChange={handleCancel}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{options.title}</DialogTitle>
              <DialogDescription>
                {options.description}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={handleCancel}>
                {options.cancelText || "Cancel"}
              </Button>
              <Button onClick={handleConfirm}>
                {options.confirmText || "Confirm"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )
    }

    return ConfirmationDialog
  })
}
