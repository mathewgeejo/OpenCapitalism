import { Building2, Landmark, LockKeyhole, MapPin, Wrench } from 'lucide-react'
import { BOARD, BOARD_BY_ID } from '../../game/board'
import { getTileDisplayName, type PlaceSetId } from '../../game/placeSets'
import type { GameAction, GameViewState } from '../../game/types'
import { formatCredits, getPlayer } from '../../lib/gamePresentation'

type TileInspectorProps = {
  game: GameViewState
  selectedTileId: string | null
  actorId: string
  placeSetId?: PlaceSetId
  onAction: (action: GameAction) => void
}

export function TileInspector({ game, selectedTileId, actorId, placeSetId, onAction }: TileInspectorProps) {
  const tile = selectedTileId ? BOARD_BY_ID[selectedTileId] : undefined
  if (!tile) return null

  const property = game.properties[tile.id]
  const displayName = getTileDisplayName(tile.id, placeSetId)
  const owner = getPlayer(game, property?.ownerId)
  const isOwnable = tile.kind === 'district' || tile.kind === 'transit' || tile.kind === 'utility'
  const ownsAsset = owner?.id === actorId && isOwnable
  const standardManagement = game.phase === 'awaitingRoll' || game.phase === 'awaitingEndTurn'
  const resolvingDebt = game.phase === 'awaitingDebt' && game.debt?.playerId === actorId
  const canLiquidate = ownsAsset && (standardManagement || resolvingDebt)
  const canBuild = canLiquidate && standardManagement && tile.kind === 'district'
  const canSellBuilding = canLiquidate && tile.kind === 'district' && Boolean(property?.buildings)
  const ownedRouteCount = owner
    ? BOARD.filter((candidate) => candidate.kind === 'transit' && game.properties[candidate.id]?.ownerId === owner.id && !game.properties[candidate.id]?.mortgaged).length
    : 0
  const ownedWorksCount = owner
    ? BOARD.filter((candidate) => candidate.kind === 'utility' && game.properties[candidate.id]?.ownerId === owner.id && !game.properties[candidate.id]?.mortgaged).length
    : 0
  const hasCompleteDistrict = tile.kind === 'district' && tile.group
    ? BOARD.filter((candidate) => candidate.kind === 'district' && candidate.group === tile.group)
      .every((candidate) => game.properties[candidate.id]?.ownerId === owner?.id && !game.properties[candidate.id]?.mortgaged)
    : false
  const listedRent = tile.rent?.[property?.buildings ?? 0]
  const rentLabel = !owner || property?.mortgaged
    ? '—'
    : tile.kind === 'transit'
      ? formatCredits(25 * 2 ** Math.max(0, ownedRouteCount - 1))
      : tile.kind === 'utility'
        ? `${ownedWorksCount >= 2 ? 10 : 4}× roll`
        : listedRent
          ? formatCredits((property?.buildings ?? 0) === 0 && hasCompleteDistrict ? listedRent * 2 : listedRent)
          : '—'

  return (
    <aside className="tile-card" aria-label={`${displayName} details`}>
      <div className="tile-card-top">
        <div>
          <p className="tile-card-kicker">{tile.kind.toUpperCase()} {tile.group ? `· ${tile.group}` : ''}</p>
          <h2>{displayName}</h2>
        </div>
        {tile.price && <span className="tile-card-value">{formatCredits(tile.price)}</span>}
      </div>
      <div className="tile-card-details">
        <span><MapPin size={12} /> OWNER<strong>{owner?.name ?? 'City bank'}</strong></span>
        <span><Landmark size={12} /> RENT<strong>{rentLabel}</strong></span>
        <span><Building2 size={12} /> DEVELOPMENT<strong>{property?.buildings === 5 ? 'Hotel' : `${property?.buildings ?? 0} houses`}</strong></span>
      </div>
      {property?.mortgaged && <p className="tile-warning"><LockKeyhole size={13} /> This asset is mortgaged.</p>}
      {resolvingDebt && ownsAsset && (
        <p className="tile-warning"><Wrench size={13} /> Debt resolution: sell buildings or mortgage assets to raise credits.</p>
      )}
      {canLiquidate && (
        <div className="tile-actions">
          {canBuild && (
            <button type="button" className="tile-action" onClick={() => onAction({ type: 'BUILD', playerId: actorId, tileId: tile.id })}>
              <Building2 size={14} /> Build {tile.buildCost ? formatCredits(tile.buildCost) : ''}
            </button>
          )}
          {canSellBuilding && (
            <button type="button" className="tile-action quiet" onClick={() => onAction({ type: 'SELL_BUILDING', playerId: actorId, tileId: tile.id })}>
              <Wrench size={14} /> Sell a house
            </button>
          )}
          {!property?.buildings && (
            <button type="button" className="tile-action quiet" onClick={() => onAction({ type: property?.mortgaged ? 'UNMORTGAGE' : 'MORTGAGE', playerId: actorId, tileId: tile.id })}>
              <LockKeyhole size={14} /> {property?.mortgaged ? 'Restore deed' : 'Mortgage deed'}
            </button>
          )}
        </div>
      )}
    </aside>
  )
}
