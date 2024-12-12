import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background",
  {
    variants: {
      variant: {
        default: "bg-emerald-600 text-white hover:bg-emerald-700",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input hover:bg-emerald-100 hover:text-emerald-700",
        secondary: "bg-emerald-100 text-emerald-900 hover:bg-emerald-200",
        ghost: "hover:bg-emerald-100 hover:text-emerald-700",
        link: "underline-offset-4 hover:underline text-emerald-700",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

// Add forced-colors-mode support
const buttonStyles = {
  '@media (forced-colors: active)': {
    'forced-color-adjust': 'auto',
    'background-color': 'ButtonFace',
    'color': 'ButtonText',
    'border': '1px solid ButtonText',
    '&:hover': {
      'background-color': 'Highlight',
      'color': 'HighlightText'
    }
  }
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }), buttonStyles)}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }

