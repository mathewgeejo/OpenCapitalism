import { useEffect, useMemo, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { AuthPanel } from './components/AuthPanel'
import { GameTable } from './components/game/GameTable'
import { LobbyScreen, type LobbyRoom } from './components/lobby/LobbyScreen'
import { Toast } from './components/Toast'
import { createGameState, GameRuleError, reduceGame, type GameAction, type GameState } from './game'
import { isSupabaseConfigured } from './lib/supabase'
import { useAuth } from './lib/useAuth'

const LOCAL_PLAYER_ID = 'aria-vale'

const DEMO_ROOMS: LobbyRoom[] = [
  { id: 'harbor-assembly', title: 'Harbor Assembly', seats: 4, maxPlayers: 20, visibility: 'public', status: 'waiting', host: 'Aria Vale' },
  { id: 'night-market', title: 'Night Market Council', seats: 8, maxPlayers: 20, visibility: 'public', status: 'waiting', host: 'Milo Chen' },
  { id: 'orchard-summit', title: 'Orchard Summit', seats: 14, maxPlayers: 20, visibility: 'public', status: 'in-progress', host: 'Jun Park' },
]

function createDemoGame(): GameState {
  const started = reduceGame(
    createGameState({
      id: 'local-civic-table',
      hostId: LOCAL_PLAYER_ID,
      players: [
        { id: LOCAL_PLAYER_ID, name: 'Aria Vale', color: '#66d5c7' },
        { id: 'milo-chen', name: 'Milo Chen', color: '#f2b96e' },
        { id: 'rhea-james', name: 'Rhea James', color: '#a78bfa' },
        { id: 'jun-park', name: 'Jun Park', color: '#ef7d89' },
      ],
      rules: { jackpotEnabled: true, fastAnimations: true },
      now: Date.now() - 20_000,
    }),
    { type: 'START_GAME', playerId: LOCAL_PLAYER_ID, now: Date.now() - 19_500 },
  )

  // A visual head start makes the demo table immediately communicate ownership
  // and construction while remaining a normal, reducer-driven local state.
  const state: GameState = {
    ...started,
    players: started.players.map((player) => ({ ...player, propertyIds: [...player.propertyIds] })),
    properties: Object.fromEntries(Object.entries(started.properties).map(([id, property]) => [id, { ...property }])),
    events: [...started.events],
  }
  const showcase = [
    ['cedar-quay', LOCAL_PLAYER_ID, 2],
    ['marina-row', LOCAL_PLAYER_ID, 1],
    ['north-loop', 'milo-chen', 0],
    ['willow-passage', 'rhea-james', 3],
    ['canal-view', 'rhea-james', 2],
    ['gallery-row', 'jun-park', 4],
    ['theatre-district', 'jun-park', 5],
  ] as const
  for (const [tileId, ownerId, buildings] of showcase) {
    const property = state.properties[tileId]
    const owner = state.players.find((player) => player.id === ownerId)
    if (property && owner) {
      property.ownerId = ownerId
      property.buildings = buildings
      owner.propertyIds.push(tileId)
      owner.cash -= 120 + buildings * 35
    }
  }
  state.events.push({
    id: 'demo-welcome',
    sequence: state.events.length + 1,
    type: 'message',
    actorId: null,
    message: 'The Harbor Assembly has opened its city ledger.',
    createdAt: Date.now() - 10_000,
  })
  return state
}

function rollDemoDice(): [number, number] {
  return [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]
}

function chooseAutomatedAction(game: GameState): GameAction | null {
  const playerId = game.currentPlayerId
  if (!playerId) return null
  if (game.phase === 'awaitingRoll') return { type: 'ROLL', playerId, dice: rollDemoDice() }
  if (game.phase === 'awaitingPurchase') {
    const player = game.players.find((candidate) => candidate.id === playerId)
    const price = game.pendingPurchase?.price ?? Number.MAX_SAFE_INTEGER
    return player && player.cash > price + 180
      ? { type: 'BUY_PROPERTY', playerId }
      : { type: 'DECLINE_PROPERTY', playerId }
  }
  if (game.phase === 'auction' && game.auction) {
    const bidder = game.players.find((candidate) => game.auction!.eligiblePlayerIds.includes(candidate.id) && !game.auction!.passedPlayerIds.includes(candidate.id) && candidate.status === 'active')
    if (!bidder) return { type: 'EXPIRE_AUCTION' }
    const nextBid = game.auction.highestBid + 20
    return bidder.cash > nextBid + 100
      ? { type: 'PLACE_BID', playerId: bidder.id, amount: nextBid }
      : { type: 'PASS_BID', playerId: bidder.id }
  }
  if (game.phase === 'awaitingEndTurn') return { type: 'END_TURN', playerId }
  if (game.phase === 'awaitingDebt' && game.debt) {
    const debtor = game.players.find((candidate) => candidate.id === game.debt!.playerId)
    return debtor && debtor.cash >= game.debt.amount
      ? { type: 'PAY_DEBT', playerId: game.debt.playerId }
      : { type: 'DECLARE_BANKRUPTCY', playerId: game.debt.playerId }
  }
  return null
}

export default function App() {
  const { user, loading, signOut } = useAuth()
  const [screen, setScreen] = useState<'auth' | 'lobby' | 'game'>(isSupabaseConfigured ? 'auth' : 'auth')
  const [game, setGame] = useState<GameState>(() => createDemoGame())
  const [notice, setNotice] = useState<string | null>(null)

  const displayName = useMemo(() => {
    const metadataName = user?.user_metadata?.full_name ?? user?.user_metadata?.name
    return typeof metadataName === 'string' && metadataName.trim() ? metadataName : user?.email?.split('@')[0] ?? 'City guest'
  }, [user])

  useEffect(() => {
    if (user) setScreen((current) => current === 'auth' ? 'lobby' : current)
  }, [user])

  const applyAction = (action: GameAction) => {
    try {
      setGame((current) => reduceGame(current, action, { rollDice: rollDemoDice }))
    } catch (error) {
      setNotice(error instanceof GameRuleError ? error.message : 'That action could not be applied.')
    }
  }

  // The local preview keeps the table lively. Real rooms send the exact same
  // actions to the Edge Function and never run this client-side automation.
  useEffect(() => {
    if (screen !== 'game' || game.status !== 'active' || game.currentPlayerId === LOCAL_PLAYER_ID) return
    const next = chooseAutomatedAction(game)
    if (!next) return
    const timer = window.setTimeout(() => applyAction(next), game.rules.fastAnimations ? 640 : 1_050)
    return () => window.clearTimeout(timer)
  }, [game, screen])

  const openDemo = () => {
    setGame(createDemoGame())
    setScreen('game')
  }

  const returnFromGame = () => setScreen(user ? 'lobby' : 'auth')

  if (loading) {
    return <main className="loading-page"><LoaderCircle className="loading-spinner" size={30} /> Restoring your civic profile…</main>
  }

  const lobby = (
    <LobbyScreen
      displayName={displayName}
      rooms={DEMO_ROOMS}
      onCreate={() => {
        setNotice(isSupabaseConfigured ? 'Create-room wiring is ready after you deploy the Supabase functions.' : 'Opening a local host preview.')
        openDemo()
      }}
      onJoin={() => openDemo()}
      onJoinByCode={(code) => {
        if (code.length < 4) setNotice('Invite codes need at least four characters.')
        else openDemo()
      }}
      onStartDemo={openDemo}
      onSignOut={() => {
        if (user) void signOut()
        setScreen('auth')
      }}
    />
  )

  return (
    <>
      {screen === 'game' ? (
        <GameTable game={game} actorId={LOCAL_PLAYER_ID} onAction={applyAction} onExit={returnFromGame} />
      ) : user || screen === 'lobby' ? (
        lobby
      ) : (
        <AuthPanel onDemoStart={openDemo} onNotice={setNotice} />
      )}
      <Toast message={notice} onDismiss={() => setNotice(null)} />
    </>
  )
}
