import NextAuth from "next-auth"
import { AuthOptions } from 'next-auth';

export const authOptions: AuthOptions = {
  providers: []
};

const handler = NextAuth({
  ...authOptions,
  debug: true,
  logger: {
    error(code, ...message) {
      console.error(code, message)
    },
    warn(code, ...message) {
      console.warn(code, message)
    },
    debug(code, ...message) {
      console.debug(code, message)
    },
  },
})

export { handler as GET, handler as POST }

