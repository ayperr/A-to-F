import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // The Claude routes read route data at request time; ship it with those functions.
  outputFileTracingIncludes: {
    "/api/identify": ["./public/data/routes/**", "./public/data/landmarks.json"],
    "/api/landmark": ["./public/data/routes/**", "./public/data/landmarks.json"],
  },
};

export default nextConfig;
