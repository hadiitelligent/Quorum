import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Defaults are what we want: `next build` fails on a type error. ESLint is
  // not part of the build in Next 16 — `npm run lint` runs in preflight.
}

export default nextConfig

// Gives `next dev` access to the Cloudflare bindings declared in wrangler.jsonc,
// so local development and the deployed Worker see the same environment.
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'
void initOpenNextCloudflareForDev()
