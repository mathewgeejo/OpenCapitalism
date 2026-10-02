import { describe, expect, it } from 'vitest'
import { BOARD, getGroupTiles } from './board'
import { BOARD as SERVER_BOARD, DETENTION_INDEX } from '../../supabase/functions/_shared/board'
import { CIVIC_CARDS, EVENT_CARDS } from './cards'
import { createGameState, reduceGame } from './engine'

describe('World Tour board compatibility', () => {
  it('keeps client and server positions, names, prices and rents in sync', () => {
    expect(BOARD).toHaveLength(40)
    expect(SERVER_BOARD).toHaveLength(40)
    for (const tile of BOARD) {
      const server = SERVER_BOARD[tile.index]
      expect(server.id).toBe(tile.id)
      expect(server.name).toBe(tile.name)
      if (server.kind === 'district') {
        expect(server.price).toBe(tile.price)
        expect(server.rents).toEqual(tile.rent)
        expect(server.buildCost).toBe(tile.buildCost)
        expect(server.district).toBe(tile.group)
      }
    }
  })

  it('has four correctly spaced corners and completable country sets', () => {
    expect([0,10,20,30].map(index => BOARD[index].kind)).toEqual(['start','detention','festival','goToDetention'])
    expect(DETENTION_INDEX).toBe(10)
    expect(BOARD.filter(tile => tile.kind === 'transit').map(tile => tile.index)).toEqual([5,15,25,35])
    const groups = new Set(BOARD.filter(tile => tile.kind === 'district').map(tile => tile.group!))
    expect([...groups].map(group => getGroupTiles(group).length)).toEqual([2,3,3,3,3,3,3,2])
    for (const card of [...CIVIC_CARDS, ...EVENT_CARDS]) {
      if (card.effect.type === 'moveTo') expect(BOARD[card.effect.tileIndex]).toBeDefined()
    }
    const parking = CIVIC_CARDS.find(card => card.id === 'civic-commons-visit')!
    expect(parking.effect).toEqual({ type: 'moveTo', tileIndex: 20 })
  })

  it('sends players from the new Go to Jail corner to the new jail position', () => {
    const state = reduceGame(createGameState({id:'world-test', players:[{id:'one',name:'One',color:'#fff'},{id:'two',name:'Two',color:'#aaa'}]}), {type:'START_GAME',playerId:'one'})
    state.players[0].position = 28
    const next = reduceGame(state,{type:'ROLL',playerId:'one',dice:[1,1]})
    expect(next.players[0].position).toBe(10)
    expect(next.players[0].status).toBe('detained')
  })
})
