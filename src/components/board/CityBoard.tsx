import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { Minus, Plus, RotateCcw } from 'lucide-react'
import { BOARD } from '../../game/board'
import type { GameViewState, Tile } from '../../game/types'
import { DiceRoller } from '../game/DiceRoller'
import { type PlaceSetId } from '../../game/placeSets'
import { CountryFlag } from './CountryFlag'
import { BOARD_CELL as SIZE, project, point, face, boardPosition, tileLayout, placeAssets } from './layout'
import { PawnLayer } from './PawnLayer'
import { BoardCards } from './BoardCards'
export { boardPosition } from './layout'

function Block({x,y,w=21,d=w,h,color,roof='#64717e',windows=true,base=0,wall='#89939e'}: {x:number;y:number;w?:number;d?:number;h:number;color:string;roof?:string;windows?:boolean;base?:number;wall?:string}) {
  const top=base+h
  return <g pointerEvents="none">
    {/* Both camera-facing walls must meet at the FRONT corner (x+w,y+d).
        Drawing the rear wall here leaves half the silhouette empty. */}
    <polygon points={[point(x,y+d,base),point(x+w,y+d,base),point(x+w,y+d,top),point(x,y+d,top)].join(' ')} fill={wall} stroke="#34454f" strokeWidth=".5" />
    <polygon points={[point(x+w,y,base),point(x+w,y+d,base),point(x+w,y+d,top),point(x+w,y,top)].join(' ')} fill={wall} stroke="#34454f" strokeWidth=".5" />
    <polygon points={[point(x+w,y,base),point(x+w,y+d,base),point(x+w,y+d,top),point(x+w,y,top)].join(' ')} fill="#1a2937" opacity=".28" />
    {windows && Array.from({length:Math.max(0,Math.floor((h-3)/7))},(_,floor)=><g key={floor}>
      {Array.from({length:Math.floor((w-5)/5)},(_,i)=>5+i*5).map(v=><polygon key={v} points={[point(x+v,y+d,base+floor*7+4),point(x+v+3,y+d,base+floor*7+4),point(x+v+3,y+d,Math.min(top-2,base+floor*7+7)),point(x+v,y+d,Math.min(top-2,base+floor*7+7))].join(' ')} fill={floor%4===1?'#bbcad0':'#c0c7c9'} stroke="#637884" strokeWidth=".35" />)}
      {Array.from({length:Math.floor((d-5)/5)},(_,i)=>4+i*5).map(v=><polygon key={v} points={[point(x+w,y+v,base+floor*7+4),point(x+w,y+v+3,base+floor*7+4),point(x+w,y+v+3,Math.min(top-2,base+floor*7+7)),point(x+w,y+v,Math.min(top-2,base+floor*7+7))].join(' ')} fill="#93aab5" stroke="#4d6571" strokeWidth=".35" />)}
    </g>)}
    <polygon points={face(x,y,w,d,top)} fill={color} stroke={color} strokeWidth="1" />
    <polygon points={face(x+2.5,y+2.5,w-5,d-5,top+.1)} fill={roof} stroke="#253c49" strokeWidth=".5" />
    <path d={`M ${point(x,y+d,base)} L ${point(x,y+d,top)} M ${point(x+w,y+d,base)} L ${point(x+w,y+d,top)} M ${point(x+w,y,base)} L ${point(x+w,y,top)}`} stroke={color} strokeWidth="1.3" />
    <path d={`M ${point(x,y+d,base+1)} L ${point(x+w,y+d,base+1)} L ${point(x+w,y,base+1)}`} stroke={color} strokeWidth="1.5" />
    {windows && h>23 && <polygon points={[point(x+w/2-2,y+d,base),point(x+w/2+2,y+d,base),point(x+w/2+2,y+d,base+7),point(x+w/2-2,y+d,base+7)].join(' ')} fill="#32495c" />}
  </g>
}
function CountryBuilding({tile,x,y,level}: {tile:Tile;x:number;y:number;level:number}) {
  const hotel=level===5
  const accent=hotel?'#e56769':'#279e9d'
  const height=level ? [0,24,36,51,67,76][level] : 13+(tile.index%3)*3
  const width=hotel?25:level>=3?22:19
  return <g aria-hidden="true" pointerEvents="none" data-asset={hotel?'hotel':'building'} data-country={tile.name}>
    <Block x={x-2} y={y-2} h={3} w={width+4} color={accent} roof={accent} windows={false} wall="#496875" />
    <Block x={x} y={y} h={height} w={width} color={accent} roof={hotel?'#645b63':'#5d737b'} base={3} />
    {level>=2 && <Block x={x+5} y={y+5} w={8} d={7} h={3} base={height+3} color="#86939c" roof="#76848d" windows={false} wall="#819099" />}
    {hotel && <g transform={`translate(${project(x+width/2,y+width/2,height+11).join(' ')})`}><path d="M0 5V0" stroke="#d0787e" strokeWidth="2"/><rect x="-5" y="-7" width="10" height="10" rx="1" fill="#dd5e69" stroke="#ef9595" strokeWidth=".5"/><text textAnchor="middle" y="1" fill="white" fontSize="7" fontWeight="900">H</text></g>}
  </g>
}
function Car({x,y,color='#e76554',police=false}: {x:number;y:number;color?:string;police?:boolean}) {
  const [cx,cy]=project(x+15,y+8)
  return <g pointerEvents="none" aria-hidden="true" data-asset="car">
    <Block x={x} y={y} w={30} d={14} h={7} base={3} color={color} wall={color} roof={color} windows={false}/>
    <Block x={x+9} y={y+1} w={13} d={12} h={6} base={10} color={color} wall="#83b8ce" roof={police?'#d8e5ee':color} windows={false}/>
    {[5,25].map(v=><g key={v}><ellipse cx={project(x+v,y+15,3)[0]} cy={project(x+v,y+15,3)[1]} rx="3" ry="4" fill="#131b27"/><ellipse cx={project(x+v,y+15,3)[0]} cy={project(x+v,y+15,3)[1]} rx="1.3" ry="2" fill="#8393a3"/></g>)}
    <path d={`M ${point(x+30,y+2,7)} L ${point(x+30,y+5,7)} M ${point(x+30,y+10,7)} L ${point(x+30,y+12,7)}`} stroke="#ffe8aa" strokeWidth="2"/>
    {police&&<g transform={`translate(${cx} ${cy-18})`}><rect x="-4" width="4" height="3" fill="#4c9eff"/><rect width="4" height="3" fill="#fb637b"/></g>}
  </g>
}
function SpecialAsset({tile,x,y}: {tile:Tile;x:number;y:number}) {
  const [cx,cy]=project(x+28,y+20)
  if(tile.kind==='event') return <g transform={`translate(${cx} ${cy-9})`} pointerEvents="none" aria-hidden="true" data-asset="wheel">
    <path d="M-10 18 0-9 10 18M-12 18H12" fill="none" stroke="#889bac" strokeWidth="2.5"/>
    <circle cy="-6" r="13" fill="#1f3448" stroke="#829baa" strokeWidth="2.5"/>
    {['#f25c74','#f8c949','#48cfac','#4ca5ef','#b878df','#ff944d'].map((c,i)=>{const a=i*Math.PI/3;return <g key={c}><path d={`M0 -6 L${Math.cos(a)*13} ${Math.sin(a)*13-6}`} stroke={c} strokeWidth="2"/><rect x={Math.cos(a)*13-3} y={Math.sin(a)*13-9} width="6" height="6" rx="1" fill={c} stroke="#e9e1d0" strokeWidth=".4"/></g>})}<circle cy="-6" r="2.5" fill="#d2e8e9"/>
  </g>
  if(tile.kind==='transit') return <g aria-hidden="true" pointerEvents="none" data-asset="train">
    <path d={`M ${point(x+3,y+9)} L ${point(x+47,y+9)} M ${point(x+3,y+22)} L ${point(x+47,y+22)}`} stroke="#8196a9" strokeWidth="2"/>
    <Block x={x+8} y={y+8} w={34} d={14} h={13} color="#cdd9e0" roof="#839bb2" wall="#c8d4df" windows={false}/>
    <polygon points={[point(x+11,y+22,4),point(x+38,y+22,4),point(x+38,y+22,10),point(x+11,y+22,10)].join(' ')} fill="#334f6b"/>
    {[16,23,30].map(v=><path key={v} d={`M ${point(x+v,y+22,4)} L ${point(x+v,y+22,10)}`} stroke="#b3c6d3" strokeWidth="1"/>)}
    <path d={`M ${point(x+8,y+22,2)} L ${point(x+42,y+22,2)}`} stroke="#e26960" strokeWidth="2"/>
  </g>
  if(tile.kind==='utility') return <g aria-hidden="true" pointerEvents="none"><Block x={x+14} y={y+7} w={25} h={16} color={tile.id==='waterworks'?'#539ac8':'#d5b36d'}/><Block x={x+28} y={y+10} w={8} h={20} base={16} color="#7b8996" windows={false}/></g>
  if(tile.kind==='festival') return <Car x={x+12} y={y+7}/>
  if(tile.kind==='goToDetention') return <Car x={x+12} y={y+7} color="#5579b6" police/>
  if(tile.kind==='detention') return <g pointerEvents="none"><Block x={x+13} y={y+7} w={25} h={18} color="#a1a8ac" roof="#646e7b" windows={false}/>{[5,10,15,20].map(v=><path key={v} d={`M ${point(x+13+v,y+32,2)} L ${point(x+13+v,y+32,17)}`} stroke="#313a4e" strokeWidth="1.5"/>)}</g>
  return <g transform={`translate(${cx} ${cy-3})`} pointerEvents="none" aria-hidden="true"><path d="M-12 6V-10L10-6V10Z" fill={tile.kind==='civic'?'#6284ce':'#b38140'}/><path d="M-12-10 -6-14 15-10 10-6Z" fill={tile.kind==='civic'?'#a4bffc':'#e2b269'}/><path d="M10-6 15-10V6L10 10Z" fill={tile.kind==='civic'?'#3b5999':'#8b6032'}/><text textAnchor="middle" y="4" fill="#fff" fontSize="16" fontWeight="900">{tile.kind==='start'?'>':'$'}</text></g>
}
const limit=(zoom:number)=>Math.max(.85,Math.min(2,zoom))
export const CityBoard = memo(function CityBoard({game,selectedSpaceId,onSelectSpace,reducedMotion,diceTrigger,style,actorId,onMotionChange,onCardOpen,busy=false}: {
  game:GameViewState;selectedSpaceId:string|null;onSelectSpace:(id:string)=>void;reducedMotion:boolean;diceTrigger:number;style?:CSSProperties;placeSetId?:PlaceSetId;actorId?:string;onMotionChange?:(busy:boolean)=>void;onCardOpen?:(open:boolean)=>void;busy?:boolean
}) {
  const [zoom,setZoom]=useState(1)
  const [sceneScale,setSceneScale]=useState(.8)
  const viewport=useRef<SVGSVGElement>(null)
  useEffect(()=>{
    const svg=viewport.current
    if(!svg) return
    const sync=()=>{const rect=svg.getBoundingClientRect();setSceneScale(Math.min(rect.width/1160,rect.height/660))}
    sync()
    const observer=new ResizeObserver(sync)
    observer.observe(svg)
    return ()=>observer.disconnect()
  },[])
  const touches=useRef(new Map<number,{x:number;y:number}>())
  const pinching=useRef(false)
  const pinch=useRef<{distance:number;zoom:number}|null>(null)
  const zoomBy=useCallback((factor:number)=>setZoom(value=>limit(value*factor)),[])
  useEffect(()=>{
    const svg=viewport.current
    if(!svg) return
    const wheel=(event:WheelEvent)=>{event.preventDefault();const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?400:1);zoomBy(Math.exp(-Math.max(-200,Math.min(200,delta))*.0025))}
    svg.addEventListener('wheel',wheel,{passive:false})
    return ()=>svg.removeEventListener('wheel',wheel)
  },[zoomBy])
  const down=(event:PointerEvent<SVGSVGElement>)=>{
    if(event.pointerType!=='touch'){pinching.current=false;return}
    if(touches.current.size===0) pinching.current=false
    touches.current.set(event.pointerId,{x:event.clientX,y:event.clientY})
    if(touches.current.size===2){const [a,b]=[...touches.current.values()];pinch.current={distance:Math.hypot(a.x-b.x,a.y-b.y),zoom};pinching.current=true}
  }
  const move=(event:PointerEvent<SVGSVGElement>)=>{
    if(!touches.current.has(event.pointerId)) return
    touches.current.set(event.pointerId,{x:event.clientX,y:event.clientY})
    if(touches.current.size===2&&pinch.current){const [a,b]=[...touches.current.values()];setZoom(limit(pinch.current.zoom*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,pinch.current.distance)))}
  }
  const up=(event:PointerEvent<SVGSVGElement>)=>{touches.current.delete(event.pointerId);pinch.current=null}
  const active=game.players.find(p=>p.id===game.currentPlayerId)
  const buildingSignature=BOARD.map(tile=>game.properties[tile.id]?.buildings??0).join(',')
  const plots=useMemo(()=>placeAssets(BOARD.filter(tile=>tile.kind!=='district'||game.properties[tile.id]?.buildings).map(tile=>{const level=game.properties[tile.id]?.buildings??0;return {index:tile.index,height:tile.kind==='district'?(level?[0,24,36,51,67,76][level]+18:32):42}}),game.players.length),[buildingSignature,game.players.length])
  const scene=useMemo(()=>{
    const assets=BOARD.filter(tile=>plots.has(tile.index)).map(tile=>{
      const level=game.properties[tile.id]?.buildings??0
      const {cx,cy,scale}=plots.get(tile.index)!
      return {tile,level,cx,cy,scale}
    }).sort((a,b)=>a.cx+a.cy-b.cx-b.cy)
    return <>
      <polygon points={face(-5,-5,626,626,-9)} fill="#303b54" stroke="#3c4b68" strokeWidth="2"/>
      <polygon points={face(-5,-5,626,626)} fill="#252d43" stroke="#52637d" strokeWidth="1"/>
      <polygon points={face(56,56,504,504)} fill="#26374a" stroke="#51657e" strokeWidth="1"/>
      <polygon points={face(95,95,426,426)} fill="#20283d" stroke="#4b637d" strokeWidth="1"/>
      {BOARD.map(tile=>{
        const [col,row]=boardPosition(tile.index),x=col*SIZE,y=row*SIZE
        return <polygon key={tile.id} points={face(x+1,y+1,54,54)} fill={tile.id===selectedSpaceId?'#3c5366':'#29334b'} stroke={tile.id===selectedSpaceId?'#65ead0':'#445674'} strokeWidth={tile.id===selectedSpaceId?2:1}/>
      })}
      <g className="asset-layer">{assets.map(({tile,level,cx,cy,scale})=>{const [px,py]=project(cx,cy);return <g key={tile.id} transform={`translate(${px} ${py}) scale(${scale}) translate(${-px} ${-py})`}>{tile.kind==='district'?<CountryBuilding tile={tile} x={cx-(level>=4?12:10)} y={cy-(level>=4?12:10)} level={level}/>:<SpecialAsset tile={tile} x={cx-28} y={cy-20}/>}</g>})}</g>
      <g className="label-layer">{BOARD.map(tile=>{
        const {center,angle}=tileLayout(tile.index)
        const selected=tile.id===selectedSpaceId
        const country=tile.kind==='district'
        const color=tile.kind==='transit'?'#8398c1':tile.color
        const words=tile.name.length>11?tile.name.split(' '):[tile.name]
        const name=words.length>1?[words.slice(0,-1).join(' '),words.at(-1)]:words
        return <g key={tile.id} className="city-space" transform={`translate(${center.join(' ')}) rotate(${angle})`} role="button" tabIndex={0} aria-pressed={selected} aria-label={`${tile.name}${tile.price?`, $${tile.price}`:''}`} onClick={()=>{if(!pinching.current) onSelectSpace(tile.id)}} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onSelectSpace(tile.id)}}}>
          <rect className="space-ground" x="-26" y="-25" width="52" height="50" rx="2" fill="#252e43" stroke={selected?'#6cf5d8':'#526680'} strokeWidth={selected?2:1}/>
          {country?<g transform="translate(-11 -22) scale(.74)"><CountryFlag country={tile.name}/></g>:<text x="0" y="-10" textAnchor="middle" fill={color} fontSize="15" fontWeight="900">{tile.kind==='event'?'?':tile.kind==='civic'?'$':tile.kind==='start'?'GO':tile.kind==='transit'?'RAIL':tile.kind==='festival'?'P':tile.kind==='utility'?'~':'!'}</text>}
          {name.map((line,i)=><text className="country-name" key={i} x="0" y={name.length===1?5:-1+i*9} textAnchor="middle" fill="#f5f8ff" fontSize={line!.length>11?7:8.5} fontWeight="800">{line}</text>)}
          <rect x="-25.5" y="13" width="51" height="11.5" rx="1" fill={color}/>
          <text className="country-price" x="0" y="21.5" textAnchor="middle" fill="#102138" fontSize="8" fontWeight="900">{tile.price?`$${tile.price}`:tile.kind==='start'?`+$${game.rules.startBonus}`:tile.kind==='levy'?`-$${tile.levy}`:tile.kind==='event'?'CHANCE':tile.kind==='civic'?'COMMUNITY':tile.kind==='festival'?'REST STOP':'JAIL'}</text>
        </g>
      })}</g>
    </>
  },[buildingSignature,plots,game.rules.startBonus,selectedSpaceId,onSelectSpace])
  return <section className="city-board" style={style} aria-label="World Tour game board">
    <div className="city-camera"><button onClick={()=>setZoom(1)}><RotateCcw size={15}/> Fit board</button><span>Fixed camera / scroll or pinch to zoom</span></div>
    <div className="city-scroll">
      <svg ref={viewport} className="city-svg" viewBox={`${560-580/zoom} ${365.68-330/zoom} ${1160/zoom} ${660/zoom}`} data-zoom={zoom.toFixed(3)} aria-label="40 spaces, 11 along each edge including corners" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        {scene}
        <PawnLayer game={game} trigger={diceTrigger} reducedMotion={reducedMotion} onMotionChange={onMotionChange}/>
      </svg>
      <div className="board-center" style={{'--center-zoom':zoom*sceneScale} as CSSProperties}>
        <div className="board-center-turn"><span>TURN {Math.max(1,game.currentTurn)}</span><strong>{game.status==='paused'?'Game paused':busy?'On the move!':game.currentPlayerId===actorId?'Your turn':`${active?.name.split(' ')[0]??'Player'}?s turn`}</strong></div>
        <DiceRoller result={game.lastRoll} trigger={diceTrigger} reducedMotion={reducedMotion} label="Board dice" className="dice-roller--center"/>
        <div className="board-roll-total">{game.lastRoll?`${game.lastRoll[0]} + ${game.lastRoll[1]} = ${game.lastRoll[0]+game.lastRoll[1]}`:'Roll to start your journey'}</div>
        <BoardCards game={game} busy={busy} onOpenChange={onCardOpen}/>
      </div>
    </div>
    <div className="world-status"><i style={{background:active?.color}}/><span>{game.players.filter(p=>p.status!=='bankrupt'&&p.status!=='left').length} pawns in play</span></div>
    <label className="city-legend"><select aria-label="Explore board spaces" value={selectedSpaceId??''} onChange={e=>onSelectSpace(e.target.value)}><option value="" disabled>Explore countries</option>{BOARD.map(tile=><option key={tile.id} value={tile.id}>{tile.name}</option>)}</select></label>
    <div className="city-zoom"><button aria-label="Zoom out" disabled={zoom<=.85} onClick={()=>zoomBy(1/1.15)}><Minus size={17}/></button><span>{Math.round(zoom*100)}%</span><button aria-label="Zoom in" disabled={zoom>=2} onClick={()=>zoomBy(1.15)}><Plus size={17}/></button></div>
  </section>
})
