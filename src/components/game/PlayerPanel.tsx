import type { GameViewState } from '../../game/types'
import { formatCredits, getPlayer, getPlayerTile, initials, playerNetWorth } from '../../lib/gamePresentation'

type PlayerPanelProps = {
  game: GameViewState
  selectedPlayerId: string | null
  onSelect: (playerId: string) => void
}

export function PlayerPanel({ game, selectedPlayerId, onSelect }: PlayerPanelProps) {
  const activeId = game.currentPlayerId
  const sorted = [...game.players].sort((left, right) => {
    if (left.id === activeId) return -1
    if (right.id === activeId) return 1
    return playerNetWorth(game, right) - playerNetWorth(game, left)
  })

  return (
    <>
      <div className="sidebar-head">
        <h2 className="sidebar-title">CITY COUNCIL</h2>
        <span className="player-count">{game.players.length}/20 online</span>
      </div>
      <div className="player-list" aria-label="Players">
        {sorted.map((player) => {
          const tile = getPlayerTile(game, player)
          const active = player.id === activeId
          const selected = player.id === selectedPlayerId
          const netWorth = playerNetWorth(game, player)
          const statusLabel = player.status === 'bankrupt'
            ? 'Out of the running'
            : player.status === 'detained'
              ? 'In Civic Hold'
              : `${player.propertyIds.length} assets / ${tile.name}`

          return (
            <button
              className={`player-row${active ? ' active' : ''}${selected ? ' selected' : ''}`}
              type="button"
              key={player.id}
              onClick={() => onSelect(player.id)}
            >
              <span className={`player-avatar${player.status === 'left' ? ' away' : ''}`} style={{ background: player.color }}>
                {initials(player.name)}
              </span>
              <span>
                <span className="player-name">{player.name}{active ? ' / TURN' : ''}</span>
                <span className="player-meta">{statusLabel}</span>
              </span>
              <span className="player-balance" aria-label={`${player.name}: ${formatCredits(player.cash)} cash, ${formatCredits(netWorth)} net worth`}>
                <span className="player-cash">{formatCredits(player.cash)}</span>
                <span className="player-worth">NW {formatCredits(netWorth)}</span>
              </span>
            </button>
          )
        })}
      </div>
    </>
  )
}

export function CurrentPlayerSummary({ game }: { game: GameViewState }) {
  const player = getPlayer(game, game.currentPlayerId)
  if (!player) return null
  return (
    <span className="turn-chip">
      <i style={{ background: player.color }} />
      {player.name}'s turn
    </span>
  )
}
