import { LucideIcon } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface WorkAction {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
}

interface WorkCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  actions: WorkAction[];
}

export function WorkCard({ title, description, icon: Icon, actions }: WorkCardProps) {
  return (
    <div className="relative group h-full">
      <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-600/30 via-teal-500/30 to-blue-600/30 rounded-xl blur-sm opacity-0 group-hover:opacity-100 transition duration-500" />
      <div className="relative h-full p-6 rounded-xl bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm border border-gray-200/50 dark:border-gray-800/50 shadow-sm hover:shadow-md transition">
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-2 rounded-lg bg-emerald-100/50 dark:bg-emerald-900/50">
              <Icon className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">{title}</h3>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          </div>

          <div className="mt-auto pt-4 border-t border-gray-200 dark:border-gray-800">
            <div className="flex flex-wrap gap-2">
              {actions.map((action) => (
                <Link key={action.label} href={action.href}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="group/button hover:border-emerald-500/50 relative"
                  >
                    <action.icon className="h-4 w-4 mr-2 text-emerald-600 dark:text-emerald-400 group-hover/button:text-emerald-500" />
                    {action.label}
                    {action.badge && (
                      <Badge 
                        variant="secondary" 
                        className="absolute -top-2 -right-2 px-1 py-0 text-[0.6rem] bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
                      >
                        {action.badge}
                      </Badge>
                    )}
                  </Button>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
