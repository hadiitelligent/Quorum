'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * A magic link, as in ITelliBuilder and EQFlow: works today with no OAuth
 * configuration, and Google sign-in is a Supabase dashboard change rather
 * than a code change.
 *
 * The button says nothing about whether the address is on the roster —
 * everyone gets the same answer, and only a real roster member gets an email
 * that leads anywhere.
 *
 * The email carries both a link and an 8-digit code. The link is the easy
 * path; the code is for when the link was opened somewhere it could not
 * finish (a mail app's own browser, a different device, a scanner that
 * followed it first). Typing the code here completes the sign-in in THIS
 * browser, which is the one that matters.
 */
export function SignInForm() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'checking' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function send(event: React.FormEvent) {
    event.preventDefault()
    setState('sending')
    setError(null)

    const supabase = createClient()
    const { error: sendError } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
        // Sign-in only. Nobody creates themselves an account by typing an address.
        shouldCreateUser: false,
      },
    })

    if (sendError) {
      if (/signups not allowed|user not found/i.test(sendError.message)) {
        setState('sent')
        return
      }
      setError(sendError.message)
      setState('error')
      return
    }
    setState('sent')
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault()
    setState('checking')
    setError(null)
    const res = await fetch('/auth/confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase(), token: code }),
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string }
      setError(body.message ?? 'That code did not work.')
      setState('sent')
      return
    }
    window.location.replace('/')
  }

  if (state === 'sent' || state === 'checking') {
    return (
      <form onSubmit={verify}>
        <div className="msg good">
          If that address is on the roster, an email is on its way. Tap <b>Sign in</b> in the email, or type the 8-digit code
          from it below. Both are good for three hours.
        </div>
        <div className="field">
          <label htmlFor="code">Code from the email</label>
          <input
            id="code"
            className="input"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]*"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="12345678"
            style={{ letterSpacing: '0.12em', fontSize: 20 }}
          />
        </div>
        {error && <div className="msg warn">{error}</div>}
        <button type="submit" className="btn btn-primary btn-block" disabled={state === 'checking'}>
          {state === 'checking' ? 'Checking…' : 'Sign in with the code'}
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-block"
          onClick={() => {
            setState('idle')
            setCode('')
            setError(null)
          }}
        >
          Use a different address
        </button>
      </form>
    )
  }

  return (
    <form onSubmit={send}>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          className="input"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </div>
      {error && <div className="msg warn">{error}</div>}
      <button type="submit" className="btn btn-primary btn-block" disabled={state === 'sending'}>
        {state === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
      </button>
    </form>
  )
}
