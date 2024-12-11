import { motion } from 'framer-motion'
import { DashboardCard } from "@/components/dashboard/DashboardCard"
import { Truck, Briefcase, Plus, Wallet } from 'lucide-react'

interface DashboardContentProps {
  userName: string
  lastLogin: string | null
}

export function DashboardContent({ userName, lastLogin }: DashboardContentProps) {
  const displayName = userName.substring(0, 4);

  const cards = [
    {
      title: "Truck Details",
      description: "View and manage truck information",
      icon: Truck,
      href: "/dashboard/trucks"
    },
    {
      title: "Work Details",
      description: "Track and review work assignments",
      icon: Briefcase,
      href: "/dashboard/work"
    },
    {
      title: "New Trucks",
      description: "Register and add new trucks to the fleet",
      icon: Plus,
      href: "/dashboard/new-truck"
    },
    {
      title: "Wallet",
      description: "Manage your wallet and transactions",
      icon: Wallet,
      href: "/dashboard/wallet"
    }
  ]

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-12 text-center"
      >
        <h2 className="text-5xl font-bold bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent">
          Welcome back, {displayName}!
        </h2>
        <p className="mt-4 text-xl text-gray-600 dark:text-gray-400 bg-gradient-to-r from-emerald-600/70 via-teal-500/70 to-blue-500/70 bg-clip-text text-transparent">
          Your Issaerium-23 dashboard awaits.
        </p>
      </motion.div>

      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 auto-rows-fr mb-8"
      >
        {cards.map((card, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: index * 0.1 }}
            className="h-full"
          >
            <DashboardCard {...card} />
          </motion.div>
        ))}
      </motion.div>

      {lastLogin && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="text-right text-sm text-muted-foreground/60 mt-8"
        >
          Login time: {lastLogin}
        </motion.div>
      )}
    </>
  )
}

