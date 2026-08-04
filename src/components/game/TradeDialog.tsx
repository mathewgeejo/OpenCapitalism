import { useEffect, useMemo, useState } from 'react'
import { ArrowLeftRight, Check, CircleAlert, Send, X } from 'lucide-react'
import { BOARD_BY_ID } from '../../game/board'
import type { GameAction, GameViewState, Player, TradeOffer } from '../../game/types'
import { formatCredits } from '../../lib/gamePresentation'

type TradeDialogProps = {
  game: GameViewState
  actorId: string
  onAction: (action: GameAction) => void
  onClose: () => void
}

type TradeAsset = {
  id: string
  name: string
  mortgaged: boolean
  blocked: boolean
}

function isTradeOffer(value: unknown): value is TradeOffer {
  if (!value || typeof value !== 'object') return false
  const trade = value as Partial<TradeOffer>
  return typeof trade.id === 'string'
    && typeof trade.fromPlayerId === 'string'
    && typeof trade.toPlayerId === 'string'
    && Array.isArray(trade.offeredPropertyIds)
    && Array.isArray(trade.requestedPropertyIds)
    && typeof trade.offeredCash === 'number'
    && typeof trade.requestedCash === 'number'
    && typeof trade.status === 'string'
}

function ownedAssets(game: GameViewState, playerId: string | null): TradeAsset[] {
  if (!playerId) return []
  return Object.values(game.properties)
    .filter((property) => property.ownerId === playerId)
    .map((property) => {
      const tile = BOARD_BY_ID[property.tileId]
      return {
        id: property.tileId,
        name: tile?.name ?? property.tileId,
        mortgaged: property.mortgaged,
        blocked: property.buildings > 0,
      }
    })
    .sort((left, right) => (BOARD_BY_ID[left.id]?.index ?? 0) - (BOARD_BY_ID[right.id]?.index ?? 0))
}

function assetNames(ids: readonly string[]): string {
  if (!ids.length) return 'No assets'
  return ids.map((id) => BOARD_BY_ID[id]?.name ?? id).join(', ')
}

function toggleAsset(current: string[], id: string): string[] {
  return current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
}

function positiveWhole(value: string): number {
  const parsed = Number.parseInt(value, 10)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0
}

/**
 * An intentionally small trade desk.  Public snapshots can omit trade detail,
 * so all open-offer rendering is guarded rather than assuming a full local state.
 */
export function TradeDialog({ game, actorId, onAction, onClose }: TradeDialogProps) {
  const actor = game.players.find((player) => player.id === actorId)
  const counterparts = useMemo(
    () => game.players.filter((player) => player.id !== actorId && (player.status === 'active' || player.status === 'detained')),
    [actorId, game.players],
  )
  const [recipientId, setRecipientId] = useState(() => counterparts[0]?.id ?? '')
  const recipient = game.players.find((player) => player.id === recipientId)
  const [offeredIds, setOfferedIds] = useState<string[]>([])
  const [requestedIds, setRequestedIds] = useState<string[]>([])
  const [offeredCash, setOfferedCash] = useState('')
  const [requestedCash, setRequestedCash] = useState('')

  const safeTrades = useMemo(
    () => {
      const source: unknown = (game as { trades?: unknown }).trades
      return Array.isArray(source) ? source.filter(isTradeOffer) : []
    },
    [game],
  )
  const incomingTrades = safeTrades.filter((trade) => trade.status === 'open' && trade.toPlayerId === actorId)
  const myAssets = useMemo(() => ownedAssets(game, actorId), [actorId, game])
  const recipientAssets = useMemo(() => ownedAssets(game, recipientId), [game, recipientId])
  const giveCash = positiveWhole(offeredCash)
  const askCash = positiveWhole(requestedCash)
  const canOffer = Boolean(
    actor
      && counterparts.length
      && game.status === 'active'
      && game.phase !== 'auction'
      && (!game.debt || game.debt.playerId === actorId),
  )
  const cashIsAvailable = giveCash <= (actor?.cash ?? 0) && askCash <= (recipient?.cash ?? 0)
  const hasTradeValue = offeredIds.length + requestedIds.length > 0 || giveCash > 0 || askCash > 0
  const canSubmit = canOffer && Boolean(recipientId) && hasTradeValue && cashIsAvailable

  useEffect(() => {
    if (!recipientId || !counterparts.some((player) => player.id === recipientId)) {
      setRecipientId(counterparts[0]?.id ?? '')
      setRequestedIds([])
      setRequestedCash('')
    }
  }, [counterparts, recipientId])

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  const sendOffer = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit || !recipientId) return
    onAction({
      type: 'OFFER_TRADE',
      playerId: actorId,
      toPlayerId: recipientId,
      offeredPropertyIds: offeredIds,
      requestedPropertyIds: requestedIds,
      offeredCash: giveCash,
      requestedCash: askCash,
    })
    onClose()
  }

  const respond = (tradeId: string, accept: boolean) => {
    onAction({ type: 'RESPOND_TRADE', playerId: actorId, tradeId, accept })
    onClose()
  }

  return (
    <div className="trade-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="trade-dialog" role="dialog" aria-modal="true" aria-labelledby="trade-dialog-title">
        <header className="trade-dialog-header">
          <div>
            <span className="trade-kicker"><ArrowLeftRight size={13} /> NEGOTIATION DESK</span>
            <h2 id="trade-dialog-title">Make an exchange</h2>
          </div>
          <button className="trade-close" type="button" onClick={onClose} aria-label="Close trade desk"><X size={17} /></button>
        </header>

        {incomingTrades.length > 0 && (
          <section className="incoming-trades" aria-label="Incoming trade offers">
            <div className="trade-section-heading">
              <strong>Awaiting your decision</strong><span>{incomingTrades.length}</span>
            </div>
            {incomingTrades.map((trade) => {
              const sender = game.players.find((player) => player.id === trade.fromPlayerId)
              return (
                <article className="incoming-trade" key={trade.id}>
                  <div className="incoming-trade-copy">
                    <strong>{sender?.name ?? 'A player'} proposes an exchange</strong>
                    <span>They give {assetNames(trade.offeredPropertyIds)}{trade.offeredCash > 0 ? ` + ${formatCredits(trade.offeredCash)}` : ''}</span>
                    <span>They ask for {assetNames(trade.requestedPropertyIds)}{trade.requestedCash > 0 ? ` + ${formatCredits(trade.requestedCash)}` : ''}</span>
                  </div>
                  <div className="incoming-trade-actions">
                    <button className="trade-response decline" type="button" onClick={() => respond(trade.id, false)}>Decline</button>
                    <button className="trade-response accept" type="button" onClick={() => respond(trade.id, true)}><Check size={13} /> Accept</button>
                  </div>
                </article>
              )
            })}
          </section>
        )}

        <form className="trade-form" onSubmit={sendOffer}>
          <div className="trade-section-heading">
            <strong>New proposal</strong>
            {actor && <span>Your cash {formatCredits(actor.cash)}</span>}
          </div>
          {!canOffer ? (
            <p className="trade-unavailable"><CircleAlert size={15} /> {game.status !== 'active' ? 'Trades resume when the table is active.' : game.phase === 'auction' ? 'Finish the auction before opening a new trade.' : game.debt?.playerId !== actorId && game.debt ? 'Only the player settling a debt may propose right now.' : 'There is no eligible player to trade with.'}</p>
          ) : (
            <>
              <label className="trade-recipient">
                <span>Trading with</span>
                <select
                  value={recipientId}
                  onChange={(event) => {
                    setRecipientId(event.target.value)
                    setRequestedIds([])
                    setRequestedCash('')
                  }}
                >
                  {counterparts.map((player) => <option key={player.id} value={player.id}>{player.name} · {formatCredits(player.cash)}</option>)}
                </select>
              </label>

              <div className="trade-columns">
                <AssetPicker
                  title="You give"
                  helper="Assets with development cannot be traded."
                  assets={myAssets}
                  selected={offeredIds}
                  onToggle={(id) => setOfferedIds((current) => toggleAsset(current, id))}
                />
                <AssetPicker
                  title={recipient ? `${recipient.name} gives` : 'They give'}
                  helper="Choose the assets you want in return."
                  assets={recipientAssets}
                  selected={requestedIds}
                  onToggle={(id) => setRequestedIds((current) => toggleAsset(current, id))}
                />
              </div>

              <div className="trade-cash-row">
                <CurrencyField label="You add" value={offeredCash} max={actor?.cash ?? 0} onChange={setOfferedCash} />
                <CurrencyField label={recipient ? `${recipient.name} adds` : 'They add'} value={requestedCash} max={recipient?.cash ?? 0} onChange={setRequestedCash} />
              </div>
              {!cashIsAvailable && <p className="trade-validation"><CircleAlert size={14} /> Cash offered cannot exceed either player's available credits.</p>}
              {!hasTradeValue && <p className="trade-validation"><CircleAlert size={14} /> Add an asset or credits to make a proposal.</p>}
              <div className="trade-footer">
                <span>Acceptance rechecks ownership and available credits.</span>
                <button className="trade-send" type="submit" disabled={!canSubmit}><Send size={14} /> Send offer</button>
              </div>
            </>
          )}
        </form>

        {safeTrades.length === 0 && !('decks' in game) && (
          <p className="trade-privacy-note">This live snapshot does not expose other players’ trade terms until they are available to your seat.</p>
        )}
      </section>
    </div>
  )
}

function AssetPicker({
  title,
  helper,
  assets,
  selected,
  onToggle,
}: {
  title: string
  helper: string
  assets: TradeAsset[]
  selected: string[]
  onToggle: (id: string) => void
}) {
  return (
    <fieldset className="trade-assets">
      <legend>{title}</legend>
      <span className="trade-assets-helper">{helper}</span>
      <div className="trade-asset-list">
        {assets.length === 0 ? <span className="trade-empty-assets">No eligible assets</span> : assets.map((asset) => (
          <label className={`trade-asset${selected.includes(asset.id) ? ' selected' : ''}${asset.blocked ? ' blocked' : ''}`} key={asset.id}>
            <input type="checkbox" checked={selected.includes(asset.id)} disabled={asset.blocked} onChange={() => onToggle(asset.id)} />
            <span className="trade-asset-name">{asset.name}</span>
            {asset.blocked ? <small>Developed</small> : asset.mortgaged ? <small>Mortgaged</small> : null}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function CurrencyField({ label, value, max, onChange }: { label: string; value: string; max: number; onChange: (value: string) => void }) {
  return (
    <label className="trade-cash-field">
      <span>{label} <small>up to {formatCredits(max)}</small></span>
      <div><b>$</b><input value={value} inputMode="numeric" placeholder="0" onChange={(event) => onChange(event.target.value.replace(/\D/g, ''))} /></div>
    </label>
  )
}
