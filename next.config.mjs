const isDev = process.env.NODE_ENV !== "production";

// Kartplattor är det enda externa innehållet webbläsaren hämtar; all övrig data går via servern.
const TILE_HOSTS = "https://tile.openstreetmap.org https://*.tile.opentopomap.org https://server.arcgisonline.com";

const csp = [
  "default-src 'self'",
  // Next.js lägger in inline-skript för hydrering; eval behövs bara i utvecklingsläge
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${TILE_HOSTS}`,
  "font-src 'self'",
  `connect-src 'self'${isDev ? " ws:" : ""}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=(), payment=(), usb=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
      {
        // service workern ska alltid hämtas på nytt så att säkerhetsrättningar når klienterna
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
    ];
  },
};

export default nextConfig;
