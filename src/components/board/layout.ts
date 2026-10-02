export const BOARD_CELL = 56
export const project = (x: number, y: number, z = 0): [number, number] => [560 + (x-y)*.87, 70+(x+y)*.48-z]
export const point = (x: number,y: number,z=0) => project(x,y,z).join(',')
export const face = (x: number,y: number,w: number,d: number,z=0) => [point(x,y,z),point(x+w,y,z),point(x+w,y+d,z),point(x,y+d,z)].join(' ')
export function boardPosition(index: number): [number,number] {
  const i=((index%40)+40)%40
  if(i<=10) return [10-i,10]
  if(i<=20) return [0,20-i]
  if(i<=30) return [i-20,0]
  return [10,i-30]
}
export function tileLayout(index: number) {
  const [col,row]=boardPosition(index)
  const center=project(col*56+28,row*56+28)
  const raw=index%10===0 ? [560-center[0],365.68-center[1]] : row===0?[-.48,.87]:row===10?[.48,-.87]:col===0?[.48,.87]:[-.48,-.87]
  const length=Math.hypot(...raw)
  const normal:[number,number]=[raw[0]/length,raw[1]/length]
  return {center,normal,angle:col===0||col===10?-28.89:28.89}
}
/** Offset into the board in screen space, then invert the ground projection. */
export function assetOrigin(index: number,height:number): [number,number] {
  const {center,normal}=tileLayout(index)
  const distance=88+Math.max(0,normal[1]*height)
  const sx=center[0]+normal[0]*distance-560
  const sy=center[1]+normal[1]*distance-70
  return [(sx/.87+sy/.48)/2, (sy/.48-sx/.87)/2]
}
export function pawnPoint(index:number,slot:number,count:number): [number,number] {
  const {center,normal}=tileLayout(index)
  const columns=Math.min(5,count),rows=Math.ceil(count/columns)
  const tangent=(slot%columns-(columns-1)/2)*11
  const depth=(Math.floor(slot/columns)-(rows-1)/2)*8
  const distance=47+Math.max(0,normal[1]*15)+depth
  return [center[0]+normal[0]*distance+normal[1]*tangent,center[1]+normal[1]*distance-normal[0]*tangent]
}
export function movementPath(from:number,to:number,diceTotal=0,detained=false): number[] {
  const path:number[]=[]
  let at=from
  if(diceTotal) for(let i=0;i<diceTotal;i++){at=(at+1)%40;path.push(at)}
  if(at!==to) {
    if(detained) path.push(to)
    else {
      const distance=(to-at+40)%40
      const backwards=distance===37
      for(let i=0;i<(backwards?3:distance);i++){at=(at+(backwards?39:1))%40;path.push(at)}
    }
  }
  return path
}

type Plot = {index:number;height:number}
type Rect = {x:number;y:number;w:number;h:number}
const overlaps=(a:Rect,b:Rect)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y
const labels=Array.from({length:40},(_,index)=>{
  const {center,angle}=tileLayout(index),r=angle*Math.PI/180
  return {center,u:[Math.cos(r),Math.sin(r)],v:[-Math.sin(r),Math.cos(r)]}
})
function touchesLabel(rect:Rect) {
  const x=rect.x+rect.w/2,y=rect.y+rect.h/2
  return labels.some(({center,u,v})=>{
    if(Math.abs(x-center[0])>rect.w/2+38||Math.abs(y-center[1])>rect.h/2+38) return false
    const dx=x-center[0],dy=y-center[1]
    return Math.abs(dx*u[0]+dy*u[1])<28+Math.abs(u[0])*rect.w/2+Math.abs(u[1])*rect.h/2 && Math.abs(dx*v[0]+dy*v[1])<27+Math.abs(v[0])*rect.w/2+Math.abs(v[1])*rect.h/2
  })
}
const placementCache=new Map<string,Map<number,{cx:number;cy:number;scale:number;bounds:Rect}>>()
/** Reserve the labels, pawn lane and dice table before placing any scenery.
 * Near corners, an inward offset from one edge can cross the adjacent edge;
 * testing the complete silhouette avoids cutting that building with a label.
 */
export function placeAssets(plots:Plot[],seats=4) {
  const key=seats+':'+plots.map(p=>p.index+','+p.height).join(';')
  const cached=placementCache.get(key)
  if(cached) return cached
  const reserved:Rect[]=[{x:462,y:268,w:196,h:190}]
  for(let index=0;index<40;index++) {
    const points=Array.from({length:Math.max(1,seats)},(_,slot)=>pawnPoint(index,slot,Math.max(1,seats)))
    const minX=Math.min(...points.map(p=>p[0]))-6,maxX=Math.max(...points.map(p=>p[0]))+6
    const minY=Math.min(...points.map(p=>p[1]))-21,maxY=Math.max(...points.map(p=>p[1]))+4
    reserved.push({x:minX,y:minY,w:maxX-minX,h:maxY-minY})
  }
  const candidates:Array<[number,number]>=[]
  for(let y=140;y<=610;y+=12) for(let x=100;x<=1020;x+=12) candidates.push([x,y])
  const sorted=[...plots].sort((a,b)=>b.height-a.height)
  // All pieces use the same scale. Reserve capacity for future construction
  // instead of shrinking individual buildings into inconsistent tiny models.
  const startScale=Math.min(1,Math.sqrt(42000/Math.max(1,plots.reduce((area,p)=>area+58*(p.height+18),0))))
  for(let scale=startScale;scale>.09;scale*=.85) {
    const occupied=[...reserved]
    const result=new Map<number,{cx:number;cy:number;scale:number;bounds:Rect}>()
    for(const plot of sorted) {
      const preferred=project(...assetOrigin(plot.index,plot.height*scale))
      const choices=[preferred,...candidates].map(point=>({point,score:(point[0]-preferred[0])**2+(point[1]-preferred[1])**2})).sort((a,b)=>a.score-b.score)
      for(const {point:[sx,sy]} of choices) {
        const bounds={x:sx-29*scale,y:sy-plot.height*scale,w:58*scale,h:(plot.height+18)*scale}
        const inside=[[bounds.x,bounds.y],[bounds.x+bounds.w,bounds.y],[bounds.x+bounds.w,bounds.y+bounds.h],[bounds.x,bounds.y+bounds.h]].every(([x,y])=>Math.abs(x-560)/510+Math.abs(y-365.68)/281<1)
        if(!inside||touchesLabel(bounds)||occupied.some(rect=>overlaps(bounds,rect))) continue
        const x=sx-560,y=sy-70
        result.set(plot.index,{cx:(x/.87+y/.48)/2,cy:(y/.48-x/.87)/2,scale,bounds})
        occupied.push(bounds)
        break
      }
      if(!result.has(plot.index)) break
    }
    if(result.size===plots.length) {
      if(placementCache.size>=16) placementCache.delete(placementCache.keys().next().value!)
      placementCache.set(key,result)
      return result
    }
  }
  throw new Error('The board could not allocate a complete asset plot.')
}
