import type { NextConfig } from "next";
import { staticSecurityHeaders } from "./src/server/security-headers";

const isDev = process.env.NODE_ENV !== "production";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  async headers() {
    // Static headers for every route, including static files the proxy skips.
    return [
      {
        source: "/:path*",
        headers: Object.entries(staticSecurityHeaders(isDev)).map(([key, value]) => ({ key, value })),
      },
    ];
  },
};

export default nextConfig;
