import { FormEvent, useState, type CSSProperties } from 'react'
import { ArrowRight, KeyRound, Mail, Sparkles } from 'lucide-react'
import { Brand } from './Brand'
import { isSupabaseConfigured, requiredSupabaseMessage, supabase } from '../lib/supabase'
import './AuthPanel.css'

type AuthPanelProps = {
  onDemoStart: () => void
  onNotice: (message: string) => void
}

type Mode = 'sign-in' | 'sign-up'

type BoardSpace = {
  label: string
  color: string
  x: string
  y: string
  rotate: string
  corner: boolean
}

const BOARD_SPACES: BoardSpace[] = [
  { label: 'START', color: '#ff8a4c', x: '3%', y: '3%', rotate: '-5deg', corner: true },
  { label: 'POP', color: '#ffd84d', x: '28%', y: '3%', rotate: '-1deg', corner: false },
  { label: 'PARK', color: '#65d8af', x: '53%', y: '3%', rotate: '2deg', corner: false },
  { label: 'WOW', color: '#7c74ff', x: '78%', y: '3%', rotate: '5deg', corner: true },
  { label: 'SKY', color: '#ff70a6', x: '82%', y: '28%', rotate: '92deg', corner: false },
  { label: 'GO!', color: '#67cdf6', x: '82%', y: '53%', rotate: '88deg', corner: false },
  { label: 'BONUS', color: '#ffc64b', x: '82%', y: '78%', rotate: '85deg', corner: true },
  { label: 'HOME', color: '#6de2b2', x: '57%', y: '82%', rotate: '-4deg', corner: false },
  { label: 'CLUB', color: '#ff8db9', x: '32%', y: '82%', rotate: '2deg', corner: false },
  { label: 'ROLL', color: '#8b83ff', x: '3%', y: '82%', rotate: '4deg', corner: true },
  { label: 'LUCK', color: '#ffcc55', x: '3%', y: '57%', rotate: '-88deg', corner: false },
  { label: 'ZIP', color: '#70d9f3', x: '3%', y: '32%', rotate: '-92deg', corner: false },
]

const PAWN_COLORS = ['#ff5c91', '#ffd34d', '#55d8aa'] as const

export function AuthPanel({ onDemoStart, onNotice }: AuthPanelProps) {
  const [mode, setMode] = useState<Mode>('sign-in')
  const [displayName, setDisplayName] = useState('')
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
            options: {
              emailRedirectTo: redirectTo,
              data: { display_name: displayName.trim() || email.split('@')[0] },
            },
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

  const resetPassword = async () => {
    if (!supabase || !email) {
      onNotice(!supabase ? requiredSupabaseMessage : 'Enter your email address first.')
      return
    }
    setBusy(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
    setBusy(false)
    onNotice(error ? error.message : 'Password reset instructions are on their way.')
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
    <main className="auth-page play-login">
      <section className="auth-hero play-login__hero">
        <div className="play-login__confetti" aria-hidden="true">
          {Array.from({ length: 10 }, (_, index) => <i key={index} />)}
        </div>
        <Brand />
        <p className="eyebrow play-login__eyebrow"><Sparkles size={15} /> A FRIENDLY CITY BOARD GAME</p>
        <h1><span>Roll in.</span><em>Rule the block.</em></h1>
        <p className="auth-copy play-login__copy">
          Collect colorful streets, build tiny landmarks, and make every move count with your favorite people.
        </p>
        <div className="hero-stat-row play-login__steps" aria-label="How the game works">
          <span><b>1</b> Pick a token</span>
          <span><b>2</b> Build your block</span>
          <span><b>3</b> Be legendary</span>
        </div>
        <div className="play-login__scene" aria-hidden="true">
          <div className="play-login__card-stack"><i /><i /><i /></div>
          <div className="play-login__board">
            {BOARD_SPACES.map((space, index) => (
              <span
                className={`play-login__board-space${space.corner ? ' play-login__board-space--corner' : ''}`}
                key={space.label}
                style={{
                  '--space-color': space.color,
                  '--space-x': space.x,
                  '--space-y': space.y,
                  '--space-rotate': space.rotate,
                  '--space-delay': `${index * 70}ms`,
                } as CSSProperties}
              >
                {space.label}
              </span>
            ))}
            <div className="play-login__board-core">
              <span>+</span>
              <strong>PLAY<br />TIME</strong>
            </div>
            <span className="play-login__building play-login__building--house play-login__building--one" />
            <span className="play-login__building play-login__building--house play-login__building--two" />
            <span className="play-login__building play-login__building--hotel">H</span>
            {PAWN_COLORS.map((color, index) => (
              <span className={`play-login__pawn play-login__pawn--${index + 1}`} key={color} style={{ '--pawn-color': color } as CSSProperties} />
            ))}
            <span className="play-login__dice"><i /><i /><i /></span>
          </div>
        </div>
      </section>

      <section className="auth-card-wrap play-login__card-wrap">
        <div className="auth-card play-login__card">
          <i className="play-login__card-corner play-login__card-corner--top" aria-hidden="true" />
          <i className="play-login__card-corner play-login__card-corner--bottom" aria-hidden="true" />
          <div className="auth-card-heading">
            <span className="status-pill"><Sparkles size={14} /> PLAYER LOBBY</span>
            <h2>{mode === 'sign-in' ? 'Your turn is up!' : 'Claim a colorful seat'}</h2>
            <p>{mode === 'sign-in' ? 'Jump back into your city and make the next big move.' : 'Join the table, name your token, and start a city story.'}</p>
          </div>

          <button className="google-button" type="button" onClick={signInWithGoogle} disabled={busy}>
            <span className="google-g">G</span>
            Continue with Google
          </button>
          <div className="divider"><span>or play with email</span></div>

          <form className="auth-form" onSubmit={submit}>
            {mode === 'sign-up' && (
              <label>
                Display name
                <span className="field-icon"><Sparkles size={16} /></span>
                <input value={displayName} type="text" autoComplete="nickname" minLength={2} maxLength={30} placeholder="How the table will know you" onChange={(event) => setDisplayName(event.target.value)} required />
              </label>
            )}
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
              {busy ? 'Shuffling the deck...' : mode === 'sign-in' ? "Let's play" : 'Start playing'}
              <ArrowRight size={18} />
            </button>
          </form>

          <div className="auth-actions">
            <button type="button" onClick={magicLink} disabled={busy}>Email me a magic link</button>
            <span className="auth-actions-right">
              {mode === 'sign-in' && <button type="button" onClick={resetPassword} disabled={busy}>Forgot password?</button>}
              <button type="button" onClick={() => setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}>
                {mode === 'sign-in' ? 'New here? Create an account' : 'Already registered? Sign in'}
              </button>
            </span>
          </div>

          {!isSupabaseConfigured && (
            <div className="demo-callout">
              <div><strong>Try the game table</strong><span>Preview mode is ready to roll.</span></div>
              <button type="button" onClick={onDemoStart}>Play the demo <ArrowRight size={15} /></button>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
