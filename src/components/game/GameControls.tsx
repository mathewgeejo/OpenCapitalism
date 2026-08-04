import { useEffect, useMemo, useState } from 'react'
import { BadgeDollarSign, CircleStop, Dices, Gavel, HandCoins, KeyRound, Landmark, Pause, Play, SkipForward, X } from 'lucide-react'
import { BOARD_BY_ID, getTileAt } from '../../game/board'
import type { GameAction, GameViewState } from '../../game/types'
import { formatCredits, getPlayer, readablePhase } from '../../lib/gamePresentation'

type GameControlsProps = {
  game: GameViewState
  actorId: string
  onAction: (action: GameAction) => void
}

export function GameControls({ game, actorId, onAction }: GameControlsProps) {
  const [bid, setBid] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const [confirmEnd, setConfirmEnd] = useState(false)

  useEffect(() => {
    if (!game.turnEndsAt) return
    const interval = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(interval)
  }, [game.turnEndsAt])

  useEffect(() => {
    if (game.status === 'complete') setConfirmEnd(false)
  }, [game.status])
  const current = getPlayer(game, game.currentPlayerId)
  const isMyTurn = current?.id === actorId
  const player = getPlayer(game, actorId)
  const tile = current ? getTileAt(current.position) : undefined
  const timerPercent = useMemo(() => {
    if (!game.turnEndsAt) return 100
    const remaining = Math.max(0, game.turnEndsAt - now)
    return Math.min(100, Math.round((remaining / (game.rules.turnTimerSeconds * 1000)) * 100))
  }, [game.turnEndsAt, game.rules.turnTimerSeconds, now])

  const primaryAction = (): { label: string; action: GameAction; icon: typeof Dices } | null => {
    if (game.phase === 'lobby' && game.hostId === actorId) return { label: 'Start table', action: { type: 'START_GAME', playerId: actorId }, icon: Play }
    if (!isMyTurn || !current) return null
    if (game.phase === 'awaitingRoll') {
      return {
        label: current.status === 'detained' ? 'Roll for release' : 'Roll dice',
        action: { type: 'ROLL', playerId: actorId },
        icon: Dices,
      }
    }
    if (game.phase === 'awaitingPurchase' && game.pendingPurchase?.playerId === actorId) return { label: `Buy ${tile?.name ?? 'district'}`, action: { type: 'BUY_PROPERTY', playerId: actorId }, icon: BadgeDollarSign }
    if (game.phase === 'awaitingEndTurn') return { label: 'End turn', action: { type: 'END_TURN', playerId: actorId }, icon: SkipForward }
    if (game.phase === 'awaitingDebt' && game.debt?.playerId === actorId) return { label: `Pay ${formatCredits(game.debt.amount)}`, action: { type: 'PAY_DEBT', playerId: actorId }, icon: HandCoins }
    return null
  }

  const main = primaryAction()
  const MainIcon = main?.icon ?? Play

  const description = (() => {
    if (game.status === 'paused') return 'The host has paused the table. The current turn is preserved.'
    if (game.status === 'complete') return 'The table is complete. Review the final city standings.'
    if (!current) return 'Waiting for the host to start the table.'
    if (!isMyTurn) return `${current.name} is making their move.`
    if (game.phase === 'awaitingRoll' && current.status === 'detained') {
      return 'You are in Civic Hold. Use a permit, pay the fee, or roll doubles to leave.'
    }
    if (game.phase === 'awaitingPurchase') return `You landed on ${tile?.name ?? 'an open district'}.`
    if (game.phase === 'auction') return `Auctioning ${game.auction ? BOARD_BY_ID[game.auction.tileId]?.name ?? 'a district' : 'a district'}.`
    if (game.phase === 'awaitingDebt') return game.debt?.reason ?? 'Settle the city ledger.'
    return readablePhase(game.phase)
  })()

  const turnHeading = game.status === 'paused'
    ? 'Table paused'
    : game.status === 'complete'
      ? 'Table complete'
      : isMyTurn
        ? 'Your move'
        : current
          ? `${current.name}'s move`
          : 'The table is waiting'

  return (
    <section className="turn-control" aria-label="Turn controls">
      <div className="turn-control-inner">
        <span className="turn-timer" style={{ width: `${timerPercent}%` }} />
        <span className="turn-token" style={{ background: current?.color ?? '#7ccfc5' }}>{current ? current.name.slice(0, 1).toUpperCase() : 'C'}</span>
        <div className="turn-copy">
          <p>{turnHeading}</p>
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
          {game.phase === 'awaitingRoll' && isMyTurn && current?.status === 'detained' && (
            <DetentionActions game={game} actorId={actorId} player={current} onAction={onAction} />
          )}
          {main ? (
            <button className="dice-button" type="button" onClick={() => onAction(main.action)}>
              <MainIcon size={16} /> {main.label}
            </button>
          ) : null}
          {game.hostId === actorId && game.status !== 'complete' && (
            <HostTableActions
              game={game}
              actorId={actorId}
              confirmEnd={confirmEnd}
              setConfirmEnd={setConfirmEnd}
              onAction={onAction}
            />
          )}
        </div>
      </div>
    </section>
  )
}

function DetentionActions({
  game,
  actorId,
  player,
  onAction,
}: {
  game: GameViewState
  actorId: string
  player: NonNullable<ReturnType<typeof getPlayer>>
  onAction: (action: GameAction) => void
}) {
  return (
    <div className="detention-actions" role="group" aria-label="Civic Hold release choices">
      <button className="secondary-button" type="button" onClick={() => onAction({ type: 'PAY_DETENTION_FEE', playerId: actorId })}>
        <Landmark size={14} /> Pay {formatCredits(game.rules.detentionFee)}
      </button>
      {player.detentionPasses > 0 && (
        <button className="secondary-button detention-pass" type="button" onClick={() => onAction({ type: 'USE_DETENTION_PASS', playerId: actorId })}>
          <KeyRound size={14} /> Use permit ({player.detentionPasses})
        </button>
      )}
    </div>
  )
}

function HostTableActions({
  game,
  actorId,
  confirmEnd,
  setConfirmEnd,
  onAction,
}: {
  game: GameViewState
  actorId: string
  confirmEnd: boolean
  setConfirmEnd: (value: boolean) => void
  onAction: (action: GameAction) => void
}) {
  if (confirmEnd) {
    return (
      <div className="host-table-actions" role="group" aria-label="Confirm ending the table">
        <button className="secondary-button host-cancel-end" type="button" onClick={() => setConfirmEnd(false)}>
          <X size={14} /> <span>Keep playing</span>
        </button>
        <button className="secondary-button host-end" type="button" onClick={() => onAction({ type: 'END_GAME', playerId: actorId })}>
          <CircleStop size={14} /> <span>Confirm end</span>
        </button>
      </div>
    )
  }

  return (
    <div className="host-table-actions" role="group" aria-label="Host table controls">
      {game.status === 'active' ? (
        <button className="secondary-button host-pause" type="button" onClick={() => onAction({ type: 'PAUSE_GAME', playerId: actorId })}>
          <Pause size={14} /> <span>Pause</span>
        </button>
      ) : game.status === 'paused' ? (
        <button className="secondary-button host-resume" type="button" onClick={() => onAction({ type: 'RESUME_GAME', playerId: actorId })}>
          <Play size={14} /> <span>Resume</span>
        </button>
      ) : null}
      <button className="secondary-button host-end" type="button" onClick={() => setConfirmEnd(true)}>
        <CircleStop size={14} /> <span>End table</span>
      </button>
    </div>
  )
}

function AuctionButtons({
  game,
  actorId,
  bid,
  setBid,
  onAction,
}: {
  game: GameViewState
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
