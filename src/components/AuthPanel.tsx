import { FormEvent, useState, type CSSProperties } from 'react'
import { ArrowRight, KeyRound, Mail, Sparkles } from 'lucide-react'
import { Brand } from './Brand'
import { isSupabaseConfigured, requiredSupabaseMessage, supabase } from '../lib/supabase'

type AuthPanelProps = {
  onDemoStart: () => void
  onNotice: (message: string) => void
}

type Mode = 'sign-in' | 'sign-up'

export function AuthPanel({ onDemoStart, onNotice }: AuthPanelProps) {
  const [mode, setMode] = useState<Mode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase) {
      onNotice(requiredSupabaseMessage)
      return
    }

    setBusy(true)
    const redirectTo = window.location.origin
    const result =
      mode === 'sign-in'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: redirectTo },
          })
    setBusy(false)
    if (result.error) onNotice(result.error.message)
    else if (mode === 'sign-up') onNotice('Check your inbox to confirm your Civic Fortune account.')
  }

  const magicLink = async () => {
    if (!supabase || !email) {
      onNotice(!supabase ? requiredSupabaseMessage : 'Enter your email address first.')
      return
    }
    setBusy(true)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    setBusy(false)
    onNotice(error ? error.message : 'Magic link sent. Check your inbox.')
  }

  const signInWithGoogle = async () => {
    if (!supabase) {
      onNotice(requiredSupabaseMessage)
      return
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) onNotice(error.message)
  }

  return (
    <main className="auth-page">
      <section className="auth-hero">
        <Brand />
        <p className="eyebrow">LIVE PROPERTY STRATEGY</p>
        <h1>Make the city<br /><em>move for you.</em></h1>
        <p className="auth-copy">
          Build a skyline, negotiate smart, and outlast the table in a tactile real-time city game.
        </p>
        <div className="hero-stat-row" aria-label="Game features">
          <span><strong>20</strong> live seats</span>
          <span><strong>52</strong> city spaces</span>
          <span><strong>1</strong> shared table</span>
        </div>
        <div className="auth-city" aria-hidden="true">
          {Array.from({ length: 13 }, (_, index) => (
            <i key={index} style={{ '--height': `${26 + ((index * 37) % 90)}%`, '--delay': `${index * 90}ms` } as CSSProperties} />
          ))}
        </div>
      </section>

      <section className="auth-card-wrap">
        <div className="auth-card">
          <div className="auth-card-heading">
            <span className="status-pill"><Sparkles size={14} /> PRIVATE TABLES</span>
            <h2>{mode === 'sign-in' ? 'Welcome back' : 'Claim your seat'}</h2>
            <p>{mode === 'sign-in' ? 'Sign in to return to your city.' : 'Create an account to host and join rooms.'}</p>
          </div>

          <button className="google-button" type="button" onClick={signInWithGoogle} disabled={busy}>
            <span className="google-g">G</span>
            Continue with Google
          </button>
          <div className="divider"><span>or continue with email</span></div>

          <form className="auth-form" onSubmit={submit}>
            <label>
              Email
              <span className="field-icon"><Mail size={16} /></span>
              <input value={email} type="email" autoComplete="email" placeholder="you@cityhall.com" onChange={(event) => setEmail(event.target.value)} required />
            </label>
            <label>
              Password
              <span className="field-icon"><KeyRound size={16} /></span>
              <input value={password} type="password" autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} minLength={8} placeholder="At least 8 characters" onChange={(event) => setPassword(event.target.value)} required />
            </label>
            <button className="primary-button" type="submit" disabled={busy}>
              {busy ? 'Working…' : mode === 'sign-in' ? 'Enter the city' : 'Create account'}
              <ArrowRight size={18} />
            </button>
          </form>

          <div className="auth-actions">
            <button type="button" onClick={magicLink} disabled={busy}>Email me a magic link</button>
            <button type="button" onClick={() => setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}>
              {mode === 'sign-in' ? 'New here? Create an account' : 'Already registered? Sign in'}
            </button>
          </div>

          {!isSupabaseConfigured && (
            <div className="demo-callout">
              <div><strong>Preview mode</strong><span>Supabase is not configured locally.</span></div>
              <button type="button" onClick={onDemoStart}>Open live demo <ArrowRight size={15} /></button>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
