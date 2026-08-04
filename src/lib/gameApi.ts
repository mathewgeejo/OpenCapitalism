import { supabase } from './supabase'
import type { RemoteSnapshotEnvelope, ServerAction } from './remoteGame'

export type GameVersionSignal = {
  version: number
  event?: 'game-updated' | 'lobby-updated'
  eventIds?: number[]
}

export type RemoteActionResponse = {
  ok: boolean
  version: number
  snapshot?: RemoteSnapshotEnvelope['snapshot']
  state?: RemoteSnapshotEnvelope['snapshot']
  events?: unknown[]
  duplicate?: boolean
}

/**
 * The browser only sends intents; the Edge Function identifies the user from
 * its verified JWT and calculates all resulting state on the server.
 */
export async function submitGameAction(
  gameId: string,
  knownVersion: number,
  action: ServerAction,
): Promise<RemoteActionResponse> {
  const client = supabase
  if (!client) throw new Error('Supabase is not configured.')

  const { data, error } = await client.functions.invoke<RemoteActionResponse>('game-action', {
    body: { gameId, knownVersion, clientActionId: crypto.randomUUID(), action },
  })
  if (error) throw error
  if (!data) throw new Error('The game service returned no state.')
  return data
}

export async function fetchGameSnapshot(gameId: string): Promise<RemoteSnapshotEnvelope> {
  const client = supabase
  if (!client) throw new Error('Supabase is not configured.')
  const { data, error } = await client.functions.invoke<RemoteSnapshotEnvelope>('game-snapshot', {
    body: { gameId },
  })
  if (error) throw error
  if (!data?.snapshot || !data.game) throw new Error('The saved game could not be loaded.')
  return data
}

export function subscribeToGameVersion(
  gameId: string,
  onSignal: (signal: GameVersionSignal) => void,
  onConnection?: (connected: boolean, onlineSeats: number) => void,
) {
  const client = supabase
  if (!client) return () => undefined

  const channel = client
    .channel(`game:${gameId}`, { config: { private: true } })
    .on('broadcast', { event: 'game-updated' }, ({ payload }) => onSignal(payload as GameVersionSignal))
    .on('broadcast', { event: 'lobby-updated' }, ({ payload }) => onSignal(payload as GameVersionSignal))
    .on('presence', { event: 'sync' }, () => onConnection?.(true, Object.keys(channel.presenceState()).length))

  void client.auth.getSession().then(({ data }) => {
    if (data.session?.access_token) client.realtime.setAuth(data.session.access_token)
    channel.subscribe(async (status) => {
      const connected = status === 'SUBSCRIBED'
      onConnection?.(connected, connected ? Object.keys(channel.presenceState()).length : 0)
      if (connected) await channel.track({ onlineAt: new Date().toISOString() })
    })
  })

  return () => {
    onConnection?.(false, 0)
    void client.removeChannel(channel)
  }
}
