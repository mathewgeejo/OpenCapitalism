import type { GameAction, PublicGameState } from '../game/types'
import { supabase } from './supabase'

export type ActionResponse = {
  state: PublicGameState
  version: number
  events: PublicGameState['events']
}

export type GameVersionSignal = {
  gameId: string
  version: number
  eventSequence: number
}

/**
 * Browser-to-server action bridge. The Edge Function is intentionally the only
 * route that can mutate an active game; the browser never writes state rows.
 */
export async function submitGameAction(
  gameId: string,
  knownVersion: number,
  action: GameAction,
): Promise<ActionResponse> {
  const client = supabase
  if (!client) throw new Error('Supabase is not configured.')

  const clientActionId = crypto.randomUUID()
  const { data, error } = await client.functions.invoke<ActionResponse>('game-action', {
    body: { gameId, knownVersion, clientActionId, action },
  })
  if (error) throw error
  if (!data) throw new Error('The game service returned no state.')
  return data
}

export async function fetchGameSnapshot(gameId: string): Promise<PublicGameState> {
  const client = supabase
  if (!client) throw new Error('Supabase is not configured.')
  const { data, error } = await client.functions.invoke<{ state: PublicGameState }>('game-snapshot', {
    body: { gameId },
  })
  if (error) throw error
  if (!data?.state) throw new Error('The saved game could not be loaded.')
  return data.state
}

export function subscribeToGameVersion(gameId: string, onSignal: (signal: GameVersionSignal) => void) {
  const client = supabase
  if (!client) return () => undefined

  const channel = client
    .channel(`game:${gameId}`, { config: { private: true } })
    .on('broadcast', { event: 'state-version' }, ({ payload }) => {
      const signal = payload as GameVersionSignal
      if (signal.gameId === gameId) onSignal(signal)
    })
    .subscribe()

  return () => {
    void client.removeChannel(channel)
  }
}
