import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { isOnRoster } from '@/lib/auth'
import { appUrl } from '@/lib/env'

/**
 * Where a sign-in link lands — in whichever of three shapes it arrives
 * (`?code=`, `?token_hash=`, or the session in the URL fragment, which only
 * the browser can see and hands back by POST). A ROUTE HANDLER, not a page:
 * cookies are read-only in a Server Component, and a page that verifies the
 * token and writes no session lands the person back on the login screen with
 * no explanation. Learned in EQFlow; kept here.
 */
export const dynamic = 'force-dynamic'

/** Where to go after sign-in: the path the middleware remembered, if it is a safe relative one; else home. */
async function nextPath(): Promise<string> {
  const store = await cookies()
  const raw = store.get('quorum.next')?.value ?? ''
  try {
    store.delete('quorum.next')
  } catch {}
  return /^\/(?!\/)[^\s]*$/.test(raw) ? raw : '/'
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const tokenHash = url.searchParams.get('token_hash')
  const type = (url.searchParams.get('type') ?? 'magiclink') as EmailOtpType

  if (url.searchParams.get('error_description')) {
    return NextResponse.redirect(`${appUrl()}/login?error=unverified`)
  }

  if (code || tokenHash) {
    const supabase = await createClient()
    const { data, error } = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({ type, token_hash: tokenHash! })

    if (error || !data.user) return NextResponse.redirect(`${appUrl()}/login?error=unverified`)
    if (!(await isOnRoster(data.user.email))) {
      await supabase.auth.signOut()
      return NextResponse.redirect(`${appUrl()}/login?error=not_on_roster`)
    }
    return NextResponse.redirect(`${appUrl()}${await nextPath()}`)
  }

  return new NextResponse(FRAGMENT_HANDOFF, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  })
}

/**
 * Two shapes: the session from a URL fragment (above), or the 8-digit code
 * from the email typed into the sign-in form — the fallback for a link that
 * was opened somewhere it could not complete.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    access_token?: string
    refresh_token?: string
    email?: string
    token?: string
  }
  const supabase = await createClient()
  let result
  if (body.email && body.token) {
    const token = body.token.replace(/\D/g, '')
    if (token.length < 6) return NextResponse.json({ message: 'Enter the whole code from the email.' }, { status: 400 })
    result = await supabase.auth.verifyOtp({ type: 'email', email: body.email.trim().toLowerCase(), token })
    if (result.error || !result.data.user) {
      return NextResponse.json({ message: 'That code is wrong or has expired. Request a new one.' }, { status: 401 })
    }
  } else if (body.access_token && body.refresh_token) {
    result = await supabase.auth.setSession({ access_token: body.access_token, refresh_token: body.refresh_token })
    if (result.error || !result.data.user) return NextResponse.json({ message: 'That sign-in link has expired.' }, { status: 401 })
  } else {
    return NextResponse.json({ message: 'That sign-in link did not work.' }, { status: 400 })
  }
  const user = result.data.user
  if (!user) return NextResponse.json({ message: 'That sign-in did not work.' }, { status: 401 })
  if (!(await isOnRoster(user.email))) {
    await supabase.auth.signOut()
    return NextResponse.json({ message: 'That account cannot sign in here.' }, { status: 403 })
  }
  return NextResponse.json({ ok: true, next: await nextPath() })
}

const FRAGMENT_HANDOFF = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Signing you in…</title>
<style>
  body { margin:0; background:#161826; color:#e9e9ed; font-family:Inter,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif; }
  main { max-width:420px; margin:0 auto; padding:80px 24px; }
  p { font-size:15px; line-height:1.6; color:#b2b6ca; }
  a { color:#9184d9; }
</style>
</head>
<body>
<main><p id="status">Signing you in…</p></main>
<script>
(function () {
  var status = document.getElementById('status');
  function failed(message) {
    status.innerHTML = (message || 'That link did not work.') +
      ' Sign-in links work once and expire after three hours. <a href="/login">Request another</a>.';
  }
  var fragment = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''));
  var accessToken = fragment.get('access_token');
  var refreshToken = fragment.get('refresh_token');
  if (!accessToken || !refreshToken) { failed(); return; }
  fetch('/auth/confirm', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ access_token: accessToken, refresh_token: refreshToken })
  })
    .then(function (response) {
      if (!response.ok) { return response.json().then(function (b) { failed(b.message); }); }
      return response.json().then(function (b) { window.location.replace(b.next || '/'); });
    })
    .catch(function () { failed('We could not reach the server.'); });
})();
</script>
</body>
</html>`
