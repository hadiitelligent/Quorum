import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Generated, not authored:
    '.open-next/**',
    'cloudflare-env.d.ts',
    // The design prototype, kept for comparison only.
    'reference/**',
  ]),
])

export default eslintConfig
