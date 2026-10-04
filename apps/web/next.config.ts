import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  async redirects() {
    return [
      { source: "/practitioner", destination: "/pro", permanent: true },
      { source: "/review", destination: "/admin", permanent: true },
    ];
  },
};
export default config;
