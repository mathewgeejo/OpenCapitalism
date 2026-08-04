import { DEFAULT_RULES, type GameAction, type GameEvent, type GamePhase, type GameRules, type PublicGameState } from '../game'

type JsonRecord = Record<string, unknown>

export type RemoteGameMeta = {
  id: string
  title: string
  visibility: 'public' | 'private'
  status: string
  hostUserId: string
  maxPlayers: number
  settings?: JsonRecord
  version: number
  currentPlayerId?: string | null
  turnDeadlineAt?: string | null
}

export type RemoteSnapshotEnvelope = {
  ok: boolean
  game: RemoteGameMeta
  snapshot: JsonRecord
  /** Current memberships are returned separately so lobby seats stay live. */
  members?: unknown[]
  events?: unknown[]
}

export type ServerAction = JsonRecord

const asRecord = (value: unknown): JsonRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}

const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : []
const asString = (value: unknown, fallback = ''): string => typeof value === 'string' ? value : fallback
const asNumber = (value: unknown, fallback = 0): number => typeof value === 'number' && Number.isFinite(value) ? value : fallback
const asBoolean = (value: unknown): boolean => value === true

function remoteStatus(status: string): PublicGameState['status'] {
  if (status === 'active') return 'active'
  if (status === 'paused') return 'paused'
  if (status === 'finished' || status === 'abandoned') return 'complete'
  return 'waiting'
}

function remotePhase(phase: string): GamePhase {
  const phases: Record<string, GamePhase> = {
    await_roll: 'awaitingRoll',
    await_purchase: 'awaitingPurchase',
    await_auction: 'auction',
    await_end_turn: 'awaitingEndTurn',
    await_debt: 'awaitingDebt',
    paused: 'paused',
    finished: 'complete',
  }
  return phases[phase] ?? 'lobby'
}

function remoteRules(meta: RemoteGameMeta): GameRules {
  const settings = asRecord(meta.settings)
  return {
    ...DEFAULT_RULES,
    maxPlayers: Math.min(20, Math.max(2, asNumber(meta.maxPlayers, DEFAULT_RULES.maxPlayers))),
    turnTimerSeconds: asNumber(settings.turnSeconds, DEFAULT_RULES.turnTimerSeconds),
    auctionSeconds: asNumber(settings.auctionSeconds, DEFAULT_RULES.auctionSeconds),
    fastAnimations: asBoolean(settings.fastAnimation),
    jackpotEnabled: asBoolean(settings.jackpotEnabled),
    startBonus: asNumber(settings.startBonus, DEFAULT_RULES.startBonus),
  }
}

function remoteEvents(items: unknown[]): GameEvent[] {
  return items.map((raw, index) => {
    const event = asRecord(raw)
    const created = asString(event.created_at)
    return {
      id: String(event.id ?? `remote-${index}`),
      sequence: asNumber(event.ordinal, asNumber(event.id, index + 1)),
      type: 'message',
      actorId: asString(event.actor_id ?? event.actorId) || null,
      message: asString(event.message, 'The city ledger changed.'),
      createdAt: Number.isNaN(Date.parse(created)) ? Date.now() : Date.parse(created),
      data: asRecord(event.data) as Record<string, string | number | boolean | null>,
    }
  })
}

/**
 * The Edge API deliberately sends a compact public snapshot. This adapter turns
 * it into the view model used by the React table without exposing deck order or
 * any server-only state.
 */
export function adaptRemoteGame(envelope: RemoteSnapshotEnvelope): PublicGameState {
  const snapshot = asRecord(envelope.snapshot)
  const assets = asArray(snapshot.assets).map(asRecord)
  const ownership = new Map<string, string[]>()
  const properties: PublicGameState['properties'] = {}
  for (const asset of assets) {
    const tileId = asString(asset.tileId)
    if (!tileId) continue
    const ownerId = asString(asset.ownerId) || null
    properties[tileId] = {
      tileId,
      ownerId,
      buildings: Math.max(0, Math.min(5, asNumber(asset.buildings))) as 0 | 1 | 2 | 3 | 4 | 5,
      mortgaged: asBoolean(asset.mortgaged),
    }
    if (ownerId) ownership.set(ownerId, [...(ownership.get(ownerId) ?? []), tileId])
  }

  const memberRows = asArray(envelope.members)
  const isLobby = envelope.game.status === 'lobby' || asString(snapshot.status) === 'lobby'
  // A waiting-room snapshot is deliberately created before later members
  // arrive. The membership projection is therefore authoritative for its HUD.
  const playerRows = isLobby && memberRows.length > 0 ? memberRows : asArray(snapshot.players)
  const players = playerRows.map((raw, index) => {
    const player = asRecord(raw)
    const id = asString(player.id, `seat-${index}`)
    const memberStatus = asString(player.memberStatus)
    const bankrupt = asBoolean(player.bankrupt) || memberStatus === 'eliminated'
    return {
      id,
      name: asString(player.displayName, `Player ${index + 1}`),
      color: asString(player.avatarColor, '#63d4c4'),
      cash: asNumber(player.cash, DEFAULT_RULES.startingCash),
      position: asNumber(player.position),
      status: bankrupt ? 'bankrupt' : memberStatus === 'left' ? 'left' : asBoolean(player.isDetained) ? 'detained' : 'active',
      detentionTurns: 0,
      detentionPasses: 0,
      doublesRolled: 0,
      propertyIds: ownership.get(id) ?? [],
      netWorth: typeof player.netWorth === 'number' && Number.isFinite(player.netWorth) ? player.netWorth : undefined,
      joinedAt: asNumber(player.seat, index),
    } as PublicGameState['players'][number]
  })

  const auctionRaw = asRecord(snapshot.auction)
  const auction = Object.keys(auctionRaw).length
    ? {
        tileId: asString(auctionRaw.tileId),
        startedByPlayerId: asString(auctionRaw.highestBidderId ?? snapshot.currentPlayerId),
        highestBid: asNumber(auctionRaw.highestBid),
        highestBidderId: asString(auctionRaw.highestBidderId) || null,
        eligiblePlayerIds: players.filter((player) => player.status === 'active').map((player) => player.id),
        passedPlayerIds: asArray(auctionRaw.passedPlayerIds).map((id) => String(id)),
        endsAt: Number.isNaN(Date.parse(asString(auctionRaw.endsAt))) ? null : Date.parse(asString(auctionRaw.endsAt)),
      }
    : null
  const purchaseRaw = asRecord(snapshot.pendingPurchase)
  const pendingPurchase = Object.keys(purchaseRaw).length && envelope.game.currentPlayerId
    ? { playerId: envelope.game.currentPlayerId, tileId: asString(purchaseRaw.tileId), price: asNumber(purchaseRaw.cost) }
    : null
  const lastRollRaw = asRecord(snapshot.lastRoll)
  const dice = asArray(lastRollRaw.dice)
  const debtRaw = asRecord(snapshot.debt)
  const debt = Object.keys(debtRaw).length
    ? {
        playerId: asString(debtRaw.playerId),
        amount: asNumber(debtRaw.amount),
        creditorPlayerId: null,
        reason: asString(debtRaw.reason, 'City account due'),
      }
    : null
  const tradeSummaries = new Map(asArray(snapshot.trades).map((raw) => {
    const trade = asRecord(raw)
    return [asString(trade.id), trade] as const
  }))
  // Full terms are intentionally projected only for trade participants by the
  // snapshot function. Public `trades` stays summary-only for every seat.
  const trades = asArray(snapshot.tradeDetails).flatMap((raw) => {
    const trade = asRecord(raw)
    const id = asString(trade.id)
    const summary = tradeSummaries.get(id) ?? {}
    const fromPlayerId = asString(trade.fromUserId ?? trade.fromPlayerId)
    const toPlayerId = asString(trade.toUserId ?? trade.toPlayerId)
    const offeredPropertyIds = asArray(trade.offerTileIds ?? trade.offeredPropertyIds).map(String)
    const requestedPropertyIds = asArray(trade.requestTileIds ?? trade.requestedPropertyIds).map(String)
    // Summary-only entries remain intentionally unreadable to the client; an
    // authorized participant projection includes the terms below.
    const hasTerms = Array.isArray(trade.offerTileIds) || Array.isArray(trade.offeredPropertyIds)
    if (!hasTerms || !id || !fromPlayerId || !toPlayerId) return []
    const createdAt = Date.parse(asString(trade.createdAt ?? trade.created_at ?? trade.expiresAt))
    const status = asString(summary.status ?? trade.status, 'open')
    return [{
      id,
      fromPlayerId,
      toPlayerId,
      offeredPropertyIds,
      requestedPropertyIds,
      offeredCash: asNumber(trade.offerCash ?? trade.offeredCash),
      requestedCash: asNumber(trade.requestCash ?? trade.requestedCash),
      status: status === 'accepted' ? 'accepted' as const : status === 'declined' ? 'declined' as const : status === 'cancelled' ? 'cancelled' as const : 'open' as const,
      createdAt: Number.isNaN(createdAt) ? Date.now() : createdAt,
    }]
  })

  return {
    id: envelope.game.id,
    version: asNumber(envelope.game.version),
    status: remoteStatus(asString(snapshot.status, envelope.game.status)),
    phase: envelope.game.status === 'lobby' ? 'lobby' : remotePhase(asString(snapshot.phase)),
    hostId: envelope.game.hostUserId,
    players,
    currentPlayerId: asString(snapshot.currentPlayerId, envelope.game.currentPlayerId ?? '') || null,
    currentTurn: asNumber(snapshot.round),
    turnEndsAt: Number.isNaN(Date.parse(asString(snapshot.turnDeadlineAt))) ? null : Date.parse(asString(snapshot.turnDeadlineAt)),
    rules: remoteRules(envelope.game),
    properties,
    pendingPurchase,
    auction,
    debt,
    trades,
    lastRoll: dice.length === 2 ? [asNumber(dice[0]), asNumber(dice[1])] : null,
    jackpot: asNumber(snapshot.jackpot),
    events: remoteEvents(envelope.events ?? []),
    winnerId: null,
    phaseBeforePause: null,
    deckCounts: { event: 0, civic: 0 },
  }
}

/** Removes client-controlled identity and maps UI action names to Edge intents. */
export function toServerAction(action: GameAction): ServerAction | null {
  switch (action.type) {
    case 'ROLL': return { type: 'roll' }
    case 'BUY_PROPERTY': return { type: 'buy_asset' }
    case 'DECLINE_PROPERTY': return { type: 'decline_asset' }
    case 'PLACE_BID': return { type: 'place_bid', amount: action.amount }
    case 'PASS_BID': return { type: 'pass_bid' }
    case 'EXPIRE_AUCTION': return { type: 'resolve_deadline' }
    case 'END_TURN': return { type: 'end_turn' }
    case 'PAY_DETENTION_FEE': return { type: 'pay_detention' }
    case 'USE_DETENTION_PASS': return { type: 'use_release_permit' }
    case 'BUILD': return { type: 'build', tileId: action.tileId }
    case 'SELL_BUILDING': return { type: 'sell_building', tileId: action.tileId }
    case 'MORTGAGE': return { type: 'mortgage', tileId: action.tileId }
    case 'UNMORTGAGE': return { type: 'unmortgage', tileId: action.tileId }
    case 'PAY_DEBT': return { type: 'pay_debt' }
    case 'DECLARE_BANKRUPTCY': return { type: 'declare_bankruptcy' }
    case 'OFFER_TRADE': return {
      type: 'offer_trade',
      toUserId: action.toPlayerId,
      offerCash: action.offeredCash ?? 0,
      requestCash: action.requestedCash ?? 0,
      offerTileIds: action.offeredPropertyIds,
      requestTileIds: action.requestedPropertyIds,
    }
    case 'RESPOND_TRADE': return { type: 'respond_trade', tradeId: action.tradeId, accept: action.accept }
    case 'CANCEL_TRADE': return { type: 'cancel_trade', tradeId: action.tradeId }
    case 'PAUSE_GAME': return { type: 'pause_game' }
    case 'RESUME_GAME': return { type: 'resume_game' }
    case 'END_GAME': return { type: 'end_game' }
    case 'START_GAME': return null
    default: return null
  }
}
