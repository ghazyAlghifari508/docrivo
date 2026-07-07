import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://*.insforge.app; frame-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';"
          },
        ],
      },
      {
        source: "/api/scrape/preview",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'none'; style-src https: 'unsafe-inline'; img-src https: data: blob:; media-src https: data: blob:; font-src https: data:; script-src 'none'; connect-src 'none'; frame-src 'none'; child-src 'none'; base-uri https:; form-action 'none'; object-src 'none'; frame-ancestors 'self';"
          },
        ],
      },
    ];
  },
};

export default nextConfig;
