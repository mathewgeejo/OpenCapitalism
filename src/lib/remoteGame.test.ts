import { describe, expect, it } from 'vitest'
import { adaptRemoteGame, toServerAction, type RemoteSnapshotEnvelope } from './remoteGame'

const envelope: RemoteSnapshotEnvelope = {
  ok: true,
  game: {
    id: '5dba5fda-8713-43b4-b85f-470d441ad492',
    title: 'Test table',
    visibility: 'public',
    status: 'active',
    hostUserId: 'host',
    maxPlayers: 20,
    settings: { turnSeconds: 30, auctionSeconds: 20, fastAnimation: true, jackpotEnabled: true, startBonus: 200 },
    version: 7,
  },
  snapshot: {
    status: 'active',
    phase: 'await_purchase',
    currentPlayerId: 'host',
    turnDeadlineAt: '2030-01-01T00:00:00.000Z',
    round: 4,
    players: [
      { id: 'host', displayName: 'Host Player', avatarColor: '#38bdf8', cash: 1450, position: 3, memberStatus: 'joined' },
      { id: 'guest', displayName: 'Guest Player', avatarColor: '#f43f5e', cash: 980, position: 12, memberStatus: 'joined' },
    ],
    assets: [
      { tileId: 'marina-row', ownerId: 'host', buildings: 2, mortgaged: false },
      { tileId: 'north-loop', ownerId: 'guest', buildings: 0, mortgaged: true },
    ],
    pendingPurchase: { tileId: 'marina-row', cost: 80 },
    auction: null,
    jackpot: 120,
    lastRoll: { playerId: 'host', dice: [2, 5] },
  },
  events: [{ id: 11, ordinal: 0, actor_id: 'host', message: 'rolled 7', created_at: '2030-01-01T00:00:00.000Z' }],
}

describe('remote game adapter', () => {
  it('renders an authoritative public snapshot without server-private deck state', () => {
    const state = adaptRemoteGame(envelope)
    expect(state.phase).toBe('awaitingPurchase')
    expect(state.players[0]).toMatchObject({ name: 'Host Player', propertyIds: ['marina-row'] })
    expect(state.properties['marina-row']).toMatchObject({ ownerId: 'host', buildings: 2 })
    expect(state.properties['north-loop']).toMatchObject({ ownerId: 'guest', mortgaged: true })
    expect(state.lastRoll).toEqual([2, 5])
    expect(state.events[0]?.message).toBe('rolled 7')
  })

  it('keeps a remote lobby in the local lobby phase so only the host can start it', () => {
    const state = adaptRemoteGame({ ...envelope, game: { ...envelope.game, status: 'lobby' }, snapshot: { ...envelope.snapshot, status: 'lobby', phase: 'await_roll' } })
    expect(state.status).toBe('waiting')
    expect(state.phase).toBe('lobby')
  })

  it('removes client-supplied identity when converting UI actions to server intents', () => {
    expect(toServerAction({ type: 'ROLL', playerId: 'forged-player', dice: [6, 6] })).toEqual({ type: 'roll' })
    expect(toServerAction({ type: 'BUILD', playerId: 'forged-player', tileId: 'marina-row' })).toEqual({ type: 'build', tileId: 'marina-row' })
    expect(toServerAction({ type: 'START_GAME', playerId: 'host' })).toBeNull()
  })
})
