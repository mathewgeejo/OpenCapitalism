import { supabase } from './supabase'
import type { RemoteGameMeta } from './remoteGame'

export type RoomListItem = {
  id: string
  title: string
  seats: number
  maxPlayers: number
  visibility: 'public' | 'private'
  status: 'waiting' | 'in-progress' | 'paused'
  host: string
}

type CreateRoomInput = {
  title: string
  visibility: 'public' | 'private'
  maxPlayers: number
  settings?: {
    turnSeconds: number
    auctionSeconds: number
    fastAnimation: boolean
    jackpotEnabled: boolean
    startBonus: number
  }
}

function clientOrThrow() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export async function listAvailableRooms(): Promise<RoomListItem[]> {
  const client = clientOrThrow()
  const { data, error } = await client.rpc('list_public_civic_lobbies')
  if (error) throw error

  const rows = (data ?? []) as Record<string, unknown>[]
  return rows.map((record) => {
    return {
      id: String(record.id),
      title: String(record.title),
      seats: Number(record.seat_count ?? 0),
      maxPlayers: Number(record.max_players ?? 20),
      visibility: record.visibility === 'private' ? 'private' : 'public',
      status: record.status === 'paused' ? 'paused' : record.status === 'lobby' ? 'waiting' : 'in-progress',
      host: String(record.host_display_name ?? 'Host'),
    }
  })
}

export async function createRoom(input: CreateRoomInput): Promise<RemoteGameMeta> {
  const client = clientOrThrow()
  const { data, error } = await client.functions.invoke<{ game: RemoteGameMeta }>('create-game', { body: input })
  if (error) throw error
  if (!data?.game) throw new Error('The city could not create a new room.')
  return data.game
}

export async function joinRoom(gameId: string, inviteToken?: string): Promise<void> {
  const client = clientOrThrow()
  const { error } = await client.functions.invoke('join-game', { body: { gameId, inviteToken } })
  if (error) throw error
}

export async function joinRoomByInvite(inviteToken: string): Promise<{ game: RemoteGameMeta }> {
  const client = clientOrThrow()
  const { data, error } = await client.functions.invoke<{ game: RemoteGameMeta }>('join-by-invite', { body: { inviteToken } })
  if (error) throw error
  if (!data?.game) throw new Error('That invite could not be opened.')
  return data
}

export async function startRoom(gameId: string, knownVersion: number) {
  const client = clientOrThrow()
  const { data, error } = await client.functions.invoke<{ version: number; snapshot: Record<string, unknown> }>('start-game', {
    body: { gameId, knownVersion },
  })
  if (error) throw error
  if (!data?.snapshot) throw new Error('The table could not start.')
  return data
}

export async function leaveLobbyRoom(gameId: string) {
  const client = clientOrThrow()
  const { error } = await client.functions.invoke('leave-game', { body: { gameId } })
  if (error) throw error
}

export async function createInvite(gameId: string) {
  const client = clientOrThrow()
  const { data, error } = await client.functions.invoke<{ invite?: { token?: string } }>('create-invite', { body: { gameId } })
  if (error) throw error
  if (!data?.invite?.token) throw new Error('The invite could not be created.')
  return data.invite.token
}
