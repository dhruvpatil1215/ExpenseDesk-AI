/**
 * Next.js Configuration
 * Path: next.config.mjs
 */

/** @type {import('next').NextConfig} */
const config = {
  // Allow Google profile images in <Image>
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname:  "lh3.googleusercontent.com",  // Google profile photos
        pathname:  "/**",
      },
      {
        protocol: "https",
        hostname:  "*.supabase.co",              // Supabase / S3 storage (receipts)
        pathname:  "/storage/v1/object/public/**",
      },
    ],
  },

  // Strict mode for catching issues early
  reactStrictMode: true,

  // Silence Prisma warnings in Components
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client", "bcryptjs"],
  },

  // Security headers
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options",           value: "DENY" },
          { key: "X-Content-Type-Options",     value: "nosniff" },
          { key: "Referrer-Policy",            value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy",         value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ]
  },
}

export default config
