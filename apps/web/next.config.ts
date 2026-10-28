import type { NextConfig } from "next";

const apiUrl = process.env.API_URL ?? "http://127.0.0.1:4000";

const nextConfig: NextConfig = {
  experimental: { proxyClientMaxBodySize: "12mb" },
  transpilePackages: ["@drishya/ui", "@drishya/contracts", "@drishya/renderer"],
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiUrl}/api/:path*` }];
  },
};

export default nextConfig;
