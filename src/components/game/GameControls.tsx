import { useMemo, useState } from 'react'
import { BadgeDollarSign, Dices, Gavel, HandCoins, Landmark, Pause, Play, SkipForward } from 'lucide-react'
import { BOARD_BY_ID, getTileAt } from '../../game/board'
import type { GameAction, GameState } from '../../game/types'
import { formatCredits, getPlayer, readablePhase } from '../../lib/gamePresentation'

type GameControlsProps = {
  game: GameState
  actorId: string
  onAction: (action: GameAction) => void
}

export function GameControls({ game, actorId, onAction }: GameControlsProps) {
  const [bid, setBid] = useState('')
  const current = getPlayer(game, game.currentPlayerId)
  const isMyTurn = current?.id === actorId
  const player = getPlayer(game, actorId)
  const tile = current ? getTileAt(current.position) : undefined
  const timerPercent = useMemo(() => {
    if (!game.turnEndsAt) return 100
    const remaining = Math.max(0, game.turnEndsAt - Date.now())
    return Math.min(100, Math.round((remaining / (game.rules.turnTimerSeconds * 1000)) * 100))
  }, [game.turnEndsAt, game.rules.turnTimerSeconds, game.version])

  const primaryAction = (): { label: string; action: GameAction; icon: typeof Dices } | null => {
    if (!isMyTurn || !current) return null
    if (game.phase === 'awaitingRoll') return { label: 'Roll dice', action: { type: 'ROLL', playerId: actorId }, icon: Dices }
    if (game.phase === 'awaitingPurchase' && game.pendingPurchase?.playerId === actorId) return { label: `Buy ${tile?.name ?? 'district'}`, action: { type: 'BUY_PROPERTY', playerId: actorId }, icon: BadgeDollarSign }
    if (game.phase === 'awaitingEndTurn') return { label: 'End turn', action: { type: 'END_TURN', playerId: actorId }, icon: SkipForward }
    if (game.phase === 'awaitingDebt' && game.debt?.playerId === actorId) return { label: `Pay ${formatCredits(game.debt.amount)}`, action: { type: 'PAY_DEBT', playerId: actorId }, icon: HandCoins }
    return null
  }

  const main = primaryAction()
  const MainIcon = main?.icon ?? Play

  const description = (() => {
    if (!current) return 'Waiting for the host to start the table.'
    if (!isMyTurn) return `${current.name} is making their move.`
    if (game.phase === 'awaitingPurchase') return `You landed on ${tile?.name ?? 'an open district'}.`
    if (game.phase === 'auction') return `Auctioning ${game.auction ? BOARD_BY_ID[game.auction.tileId]?.name ?? 'a district' : 'a district'}.`
    if (game.phase === 'awaitingDebt') return game.debt?.reason ?? 'Settle the city ledger.'
    return readablePhase(game.phase)
  })()

  return (
    <section className="turn-control" aria-label="Turn controls">
      <div className="turn-control-inner">
        <span className="turn-timer" style={{ width: `${timerPercent}%` }} />
        <span className="turn-token" style={{ background: current?.color ?? '#7ccfc5' }}>{current ? current.name.slice(0, 1).toUpperCase() : 'C'}</span>
        <div className="turn-copy">
          <p>{isMyTurn ? 'Your move' : current ? `${current.name}'s move` : 'The table is waiting'}</p>
          <span>{description}</span>
        </div>
        <div className="turn-actions">
          {game.phase === 'awaitingPurchase' && isMyTurn && (
            <button className="secondary-button" type="button" onClick={() => onAction({ type: 'DECLINE_PROPERTY', playerId: actorId })}>
              <Gavel size={14} /> Auction
            </button>
          )}
          {game.phase === 'auction' && player && player.status === 'active' && (
            <AuctionButtons game={game} actorId={actorId} bid={bid} setBid={setBid} onAction={onAction} />
          )}
          {game.phase === 'awaitingDebt' && isMyTurn && (
            <button className="secondary-button" type="button" onClick={() => onAction({ type: 'DECLARE_BANKRUPTCY', playerId: actorId })}>
              <Landmark size={14} /> Declare insolvency
            </button>
          )}
          {main ? (
            <button className="dice-button" type="button" onClick={() => onAction(main.action)}>
              <MainIcon size={16} /> {main.label}
            </button>
          ) : game.status === 'paused' && game.hostId === actorId ? (
            <button className="dice-button" type="button" onClick={() => onAction({ type: 'RESUME_GAME', playerId: actorId })}>
              <Play size={15} /> Resume
            </button>
          ) : null}
          {game.hostId === actorId && game.status === 'active' && (
            <button className="secondary-button host-pause" type="button" onClick={() => onAction({ type: 'PAUSE_GAME', playerId: actorId })}>
              <Pause size={14} />
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

function AuctionButtons({
  game,
  actorId,
  bid,
  setBid,
  onAction,
}: {
  game: GameState
  actorId: string
  bid: string
  setBid: (value: string) => void
  onAction: (action: GameAction) => void
}) {
  const minimum = (game.auction?.highestBid ?? 0) + 10
  const amount = Number(bid || minimum)
  return (
    <div className="auction-actions">
      <input aria-label="Auction bid" value={bid} inputMode="numeric" placeholder={`${minimum}`} onChange={(event) => setBid(event.target.value.replace(/\D/g, ''))} />
      <button className="secondary-button" type="button" onClick={() => onAction({ type: 'PLACE_BID', playerId: actorId, amount })}>Bid</button>
      <button className="secondary-button" type="button" onClick={() => onAction({ type: 'PASS_BID', playerId: actorId })}>Pass</button>
    </div>
  )
}
