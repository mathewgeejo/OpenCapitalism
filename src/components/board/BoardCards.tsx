import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CIVIC_CARDS, EVENT_CARDS } from '../../game/cards'
import type { GameViewState } from '../../game/types'

export function BoardCards({game,busy,onOpenChange}:{game:GameViewState;busy:boolean;onOpenChange?:(open:boolean)=>void}) {
  const dialog=useRef<HTMLDialogElement>(null)
  const latest=[...game.events].reverse().find(event=>event.type==='card')
  const lastSeen=useRef(latest?.id)
  const [drawn,setDrawn]=useState<typeof latest>()
  const [preview,setPreview]=useState<'event'|'civic'|null>(null)
  useEffect(()=>{
    if(latest && latest.id!==lastSeen.current){lastSeen.current=latest.id;setDrawn(latest);setPreview(null)}
  },[latest?.id])
  const card=drawn?[...EVENT_CARDS,...CIVIC_CARDS].find(card=>card.id===drawn.data?.cardId):undefined
  const deck=preview??card?.deck??(drawn?.data?.deck==='civic'?'civic':'event')
  const show=preview||(!busy&&drawn)
  const dismiss=()=>{setPreview(null);setDrawn(undefined)}
  useEffect(()=>{if(show)dialog.current?.showModal();else dialog.current?.close();onOpenChange?.(Boolean(show))},[show,onOpenChange])
  useEffect(()=>()=>onOpenChange?.(false),[onOpenChange])
  const name=deck==='event'?'Chance':'Community'
  const title=preview?`${name} cards`:card?.title??drawn?.message.split(/drew |draws /)[1]??'Card drawn'
  const details=preview?(deck==='event'?'Land on Chance for a surprise: a reward, a bill, or a trip to another space.':'Land on Community for a shared reward, a contribution, a release pass, or a new destination.'):card?.text??game.events.filter(event=>event.sequence>(drawn?.sequence??Infinity)&&event.actorId===drawn?.actorId).map(event=>event.message).join(' ')
  return <>
    <div className="board-decks"><button className="deck-chance" onClick={()=>setPreview('event')} aria-label="About Chance cards"><b>?</b><span>CHANCE</span></button><button className="deck-community" onClick={()=>setPreview('civic')} aria-label="About Community cards"><b>$</b><span>COMMUNITY</span></button></div>
    {createPortal(<dialog ref={dialog} className={`world-card-dialog world-card-dialog--${deck}`} aria-label={`${name} card`} onCancel={event=>{event.preventDefault();dismiss()}}>
      <span className="drawn-card-icon">{deck==='event'?'?':'$'}</span><small>{preview?'HOW TO PLAY':`${game.players.find(p=>p.id===drawn?.actorId)?.name??'A player'} drew ${name}`}</small><h3>{title}</h3><p>{details}</p><button onClick={dismiss}>{preview?'Got it':'Continue'}</button>
    </dialog>,document.body)}
  </>
}
