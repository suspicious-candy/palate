import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "ss3.4sqi.net",
        pathname: "/img/categories_v2/**",
      },
    ],
  },
};

export default nextConfig;
