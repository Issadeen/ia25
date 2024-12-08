"use client"

import { useState, useEffect } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { FormField } from "components/ui/molecules/FormField"
import { useToast } from "components/ui/use-toast"
import { Card } from "@/components/ui/card"
import { MoonIcon, SunIcon } from "@radix-ui/react-icons"
import { useTheme } from "next-themes"
import { Loader2 } from "lucide-react"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string>("")
  const router = useRouter()
  const { toast } = useToast()
  const { theme, setTheme } = useTheme()

  const getErrorMessage = (error: any) => {
    if (typeof error === 'string') {
      if (error.includes('auth/wrong-password')) {
        return "Incorrect password. Please try again.";
      }
      if (error.includes('auth/user-not-found')) {
        return "No account found with this email.";
      }
      if (error.includes('auth/invalid-email')) {
        return "Invalid email format.";
      }
      if (error.includes('CredentialsSignin')) {
        return "Invalid email or password. Please try again.";
      }
      if (error.includes('401')) {
        return "Unauthorized access. Please check your credentials.";
      }
    }
    return "Authentication failed. Please check your credentials.";
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage("");

    const email = e.currentTarget.email.value;
    const password = e.currentTarget.password.value;

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setErrorMessage(getErrorMessage(result.error));
        toast({
          title: "Error",
          description: getErrorMessage(result.error),
          variant: "destructive",
        });
      } else {
        // Fetch the custom Firebase token
        const response = await fetch('/api/auth/firebase-token');
        const { customToken } = await response.json();

        // Validate the custom token
        if (!customToken) {
          throw new Error("Failed to retrieve custom Firebase token");
        }

        // Store the custom token in session storage
        sessionStorage.setItem('firebaseToken', customToken);

        router.push("/dashboard");
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
      toast({
        title: "Error",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("expired")) {
      toast({
        title: "Session Expired",
        description: "Your session has expired. Please log in again.",
        variant: "destructive",
      });
    }
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-background to-muted relative">
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-4 right-4"
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      >
        <SunIcon className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <MoonIcon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        <span className="sr-only">Toggle theme</span>
      </Button>
      
      <div className="w-full max-w-md text-center mb-8">
        <h1 className="text-4xl font-bold text-primary mb-2">Issaerium-23</h1>
        <div className="h-1 w-20 bg-primary mx-auto rounded-full mb-8" />
      </div>

      <Card className="w-full max-w-md p-6 space-y-6 shadow-lg backdrop-blur-sm bg-opacity-50">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
          <p className="text-muted-foreground">Enter your credentials to continue</p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField
            label="Email"
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <FormField
            label="Password"
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {errorMessage && (
            <div className="text-sm text-destructive text-center p-2 bg-destructive/10 rounded-md">
              {errorMessage}
            </div>
          )}
          <Button disabled={isLoading} type="submit" className="w-full">
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing in...
              </>
            ) : (
              "Sign In"
            )}
          </Button>
        </form>
      </Card>

      <div className="mt-8 text-center space-y-2">
        <div className="flex items-center gap-2 justify-center text-muted-foreground">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            className="w-4 h-4"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
          <span className="text-sm">Protected by Issaerium Security</span>
        </div>
        <p className="text-xs text-muted-foreground/60">
          © {new Date().getFullYear()} Issaerium-23. All rights reserved.
        </p>
      </div>
    </div>
  )
}
