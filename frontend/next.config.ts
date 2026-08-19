import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/auth/login",
        destination: "/login",
        permanent: true,
      },
      {
        source: "/auth/register",
        destination: "/register",
        permanent: true,
      },
      {
        source: "/auth",
        destination: "/login",
        permanent: true,
      },
      {
        source: "/signin",
        destination: "/login",
        permanent: true,
      },
      {
        source: "/sign-in",
        destination: "/login",
        permanent: true,
      },
      {
        source: "/signup",
        destination: "/register",
        permanent: true,
      },
      {
        source: "/sign-up",
        destination: "/register",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
