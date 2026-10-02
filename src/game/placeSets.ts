import { BOARD, BOARD_BY_ID } from './board'
import type { TileId } from './types'

export type PlaceSetId = 'world'
export interface PlaceSetMeta { id: PlaceSetId; label: string; shortLabel: string; locale: string; description: string; accent: string }
export interface PlaceSet extends PlaceSetMeta { names: Readonly<Record<string, string>> }
const world: PlaceSet = { id: 'world', label: 'World Tour', shortLabel: 'World', locale: 'Around the world', description: '22 countries. 40 spaces. One big adventure.', accent: '#42dec4', names: Object.freeze(Object.fromEntries(BOARD.map(tile => [tile.id, tile.name]))) }
export const PLACE_SETS: readonly PlaceSet[] = Object.freeze([world])
export const DEFAULT_PLACE_SET_ID: PlaceSetId = 'world'
export const isPlaceSetId = (value: string | null | undefined): value is PlaceSetId => value === 'world'
export const getPlaceSet = (_id?: string | null): PlaceSet => world
export const getTileDisplayName = (id: TileId, _set?: string | null): string => BOARD_BY_ID[id]?.name ?? id
export const getTileDisplayNameFromSet = (id: TileId, set: PlaceSet): string => set.names[id] ?? BOARD_BY_ID[id]?.name ?? id
