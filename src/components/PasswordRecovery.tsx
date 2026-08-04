import { FormEvent, useState } from 'react'
import { ArrowRight, KeyRound, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Brand } from './Brand'

type PasswordRecoveryProps = {
  onComplete: () => void
  onNotice: (message: string) => void
}

export function PasswordRecovery({ onComplete, onNotice }: PasswordRecoveryProps) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase) return
    if (password !== confirmation) {
      onNotice('The two passwords do not match.')
      return
    }
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) onNotice(error.message)
    else {
      onNotice('Your password has been updated.')
      onComplete()
    }
  }

  return (
    <main className="recovery-page">
      <section className="recovery-card">
        <Brand />
        <span className="status-pill"><ShieldCheck size={14} /> SECURE RECOVERY</span>
        <h1>Choose a new password.</h1>
        <p>Your account is verified for this session. Pick a new password to return to the city.</p>
        <form className="auth-form" onSubmit={submit}>
          <label>
            New password
            <span className="field-icon"><KeyRound size={16} /></span>
            <input value={password} type="password" autoComplete="new-password" minLength={8} placeholder="At least 8 characters" onChange={(event) => setPassword(event.target.value)} required />
          </label>
          <label>
            Confirm password
            <span className="field-icon"><KeyRound size={16} /></span>
            <input value={confirmation} type="password" autoComplete="new-password" minLength={8} placeholder="Repeat your password" onChange={(event) => setConfirmation(event.target.value)} required />
          </label>
          <button className="primary-button" type="submit" disabled={busy}> {busy ? 'Saving…' : 'Save new password'} <ArrowRight size={18} /></button>
        </form>
      </section>
    </main>
  )
}
