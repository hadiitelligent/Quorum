/**
 * Provisions the roster, and seeds the advisor personas from seed/advisors.
 *
 *   npm run seed                      roster only
 *   npm run seed -- --advisors        roster + the personas in seed/advisors
 *   npm run seed -- --advisors --dry-run
 *
 * One JSON file per persona; validated before writing. Idempotent: a persona
 * is matched by name and updated in place, so re-running never duplicates
 * the board. A persona's grounding documents live in
 * seed/documents/<persona file basename>/ with a _documents.json manifest
 * ({ file, title, category }[]); each is upserted by title. Accounts are created through the admin API — the ONLY way an
 * account comes to exist (signups are off).
 */
import { config } from 'dotenv'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { ROSTER } from './roster'
import type { Database } from '../lib/database.types'

config({ path: '.env.local', quiet: true })
config({ path: '.env', quiet: true })

const dryRun = process.argv.includes('--dry-run')
const withAdvisors = process.argv.includes('--advisors')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const MANIFEST = z.array(z.object({ file: z.string().min(1), title: z.string().trim().min(1).max(160), category: z.string().trim().max(60).default('') }))

function readDocuments(advisorFile: string): { title: string; category: string; content: string }[] {
  const dir = join('seed', 'documents', basename(advisorFile, '.json'))
  const manifestPath = join(dir, '_documents.json')
  if (!existsSync(manifestPath)) return []
  const parsed = MANIFEST.safeParse(JSON.parse(readFileSync(manifestPath, 'utf8')))
  if (!parsed.success) {
    console.error(`  ✗ ${manifestPath}: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`)
    process.exit(1)
  }
  return parsed.data.map((m) => ({ title: m.title, category: m.category, content: readFileSync(join(dir, m.file), 'utf8') }))
}

const SEED_ADVISOR = z.object({
  name: z.string().trim().min(1),
  role: z.string().trim().min(1),
  bio: z.string().default(''),
  temperament: z.string().default(''),
  strengths: z.array(z.object({ s: z.string().trim().min(1), lv: z.number().int().min(1).max(5) })).max(3).default([]),
  instructions: z.string().default(''),
})

function readAdvisors(dir: string) {
  const out: { file: string; advisor: z.infer<typeof SEED_ADVISOR> }[] = []
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith('.json')) continue
    const parsed = SEED_ADVISOR.safeParse(JSON.parse(readFileSync(join(dir, file), 'utf8')))
    if (!parsed.success) {
      console.error(`  ✗ ${file}: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`)
      process.exit(1)
    }
    out.push({ file, advisor: parsed.data })
  }
  return out
}

async function main() {
  const advisors = withAdvisors ? readAdvisors('seed/advisors') : []
  if (withAdvisors) console.log(`${advisors.length} personas in seed/advisors — valid.`)

  if (dryRun && (!url || !serviceKey)) {
    console.log('\nDRY RUN (offline — no Supabase credentials configured)')
    for (const p of ROSTER) console.log(`  ${p.name.padEnd(18)} ${p.email.padEnd(32)} ${p.admin ? 'admin' : ''}`)
    for (const a of advisors) console.log(`  ${a.advisor.name.padEnd(18)} ${a.advisor.role}`)
    console.log(`\n${ROSTER.length} people, ${advisors.length} personas. Nothing was written.`)
    return
  }
  if (!url || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Copy .env.example to .env.local first.')
    process.exit(1)
  }

  const admin = createClient<Database>(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

  // --- roster -------------------------------------------------------------
  console.log(`\n${dryRun ? 'DRY RUN — ' : ''}Roster → ${new URL(url).host}`)
  for (const entry of ROSTER) {
    const email = entry.email.trim().toLowerCase()
    let authUser = await findAuthUserByEmail(admin, email)
    if (!authUser) {
      if (dryRun) {
        console.log(`  + ${entry.name.padEnd(18)} ${email} — would create auth user + roster row`)
        continue
      }
      const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { name: entry.name } })
      if (error || !data.user) {
        console.error(`  ✗ ${email} — could not create auth user: ${error?.message}`)
        process.exitCode = 1
        continue
      }
      authUser = { id: data.user.id }
    }
    if (dryRun) {
      console.log(`  · ${entry.name.padEnd(18)} ${email} — would upsert roster row`)
      continue
    }
    const { error } = await admin.from('people').upsert(
      { id: authUser.id, email, name: entry.name, title: entry.title ?? '', is_admin: entry.admin ?? false, active: entry.active ?? true },
      { onConflict: 'id' },
    )
    if (error) {
      console.error(`  ✗ ${email} — ${error.message}`)
      process.exitCode = 1
      continue
    }
    console.log(`  ✓ ${entry.name.padEnd(18)} ${email}${entry.admin ? '  (admin)' : ''}`)
  }

  // --- advisors -----------------------------------------------------------
  if (withAdvisors) {
    console.log(`\n${dryRun ? 'DRY RUN — ' : ''}Personas`)
    const { data: existing, error } = await admin.from('advisors').select('id, name')
    if (error) {
      console.error(`  ✗ could not read advisors: ${error.message}`)
      process.exit(1)
    }
    let order = 0
    for (const { file, advisor } of advisors) {
      order += 1
      const found = existing?.find((e) => e.name === advisor.name)
      if (dryRun) {
        const docs = readDocuments(file)
        console.log(`  ${found ? '·' : '+'} ${advisor.name.padEnd(18)} ${found ? 'would update' : 'would create'} (${file})${docs.length ? ` + ${docs.length} document(s)` : ''}`)
        continue
      }
      const row = { ...advisor, active: true, sort_order: order, updated_by: 'seed' }
      const { error: writeError } = found
        ? await admin.from('advisors').update(row).eq('id', found.id)
        : await admin.from('advisors').insert({ ...row, created_by: 'seed' })
      if (writeError) {
        console.error(`  ✗ ${advisor.name} — ${writeError.message}`)
        process.exitCode = 1
        continue
      }
      console.log(`  ✓ ${advisor.name.padEnd(18)} ${found ? 'updated' : 'created'}`)

      // --- grounding documents ------------------------------------------
      const docs = readDocuments(file)
      if (docs.length === 0) continue
      const { data: idRow } = await admin.from('advisors').select('id').eq('name', advisor.name).maybeSingle()
      if (!idRow) continue
      for (const doc of docs) {
        await admin.from('advisor_documents').delete().eq('advisor_id', idRow.id).eq('title', doc.title)
        const { error: docError } = await admin
          .from('advisor_documents')
          .insert({ advisor_id: idRow.id, title: doc.title, category: doc.category, content: doc.content, uploaded_by: 'seed' })
        if (docError) {
          console.error(`      ✗ ${doc.title} — ${docError.message}`)
          process.exitCode = 1
          continue
        }
      }
      console.log(`      ${docs.length} grounding document(s), ${docs.reduce((n, d) => n + d.content.length, 0).toLocaleString()} chars`)
    }
  }

  console.log('\nDone.')
}

async function findAuthUserByEmail(admin: ReturnType<typeof createClient<Database>>, email: string): Promise<{ id: string } | null> {
  let page = 1
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const hit = data.users.find((u) => u.email?.toLowerCase() === email)
    if (hit) return { id: hit.id }
    if (data.users.length < 200) return null
    page += 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
