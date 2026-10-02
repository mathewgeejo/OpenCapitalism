import { useCallback, useEffect, useRef, useState } from 'react'
import { Accessibility, Crown, Handshake, Link2, LogOut, Map, Trees, Trophy, Settings2, X, ChevronRight } from 'lucide-react'
import { CityBoard } from '../board/CityBoard'
import type { GameAction, GameRules, GameViewState } from '../../game/types'
import { BOARD } from '../../game/board'
import { DEFAULT_PLACE_SET_ID, getPlaceSet, isPlaceSetId, PLACE_SETS, type PlaceSetId } from '../../game/placeSets'
import { Brand } from '../Brand'
import { ActivityFeed } from './ActivityFeed'
import { GameControls } from './GameControls'
import { PlayerPanel, CurrentPlayerSummary } from './PlayerPanel'
import { TileInspector } from './TileInspector'
import { TradeDialog } from './TradeDialog'
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
  onPresentationBusy?: (busy: boolean) => void
  onRestart?: (rules: Partial<GameRules>) => void
}

export function GameTable({ game, actorId, connected = false, roomTitle = 'World Tour', roomVisibility = 'public', onCreateInvite, onAction, onExit, onRestart, onPresentationBusy }: GameTableProps) {
  const [selectedTileId, setSelectedTileId] = useState<string | null>('cedar-quay')
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(actorId)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [tradeOpen, setTradeOpen] = useState(false)
  const [animating,setAnimating]=useState(false)
  const [cardOpen,setCardOpen]=useState(false)
  const handleMotion=useCallback((busy:boolean)=>setAnimating(busy),[])
  useEffect(()=>{onPresentationBusy?.(animating||cardOpen)},[animating,cardOpen,onPresentationBusy])
  const rulesRef = useRef<HTMLDialogElement>(null)
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
  const rollEvent = [...game.events].reverse().find((event) => event.type === 'roll' || /\brolled\s+\d/i.test(event.message))
  const rollSignature = rollEvent?.id ?? 'none'
  const completedRolls = game.events.filter((event) => event.type === 'roll' || /\brolled\s+\d/i.test(event.message)).length
  const roundNumber = Math.max(1, Math.floor(completedRolls / Math.max(1, game.players.length)) + 1)

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
    <main className="app-shell city-app">
      <header className="topbar">
        <div className="topbar-left">
          <div className="hud-logo">
            <Brand compact />
            <span><small>YOUR NEXT BIG ADVENTURE</small><strong>OPEN CAPITALISM</strong></span>
          </div>
          <div className="room-label">
            <Trees size={15} />
            <span><strong>{roomTitle}</strong> · {roomVisibility === 'private' ? 'Invite-only table' : 'Public table'}</span>
          </div>
          <span className="round-chip"><small>ROUND</small><strong>{roundNumber}</strong></span>
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
          <button className="topbar-button" type="button" aria-pressed={reducedMotion} onClick={() => setReducedMotion(!reducedMotion)} title="Toggle reduced motion">
            <Accessibility size={15} /> <span className="topbar-button-label">Motion</span>
          </button>
          <button className="topbar-button" type="button" onClick={() => rulesRef.current?.showModal()} title="View game rules"><Settings2 size={15} /><span className="topbar-button-label">Rules</span></button>
          <button className="topbar-button" type="button" onClick={onExit} title="Leave table">
            <LogOut size={15} /> <span className="topbar-button-label">Leave</span>
          </button>
        </div>
      </header>

      <div className="table-heading"><div><span className="table-eyebrow">PACK YOUR BAGS. ROLL THE DICE.</span><h1>Next stop: your empire</h1><p>22 countries. 40 spaces. A world of friendly rivalry.</p></div><div className="table-mode"><span className="mode-dot" />{connected ? 'Multiplayer' : 'Practice table'}<span> / </span>World edition</div></div>
      <div className="game-workspace">
        <section className="table-area">
          <div className="board-canvas">
            <CityBoard
              game={game}
              actorId={actorId}
              onMotionChange={handleMotion}
              onCardOpen={setCardOpen}
              busy={animating}
              selectedSpaceId={selectedTileId}
              onSelectSpace={setSelectedTileId}
              reducedMotion={reducedMotion}
              diceTrigger={rollTrigger}
              placeSetId={placeSet.id}
              style={{ height: '100%' }}
            />
          </div>
          <GameControls game={game} actorId={actorId} onAction={dispatchAction} busy={animating||cardOpen} />
        </section>
        <aside className="game-sidebar">
          <PlayerPanel game={game} selectedPlayerId={selectedPlayerId} onSelect={setSelectedPlayerId} />
          <div className="property-section"><div className="section-label">COUNTRY SPOTLIGHT <ChevronRight size={14} /></div><TileInspector game={game} selectedTileId={selectedTileId} actorId={actorId} placeSetId={placeSet.id} onAction={dispatchAction} /></div>
          <ActivityFeed game={game} />
        </aside>
      </div>
      <span className="sr-only" aria-live="polite">{game.events.at(-1)?.message ?? 'Civic Fortune table ready'}</span>
      <footer className="city-footer"><span><i /> {connected ? 'Connected to your room' : 'Local practice / no account needed'}</span><span>A little luck. A lot of friendly competition.</span><span>OPEN CAPITALISM <b> / </b> EARLY PREVIEW</span></footer>
      <dialog className="rules-dialog" ref={rulesRef} onClick={event => { if(event.target===event.currentTarget) rulesRef.current?.close() }}>
        <div className="rules-heading"><div><span className="table-eyebrow">THIS TABLE</span><h2>House rules</h2></div><button aria-label="Close rules" onClick={() => rulesRef.current?.close()}><X size={20} /></button></div>
        <p>The rules everyone is playing by. Economic settings are fixed once the game begins.</p>
        <dl>{[['Starting balance', formatCredits(game.rules.startingCash)], ['Passing Start', formatCredits(game.rules.startBonus)], ['Turn timer', game.rules.turnTimerSeconds ? `${game.rules.turnTimerSeconds} seconds` : 'Unlimited'], ['Auction timer', `${game.rules.auctionSeconds} seconds`], ['Release fee', formatCredits(game.rules.detentionFee)], ['Community jackpot', game.rules.jackpotEnabled ? 'On' : 'Off']].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        <label className="motion-setting"><span>Reduce animations<small>Keep dice movement to a minimum.</small></span><input type="checkbox" checked={reducedMotion} onChange={event=>setReducedMotion(event.target.checked)} /></label>
        {onRestart && <form className="practice-settings" onSubmit={event=>{event.preventDefault();const data=new FormData(event.currentTarget);onRestart({startingCash:Number(data.get('cash')),startBonus:Number(data.get('bonus')),turnTimerSeconds:Number(data.get('timer')),jackpotEnabled:data.get('jackpot')==='on'});rulesRef.current?.close()}}><h3>Make the next table yours</h3><p>Start a fresh practice game with your house rules.</p><label>Starting balance<input name="cash" type="number" min="1000" max="10000" step="50" defaultValue={game.rules.startingCash} required /></label><label>Passing Start<input name="bonus" type="number" min="0" max="1000" step="10" defaultValue={game.rules.startBonus} required /></label><label>Turn timer<select name="timer" defaultValue={game.rules.turnTimerSeconds}><option value="30">30 seconds</option><option value="60">60 seconds</option><option value="90">90 seconds</option><option value="120">120 seconds</option></select></label><label>Community jackpot<input name="jackpot" type="checkbox" defaultChecked={game.rules.jackpotEnabled} /></label><button type="submit" className="rules-done">Restart practice with these rules</button></form>}
        <button className="rules-done" onClick={()=>rulesRef.current?.close()}>Back to the city</button>
      </dialog>
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
