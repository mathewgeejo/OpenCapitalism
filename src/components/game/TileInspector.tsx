import { Building2, Landmark, LockKeyhole, MapPin, Wrench } from 'lucide-react'
import { BOARD_BY_ID } from '../../game/board'
import type { GameAction, GameViewState } from '../../game/types'
import { formatCredits, getPlayer } from '../../lib/gamePresentation'

type TileInspectorProps = {
  game: GameViewState
  selectedTileId: string | null
  actorId: string
  onAction: (action: GameAction) => void
}

export function TileInspector({ game, selectedTileId, actorId, onAction }: TileInspectorProps) {
  const tile = selectedTileId ? BOARD_BY_ID[selectedTileId] : undefined
  if (!tile) return null

  const property = game.properties[tile.id]
  const owner = getPlayer(game, property?.ownerId)
  const canManage = owner?.id === actorId && game.phase !== 'complete' && tile.kind === 'district'
  const rent = tile.rent?.[property?.buildings ?? 0]

  return (
    <aside className="tile-card" aria-label={`${tile.name} details`}>
      <div className="tile-card-top">
        <div>
          <p className="tile-card-kicker">{tile.kind.toUpperCase()} {tile.group ? `· ${tile.group}` : ''}</p>
          <h2>{tile.name}</h2>
        </div>
        {tile.price && <span className="tile-card-value">{formatCredits(tile.price)}</span>}
      </div>
      <div className="tile-card-details">
        <span><MapPin size={12} /> OWNER<strong>{owner?.name ?? 'City bank'}</strong></span>
        <span><Landmark size={12} /> RENT<strong>{rent ? formatCredits(rent) : '—'}</strong></span>
        <span><Building2 size={12} /> DEVELOPMENT<strong>{property?.buildings === 5 ? 'Tower' : `${property?.buildings ?? 0} houses`}</strong></span>
      </div>
      {property?.mortgaged && <p className="tile-warning"><LockKeyhole size={13} /> This asset is mortgaged.</p>}
      {canManage && (
        <div className="tile-actions">
          <button type="button" className="tile-action" onClick={() => onAction({ type: 'BUILD', playerId: actorId, tileId: tile.id })}>
            <Building2 size={14} /> Build {tile.buildCost ? formatCredits(tile.buildCost) : ''}
          </button>
          {property?.buildings ? (
            <button type="button" className="tile-action quiet" onClick={() => onAction({ type: 'SELL_BUILDING', playerId: actorId, tileId: tile.id })}>
              <Wrench size={14} /> Sell a house
            </button>
          ) : (
            <button type="button" className="tile-action quiet" onClick={() => onAction({ type: property?.mortgaged ? 'UNMORTGAGE' : 'MORTGAGE', playerId: actorId, tileId: tile.id })}>
              <LockKeyhole size={14} /> {property?.mortgaged ? 'Restore deed' : 'Mortgage deed'}
            </button>
          )}
        </div>
      )}
    </aside>
  )
}
