import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";

// Edge-safe base config (no Prisma/bcrypt — Edge middleware can't run them).
// Used directly by proxy.ts, and extended with the real authorize() +
// adapter in lib/auth.ts. Middleware only verifies the JWT via auth() — it
// never calls a provider's authorize() — so this stub never actually runs;
// it exists purely to keep the provider list's shape consistent between the
// two configs.
export const authConfig: NextAuthConfig = {
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async () => null,
    }),
  ],
  // Netlify Functions sit behind a proxy — trust its forwarded host header
  // rather than only whatever NEXTAUTH_URL/AUTH_URL was set to.
  trustHost: true,
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.userId) {
        session.user.id = token.userId as string;
      }
      return session;
    },
  },
};
