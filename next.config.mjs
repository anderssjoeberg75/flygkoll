/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  // största uppladdningarna: loggbok-CSV (max 3 MB) och gallrade flygspår (max 5000 punkter)
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
};

export default nextConfig;
