import { NextResponse } from 'next/server'
import { getCurrentPerson } from '@/lib/auth'
import { OAuthError, issueCode, parseAuthorizeRequest } from '@/lib/oauth/server'
import { appUrl } from '@/lib/env'

/** The one click: re-validates the request, mints the code, sends the person back to their Claude. */
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const person = await getCurrentPerson()
  if (!person) return NextResponse.redirect(`${appUrl()}/login`, { status: 303 })
  const form = new URLSearchParams(await request.text())
  let parsed
  try {
    parsed = await parseAuthorizeRequest(form)
  } catch (e) {
    const q = new URLSearchParams(form)
    q.set('error', e instanceof OAuthError ? e.code : 'invalid_request')
    return NextResponse.redirect(`${appUrl()}/oauth/authorize?${q.toString()}`, { status: 303 })
  }
  const back = new URL(parsed.redirectUri)
  if (form.get('decision') !== 'approve') {
    back.searchParams.set('error', 'access_denied')
    if (parsed.state) back.searchParams.set('state', parsed.state)
    return NextResponse.redirect(back.toString(), { status: 303 })
  }
  const code = await issueCode(parsed, person)
  back.searchParams.set('code', code)
  if (parsed.state) back.searchParams.set('state', parsed.state)
  return NextResponse.redirect(back.toString(), { status: 303 })
}
