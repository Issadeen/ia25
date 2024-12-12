import * as React from "react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"

interface FormFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string
}

export const FormField = React.forwardRef<HTMLInputElement, FormFieldProps>(
  ({ label, id, ...props }, ref) => {
    return (
      <div className="space-y-2">
        <Label htmlFor={id}>{label}</Label>
        <Input id={id} ref={ref} {...props} />
      </div>
    )
  }
)
FormField.displayName = "FormField"

