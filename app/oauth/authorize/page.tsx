import { redirect } from 'next/navigation'
import { requirePerson } from '@/lib/auth'
import { OAuthError, parseAuthorizeRequest } from '@/lib/oauth/server'
import { Brand } from '@/components/shell/brand'

export const dynamic = 'force-dynamic'

/**
 * The approval page a Claude sends the person to. The middleware has already
 * sent an anonymous visitor to sign in and back here; this checks the roster,
 * validates the request, and asks for one click.
 */
export default async function Authorize({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const person = await requirePerson()
  const raw = await searchParams
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(raw)) if (typeof v === 'string') params.set(k, v)

  let request
  try {
    request = await parseAuthorizeRequest(params)
  } catch (e) {
    const message = e instanceof OAuthError ? e.message : 'That request did not work.'
    return (
      <div className="login-body" style={{ height: '100vh' }}>
        <main className="login">
          <Brand />
          <div>
            <div className="kicker">Connect your Claude</div>
            <h1>That did not work.</h1>
          </div>
          <p className="msg warn">{message}</p>
          <p className="help">Go back to Claude and add the connector again.</p>
        </main>
      </div>
    )
  }

  // A code is tied to the exact request; the hidden fields carry it to the approval.
  if (raw.error === 'denied') redirect(`${request.redirectUri}?error=access_denied${request.state ? `&state=${encodeURIComponent(request.state)}` : ''}`)

  return (
    <div className="login-body" style={{ height: '100vh' }}>
      <main className="login">
        <Brand />
        <div>
          <div className="kicker">Connect your Claude</div>
          <h1>Let {request.client.name || 'Claude'} use your board?</h1>
        </div>
        <p className="help" style={{ lineHeight: 1.6 }}>
          Signed in as <b style={{ color: 'var(--color-text)' }}>{person.name}</b>. Once connected, your Claude can read and update your standing brief, see the
          board and its sessions, answer the board&rsquo;s questions when you tell it to, and convene a session. It cannot see anyone else&rsquo;s brief or
          private chats. You can disconnect it any time from the Business page.
        </p>
        <form method="post" action="/oauth/authorize/approve">
          {[...params.entries()].map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <button type="submit" className="btn btn-primary btn-block" name="decision" value="approve">
            Connect
          </button>
          <button type="submit" className="btn btn-secondary btn-block" name="decision" value="deny">
            Not now
          </button>
        </form>
      </main>
    </div>
  )
}
