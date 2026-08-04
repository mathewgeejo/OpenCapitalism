import { BOARD_BY_ID, getTileAt } from '../game/board'
import type { GamePhase, GameViewState, Player, Tile } from '../game/types'

export function formatCredits(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount).replace('$', '¤')
}

export function getPlayer(game: GameViewState, playerId: string | null | undefined): Player | undefined {
  return game.players.find((player) => player.id === playerId)
}

export function getPlayerTile(game: GameViewState, player: Player): Tile {
  return getTileAt(player.position)
}

export function playerNetWorth(game: GameViewState, player: Player): number {
  return player.cash + player.propertyIds.reduce((total, tileId) => {
    const tile = BOARD_BY_ID[tileId]
    const property = game.properties[tileId]
    if (!tile?.price || !property) return total
    const buildingValue = property.buildings * (tile.buildCost ?? 0) * .5
    return total + Math.floor(tile.price * .5) + buildingValue
  }, 0)
}

export function readablePhase(phase: GamePhase): string {
  const labels: Record<GamePhase, string> = {
    lobby: 'Waiting in lobby',
    awaitingRoll: 'Roll the civic dice',
    awaitingPurchase: 'Choose what to do',
    auction: 'Auction in progress',
    awaitingEndTurn: 'Finish your turn',
    awaitingDebt: 'Resolve your debt',
    paused: 'Table paused',
    complete: 'Game complete',
  }
  return labels[phase]
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?'
}

export function eventTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  return Number.isNaN(date.valueOf()) ? 'now' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
