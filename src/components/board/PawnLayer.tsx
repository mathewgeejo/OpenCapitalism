import { useEffect, useRef, useState } from 'react'
import type { GameViewState } from '../../game/types'
import { BOARD } from '../../game/board'
import { movementPath, pawnPoint } from './layout'

export const DICE_ROLL_MS = 1060
type Props={game:GameViewState;trigger:number;reducedMotion:boolean;onMotionChange?:(busy:boolean)=>void}
export function PawnLayer({game,trigger,reducedMotion,onMotionChange}:Props) {
  const initial=Object.fromEntries(game.players.map(p=>[p.id,p.position]))
  const [positions,setPositions]=useState(initial)
  const previous=useRef({positions:initial,trigger,id:game.id})
  const current=useRef(game)
  current.current=game
  const signature=game.players.map(p=>`${p.id}:${p.position}:${p.status}`).join('|')
  useEffect(()=>{
    const snapshot=current.current
    const next=Object.fromEntries(snapshot.players.map(p=>[p.id,p.position]))
    const old=previous.current
    previous.current={positions:next,trigger,id:snapshot.id}
    if(reducedMotion||old.id!==snapshot.id||trigger<old.trigger){setPositions(next);onMotionChange?.(false);return}
    const rolled=trigger!==old.trigger
    const roll=[...snapshot.events].reverse().find(e=>e.type==='roll'||/\brolled?\b/.test(e.message))
    const paths=Object.fromEntries(snapshot.players.map(player=>{
      const from=old.positions[player.id]??player.position
      const total=rolled && roll?.actorId===player.id && !(player.status==='detained'&&from===player.position) ? (snapshot.lastRoll?.[0]??0)+(snapshot.lastRoll?.[1]??0):0
      return [player.id,from===player.position&&!total?[]:movementPath(from,player.position,total,player.status==='detained')]
    }))
    const steps=Math.max(0,...Object.values(paths).map(path=>path.length))
    if(!steps&&!rolled){setPositions(next);onMotionChange?.(false);return}
    onMotionChange?.(true)
    // Wait for the physical dice, then advance one tile at a time. Long card
    // journeys use shorter steps, without cutting diagonally through the board.
    const stepMs=Math.min(145,Math.floor(2200/Math.max(1,steps)))
    let interval:number|undefined
    const settle=window.setTimeout(()=>{
      if(!steps){setPositions(next);onMotionChange?.(false);return}
      let step=0
      interval=window.setInterval(()=>{
        setPositions(Object.fromEntries(snapshot.players.map(p=>[p.id,paths[p.id][Math.min(step,paths[p.id].length-1)]??next[p.id]])))
        step++
        if(step>=steps){window.clearInterval(interval);onMotionChange?.(false)}
      },stepMs)
    },rolled?DICE_ROLL_MS+80:0)
    return ()=>{window.clearTimeout(settle);window.clearInterval(interval)}
  },[signature,trigger,reducedMotion,game.id,onMotionChange])
  useEffect(()=>()=>onMotionChange?.(false),[onMotionChange])
  const live=game.players.filter(p=>p.status!=='bankrupt'&&p.status!=='left')
  return <g className="pawn-layer">{live.map((player,index)=>{
    const position=positions[player.id]??player.position
    const peers=live.filter(p=>(positions[p.id]??p.position)===position)
    const [x,y]=pawnPoint(position,peers.findIndex(p=>p.id===player.id),peers.length)
    const active=game.currentPlayerId===player.id
    return <g key={player.id} className={reducedMotion?'pawn-piece':'pawn-piece pawn-piece--animated'} transform={`translate(${x} ${y})`} data-player={player.id} data-position={position} role="img" aria-label={`${player.name}, ${BOARD[position]?.name}`} pointerEvents="none">
      <title>{player.name} / {BOARD[position]?.name}</title>
      <ellipse rx="5" ry="2.4" fill={player.color} stroke="#fff" strokeWidth=".65"/>
      <path d="M-4-2 Q-3-6-2-9H2Q3-6 4-2Z" fill={player.color} stroke="#edf8ff" strokeWidth=".65"/>
      <circle cy="-11" r="3.5" fill={player.color} stroke="#eef6ff" strokeWidth=".65"/>
      <text textAnchor="middle" y="-9.7" fontSize="4.2" fontWeight="900" fill="#163044">{index+1}</text>
      {active&&<path d="M-2.5-20H2.5L0-17Z" fill="#ffe076"/>}
    </g>
  })}</g>
}
