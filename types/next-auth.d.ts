import "next-auth"

declare module "next-auth" {
  interface User {
    id: string
    email: string
    name?: string | null
    accessToken?: string
  }

  interface Session {
    user: User & {
      id: string
      accessToken?: string
    }
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    accessToken?: string
  }
}