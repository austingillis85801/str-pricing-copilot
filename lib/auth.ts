import GoogleProvider from 'next-auth/providers/google'
import type { NextAuthOptions } from 'next-auth'

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    async signIn({ user }) {
      const allowedEmail = process.env.ALLOWED_EMAIL
      if (!allowedEmail || user.email !== allowedEmail) {
        return '/login?error=AccessDenied'
      }
      return true
    },
    async session({ session }) {
      return session
    },
    async jwt({ token }) {
      return token
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
}
