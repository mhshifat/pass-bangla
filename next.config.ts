import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Server-only heavy packages: load from node_modules at runtime instead of
  // bundling them into every function.
  serverExternalPackages: ["pdfkit", "exceljs", "twilio", "nodemailer", "ioredis", "@node-rs/bcrypt"],
  experimental: {
    // Import only the used modules from these barrel packages
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "date-fns",
      "radix-ui",
      "@base-ui/react",
      "motion",
    ],
    // Client router cache (seconds): revisiting a page within this window reuses
    // the payload already in the browser instead of asking the server again.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // PWA configuration
  async headers() {
    return [
      {
        // The middleware (which also sets this) no longer runs for static
        // assets, so keep the header on them from here.
        source: "/:path*",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
          {
            key: "Service-Worker-Allowed",
            value: "/",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
