import { describe, expect, it } from 'vitest'
import { boardPosition, movementPath, pawnPoint, tileLayout, placeAssets } from './layout'
import { BOARD } from '../../game/board'

describe('Board presentation', () => {
  it('gives each of the 40 spaces a distinct position, with 11 positions per edge', () => {
    const positions=Array.from({length:40},(_,i)=>boardPosition(i))
    expect(new Set(positions.map(p=>p.join(':'))).size).toBe(40)
    for(const edge of [0,10]) {
      expect(positions.filter(([x])=>x===edge)).toHaveLength(11)
      expect(positions.filter(([,y])=>y===edge)).toHaveLength(11)
    }
    for(let i=0;i<40;i++) expect(Math.abs(tileLayout(i).angle)).toBeLessThan(90)
  })
  it('keeps all 20 co-located pawns in distinct slots away from their label', () => {
    for(let index=0;index<40;index++) {
      const points=Array.from({length:20},(_,slot)=>pawnPoint(index,slot,20))
      expect(new Set(points.map(p=>p.join(':'))).size).toBe(20)
      const {center,normal}=tileLayout(index)
      for(const [x,y] of points) expect((x-center[0])*normal[0]+(y-center[1])*normal[1]).toBeGreaterThan(30)
    }
  })
  it('walks around corners, wraps GO, and honors subsequent card movement', () => {
    expect(movementPath(38,3,5)).toEqual([39,0,1,2,3])
    expect(movementPath(8,12,4)).toEqual([9,10,11,12])
    expect(movementPath(4,4,3)).toEqual([5,6,7,6,5,4])
    expect(movementPath(28,10,2,true)).toEqual([29,30,10])
  })
  it('fits a fully developed board without intersecting asset silhouettes', () => {
    const plots=placeAssets(BOARD.map(tile=>({index:tile.index,height:tile.kind==='district'?94:42})),20)
    expect(plots.size).toBe(40)
    const rects=[...plots.values()].map(plot=>plot.bounds)
    for(let i=0;i<rects.length;i++) for(let j=i+1;j<rects.length;j++) {
      const a=rects[i],b=rects[j]
      expect(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y).toBe(false)
    }
  })
})
