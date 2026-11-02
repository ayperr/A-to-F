import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // The best-seat API reads route data at request time; make sure it ships with the function.
  outputFileTracingIncludes: { "/api/best-seat": ["./public/data/routes/**"] },
};

export default nextConfig;
