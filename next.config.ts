import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This app lives in web/; pin the workspace root (there's also a lockfile one level up).
  turbopack: { root: process.cwd() },
};

export default nextConfig;
