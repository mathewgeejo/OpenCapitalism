import { useCallback, useEffect, useRef, useState } from 'react'
import { Accessibility, Crown, Handshake, Link2, LogOut, Map, Table2, Trees, Trophy, Volume2 } from 'lucide-react'
import { Board3D, type BoardView } from '../board/Board3D'
import type { GameAction, GameViewState } from '../../game/types'
import { BOARD } from '../../game/board'
import { DEFAULT_PLACE_SET_ID, getPlaceSet, isPlaceSetId, PLACE_SETS, type PlaceSetId } from '../../game/placeSets'
import { Brand } from '../Brand'
import { ActivityFeed } from './ActivityFeed'
import { GameControls } from './GameControls'
import { PlayerPanel, CurrentPlayerSummary } from './PlayerPanel'
import { TileInspector } from './TileInspector'
import { TradeDialog } from './TradeDialog'
import { DiceRoller } from './DiceRoller'
import { formatCredits, initials, playerNetWorth } from '../../lib/gamePresentation'

type GameTableProps = {
  game: GameViewState
  actorId: string
  connected?: boolean
  roomTitle?: string
  roomVisibility?: 'public' | 'private'
  onCreateInvite?: () => void
  onAction: (action: GameAction) => void
  onExit: () => void
}

export function GameTable({ game, actorId, connected = false, roomTitle = 'Harbor Assembly', roomVisibility = 'public', onCreateInvite, onAction, onExit }: GameTableProps) {
  const [selectedTileId, setSelectedTileId] = useState<string | null>(BOARD[0]?.id ?? null)
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(actorId)
  const [view, setView] = useState<BoardView>('3d')
  const [reducedMotion, setReducedMotion] = useState(false)
  const [tradeOpen, setTradeOpen] = useState(false)
  const [placeSetId, setPlaceSetId] = useState<PlaceSetId>(() => {
    try {
      const saved = window.localStorage.getItem('civic-fortune:place-set')
      return isPlaceSetId(saved) ? saved : DEFAULT_PLACE_SET_ID
    } catch {
      return DEFAULT_PLACE_SET_ID
    }
  })
  const [rollTrigger, setRollTrigger] = useState(0)
  const rollSignatureRef = useRef<string | null>(null)
  const initialRollRef = useRef(false)
  const pendingLocalRollRef = useRef(false)
  const actor = game.players.find((player) => player.id === actorId)
  const incomingTradeCount = Array.isArray(game.trades)
    ? game.trades.filter((trade) => trade?.status === 'open' && trade.toPlayerId === actorId).length
    : 0
  const canUseTradeDesk = game.status === 'active' && Boolean(actor && (actor.status === 'active' || actor.status === 'detained'))
  const placeSet = getPlaceSet(placeSetId)
  const rollEvent = [...game.events].reverse().find((event) => event.type === 'roll' || /\brolled\b/i.test(event.message))
  const rollSignature = `${rollEvent?.id ?? 'none'}:${game.lastRoll?.join(':') ?? 'none'}`

  useEffect(() => {
    if (!initialRollRef.current) {
      initialRollRef.current = true
      rollSignatureRef.current = rollSignature
      return
    }
    if (rollSignatureRef.current === rollSignature) return
    rollSignatureRef.current = rollSignature
    if (pendingLocalRollRef.current) {
      pendingLocalRollRef.current = false
      return
    }
    setRollTrigger((current) => current + 1)
  }, [rollSignature])

  const dispatchAction = useCallback((action: GameAction) => {
    if (action.type === 'ROLL') {
      pendingLocalRollRef.current = true
      setRollTrigger((current) => current + 1)
      window.setTimeout(() => { pendingLocalRollRef.current = false }, 2_500)
    }
    onAction(action)
  }, [onAction])

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReducedMotion(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    try { window.localStorage.setItem('civic-fortune:place-set', placeSetId) } catch { /* preference storage is optional */ }
  }, [placeSetId])

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="topbar-left">
          <Brand compact />
          <div className="room-label">
            <Trees size={15} />
            <span><strong>{roomTitle}</strong> · {roomVisibility === 'private' ? 'Invite-only table' : 'Public table'}</span>
          </div>
          <CurrentPlayerSummary game={game} />
        </div>
        <div className="topbar-right">
          <span className="connection"><i /> <span>{connected ? 'Live secure room' : 'Local preview'}</span></span>
          {onCreateInvite && game.hostId === actorId && game.phase === 'lobby' && (
            <button className="topbar-button" type="button" onClick={onCreateInvite} title="Create private invite">
              <Link2 size={15} /> <span className="topbar-button-label">Invite</span>
            </button>
          )}
          {canUseTradeDesk && (
            <button className="topbar-button trade-topbar-button" type="button" onClick={() => setTradeOpen(true)} title="Open trade desk">
              <Handshake size={15} /> <span className="topbar-button-label">Trade</span>
              {incomingTradeCount > 0 && <b className="trade-notification" aria-label={`${incomingTradeCount} incoming trade ${incomingTradeCount === 1 ? 'offer' : 'offers'}`}>{incomingTradeCount}</b>}
            </button>
          )}
          <label className="place-set-picker" title="Choose a display-only place-name set">
            <Map size={15} aria-hidden="true" />
            <select value={placeSetId} onChange={(event) => { if (isPlaceSetId(event.target.value)) setPlaceSetId(event.target.value) }} aria-label="Board place-name set">
              {PLACE_SETS.map((set) => <option key={set.id} value={set.id}>{set.shortLabel}</option>)}
            </select>
          </label>
          <button className="topbar-button" type="button" onClick={() => setView(view === '3d' ? 'table' : '3d')} title="Switch board view">
            <Table2 size={15} /> <span className="topbar-button-label">{view === '3d' ? 'Table view' : '3D view'}</span>
          </button>
          <button className="topbar-button" type="button" onClick={() => setReducedMotion(!reducedMotion)} title="Toggle reduced motion">
            <Accessibility size={15} /> <span className="topbar-button-label">Motion</span>
          </button>
          <button className="topbar-button" type="button" onClick={onExit} title="Leave table">
            <LogOut size={15} /> <span className="topbar-button-label">Leave</span>
          </button>
        </div>
      </header>

      <div className="game-workspace">
        <section className="table-area">
          <div className="board-canvas">
            <Board3D
              game={game}
              selectedSpaceId={selectedTileId}
              onSelectSpace={setSelectedTileId}
              view={view}
              reducedMotion={reducedMotion}
              shadows={!reducedMotion}
              style={{ height: '100%', minHeight: '100%' }}
            />
          </div>
          <div className="dice-roll-slot" aria-hidden={game.lastRoll === null}>
            <DiceRoller result={game.lastRoll} trigger={rollTrigger} reducedMotion={reducedMotion} label="Table dice" />
          </div>
          <TileInspector game={game} selectedTileId={selectedTileId} actorId={actorId} placeSetId={placeSet.id} onAction={dispatchAction} />
          <GameControls game={game} actorId={actorId} onAction={dispatchAction} />
        </section>
        <aside className="game-sidebar">
          <PlayerPanel game={game} selectedPlayerId={selectedPlayerId} onSelect={setSelectedPlayerId} />
          <ActivityFeed game={game} />
        </aside>
      </div>
      <span className="sr-only" aria-live="polite">{game.events.at(-1)?.message ?? 'Civic Fortune table ready'}</span>
      <span className="sound-mark" aria-hidden="true"><Volume2 size={13} /> LIVE</span>
      {tradeOpen && <TradeDialog game={game} actorId={actorId} onAction={dispatchAction} onClose={() => setTradeOpen(false)} />}
      {game.status === 'complete' && <GameCompleteOverlay game={game} onExit={onExit} />}
    </main>
  )
}

function GameCompleteOverlay({ game, onExit }: { game: GameViewState; onExit: () => void }) {
  const finalStandings = [...game.players].sort((left, right) => playerNetWorth(game, right) - playerNetWorth(game, left))
  const winner = game.players.find((player) => player.id === game.winnerId)
    ?? finalStandings.find((player) => player.status !== 'bankrupt' && player.status !== 'left')
    ?? finalStandings[0]

  return (
    <section className="game-complete-overlay" role="presentation">
      <div className="game-complete-card" role="dialog" aria-modal="true" aria-labelledby="game-complete-heading">
        <p className="complete-kicker"><Trophy size={15} /> TABLE COMPLETE</p>
        <h1 id="game-complete-heading">Final city standings</h1>
        {winner ? (
          <div className="complete-winner">
            <span className="complete-winner-avatar" style={{ background: winner.color }}>{initials(winner.name)}</span>
            <div>
              <span className="complete-winner-label"><Crown size={14} /> Winner by net worth</span>
              <strong>{winner.name}</strong>
              <span>{formatCredits(playerNetWorth(game, winner))} final net worth</span>
            </div>
          </div>
        ) : (
          <p className="complete-empty">The table closed before a final ranking could be calculated.</p>
        )}
        {finalStandings.length > 0 && (
          <ol className="final-standings" aria-label="Final standings">
            {finalStandings.slice(0, 5).map((player, index) => (
              <li key={player.id} className={player.id === winner?.id ? 'winner' : ''}>
                <span className="final-rank">{index + 1}</span>
                <span className="final-avatar" style={{ background: player.color }}>{initials(player.name)}</span>
                <strong>{player.name}</strong>
                <span>{formatCredits(playerNetWorth(game, player))}</span>
              </li>
            ))}
          </ol>
        )}
        <button className="complete-exit" type="button" onClick={onExit}>
          <LogOut size={15} /> Return to lobby
        </button>
      </div>
    </section>
  )
}
