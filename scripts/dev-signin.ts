/**
 * Prints a working sign-in link for a roster address, without sending email.
 *
 *   npm run signin -- you@example.com            a link for localhost
 *   npm run signin -- you@example.com --prod     a link for the deployed site
 *
 * Uses the service-role key to mint the same link the magic-link email would
 * contain. Supabase's built-in SMTP allows two emails an hour, which runs out
 * fast when a sign-in link is also how you test a deploy.
 */
import { config } from 'dotenv'

const targetingProduction = process.argv.includes('--prod')
if (!targetingProduction) config({ path: '.env.development.local', quiet: true })
config({ path: '.env.local', quiet: true })

import { createClient } from '@supabase/supabase-js'

async function main() {
  const email = process.argv[2]?.trim().toLowerCase()
  if (!email || email.startsWith('--')) {
    console.error('Usage: npm run signin -- you@example.com [--prod]')
    process.exit(1)
  }
  const configured = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
  const appUrl = targetingProduction ? configured : 'http://localhost:3000'
  if (targetingProduction && /localhost|127\.0\.0\.1/.test(appUrl)) {
    console.error(`--prod was given but APP_URL is ${appUrl}. Nothing to target.`)
    process.exit(1)
  }
  if (targetingProduction) console.warn(`\n⚠  Minting a PRODUCTION session link for ${appUrl}. Treat it like a password.\n`)

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
  const { data: person } = await admin.from('people').select('name, active').eq('email', email).maybeSingle()
  if (!person) {
    console.error(`${email} is not on the roster. Add it to scripts/roster.ts and run npm run seed.`)
    process.exit(1)
  }
  if (!person.active) {
    console.error(`${email} is on the roster but deactivated.`)
    process.exit(1)
  }
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo: `${appUrl}/auth/confirm` } })
  if (error || !data.properties) {
    console.error(`Could not generate a link: ${error?.message}`)
    process.exit(1)
  }
  console.log(`\nSigned in as ${person.name} <${email}>. Open this once — it expires:\n`)
  console.log(`  ${appUrl}/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink\n`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
