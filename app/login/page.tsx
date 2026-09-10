import { redirect } from 'next/navigation'
import { getCurrentPerson } from '@/lib/auth'
import { Brand } from '@/components/shell/brand'
import { SignInForm } from './sign-in-form'

export const dynamic = 'force-dynamic'

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getCurrentPerson()) redirect('/')

  const { error } = await searchParams
  const message =
    error === 'not_on_roster'
      ? 'That account is not on the Quorum roster. Ask your admin to add you.'
      : error === 'unverified'
        ? 'That sign-in link has expired or was already used. Request another, or type the code from the email.'
        : null

  return (
    <div className="login-body" style={{ height: '100vh' }}>
      <main className="login">
        <Brand />
        <div>
          <div className="kicker">Sign in</div>
          <h1>Your board is waiting.</h1>
        </div>
        {message && <p className="msg warn">{message}</p>}
        <SignInForm />
        <p className="help" style={{ lineHeight: 1.6 }}>
          Quorum is private to the roster. Sign in with the email address your admin added.
        </p>
      </main>
    </div>
  )
}
