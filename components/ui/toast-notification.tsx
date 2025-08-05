"use client";

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  AlertCircle, 
  CheckCircle2, 
  Info, 
  XCircle,
  X 
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ToastNotification {
  id: string;
  title: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
}

interface ToastNotificationProps {
  notification: ToastNotification;
  onClose: (id: string) => void;
}

const ToastNotificationItem: React.FC<ToastNotificationProps> = ({ 
  notification, 
  onClose 
}) => {
  const { id, title, message, type, duration = 5000 } = notification;
  
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose(id);
    }, duration);
    
    return () => clearTimeout(timer);
  }, [id, duration, onClose]);
  
  const icons = {
    success: <CheckCircle2 className="h-5 w-5 text-white" />,
    error: <XCircle className="h-5 w-5 text-white" />,
    warning: <AlertCircle className="h-5 w-5 text-white" />,
    info: <Info className="h-5 w-5 text-white" />
  };
  
  const colors = {
    success: "bg-green-500",
    error: "bg-red-500",
    warning: "bg-amber-500",
    info: "bg-blue-500"
  };
  
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
      className={cn(
        "relative flex w-full max-w-sm items-center rounded-lg shadow-lg mb-2 overflow-hidden",
        "border border-gray-200 dark:border-gray-800"
      )}
    >
      <div className={`${colors[type]} p-4 flex items-center justify-center`}>
        {icons[type]}
      </div>
      <div className="p-4 bg-white dark:bg-gray-900 flex-1">
        <div className="flex justify-between items-start">
          <h4 className="font-medium text-sm text-gray-900 dark:text-gray-100">{title}</h4>
          <button 
            onClick={() => onClose(id)}
            className="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{message}</p>
      </div>
      <div 
        className={`absolute bottom-0 left-0 h-1 ${colors[type]}`}
        style={{
          width: '100%',
          animation: `shrink ${duration}ms linear forwards`
        }}
      />
      <style jsx>{`
        @keyframes shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </motion.div>
  );
};

interface ToastContainerProps {
  notifications: ToastNotification[];
  onClose: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ 
  notifications,
  onClose
}) => {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col items-end space-y-2 max-h-screen overflow-hidden pointer-events-none">
      <AnimatePresence initial={false}>
        {notifications.map(notification => (
          <div key={notification.id} className="pointer-events-auto">
            <ToastNotificationItem 
              notification={notification} 
              onClose={onClose} 
            />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
};

// Create a React context to manage toast notifications
const ToastContext = React.createContext<{
  showToast: (toast: Omit<ToastNotification, 'id'>) => void;
  closeToast: (id: string) => void;
}>({
  showToast: () => {},
  closeToast: () => {},
});

export const useToastNotification = () => React.useContext(ToastContext);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<ToastNotification[]>([]);

  const showToast = (toast: Omit<ToastNotification, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9);
    setNotifications(prev => [{ id, ...toast }, ...prev].slice(0, 5)); // Limit to 5 toasts at a time
  };

  const closeToast = (id: string) => {
    setNotifications(prev => prev.filter(toast => toast.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast, closeToast }}>
      {children}
      <ToastContainer notifications={notifications} onClose={closeToast} />
    </ToastContext.Provider>
  );
};
