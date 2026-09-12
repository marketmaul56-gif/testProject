import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@skill-platform/contracts"],
  poweredByHeader: false,
};

export default nextConfig;
