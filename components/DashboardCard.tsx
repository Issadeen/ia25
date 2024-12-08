import { useTheme } from "next-themes"
import { useRouter } from "next/navigation"
import { motion } from 'framer-motion'
import { ChevronRight } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "components/ui/atoms/card"

interface DashboardCardProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  href: string;
}

export const DashboardCard = ({ icon: Icon, title, description, href }: DashboardCardProps) => {
  const { theme } = useTheme()
  const router = useRouter()

  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      <Card 
        className={`group h-full cursor-pointer relative z-10 overflow-hidden
          ${theme === 'dark' 
            ? 'bg-gradient-to-br from-gray-800 to-gray-900 border-gray-700 hover:shadow-blue-500/20' 
            : 'bg-gradient-to-br from-white to-gray-100 border-gray-200 hover:shadow-blue-500/10'
          }`}
        onClick={() => router.push(href)}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className={`text-lg font-semibold ${
            theme === 'dark' ? 'text-gray-200' : 'text-gray-800'
          }`}>{title}</CardTitle>
          <div className={`rounded-full p-2 transition-colors duration-300 ${
            theme === 'dark' 
              ? 'bg-blue-500/20 group-hover:bg-blue-500/30' 
              : 'bg-blue-100 group-hover:bg-blue-200'
          }`}>
            <Icon className="h-6 w-6 text-blue-500" />
          </div>
        </CardHeader>
        <CardContent>
          <CardDescription className={`text-sm ${
            theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
          }`}>
            {description}
          </CardDescription>
        </CardContent>
        <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <ChevronRight className="h-5 w-5 text-blue-500" />
        </div>
      </Card>
    </motion.div>
  )
}