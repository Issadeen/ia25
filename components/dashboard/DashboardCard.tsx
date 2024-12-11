import Link from "next/link"
import { LucideIcon } from "lucide-react"

interface DashboardCardProps {
  title: string
  description: string
  icon: LucideIcon
  href: string
}

export function DashboardCard({ title, description, icon: Icon, href }: DashboardCardProps) {
  return (
    <Link href={href} className="block h-full">
      <div className="relative h-full group">
        {/* Glow effect - more subtle and theme-aware */}
        <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-600/30 via-teal-500/30 to-blue-600/30 dark:from-emerald-600/40 dark:via-teal-500/40 dark:to-blue-600/40 rounded-xl blur-sm opacity-0 group-hover:opacity-60 transition duration-500" />
        
        {/* Card content */}
        <div className="relative h-full p-6 rounded-xl bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm border border-gray-200/50 dark:border-gray-800/50 
          shadow-sm hover:shadow-md transition duration-500 ease-out
          hover:scale-[1.01] transform-gpu
          flex flex-col justify-between gap-4">
          <div className="space-y-4">
            <div className="inline-flex p-3 rounded-lg bg-gray-100/80 dark:bg-gray-800/80">
              <Icon className="h-6 w-6 text-emerald-600/90 dark:text-emerald-400/90 group-hover:text-emerald-500 transition-colors" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">
                {title}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground/80">
                {description}
              </p>
            </div>
          </div>
          
          {/* Arrow indicator - more subtle */}
          <div className="flex justify-end">
            <svg
              className="w-5 h-5 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-all group-hover:translate-x-0.5 duration-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M17 8l4 4m0 0l-4 4m4-4H3"
              />
            </svg>
          </div>
        </div>
      </div>
    </Link>
  )
}

