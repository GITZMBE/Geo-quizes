import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Next's build tracing doesn't follow Prisma's native query-engine binary
  // (app/generated/prisma/libquery_engine-*.so.node) — without this it's
  // silently dropped from the serverless function bundle.
  outputFileTracingIncludes: {
    "/**/*": ["./app/generated/prisma/**/*"],
  },
};

export default nextConfig;
