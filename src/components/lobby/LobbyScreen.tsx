import { FormEvent, useMemo, useState } from 'react'
import {
  ArrowRight,
  Building2,
  CircleDollarSign,
  Clock3,
  DoorOpen,
  Gamepad2,
  KeyRound,
  LockKeyhole,
  LogOut,
  MapPinned,
  Plus,
  Search,
  Sparkles,
  UsersRound,
  Wifi,
} from 'lucide-react'

export type LobbyRoom = {
  id: string
  title: string
  seats: number
  maxPlayers: number
  visibility: 'public' | 'private' | string
  status: 'waiting' | 'in-progress' | 'paused' | string
  host: string
}

export type CreateRoomOptions = {
  title: string
  visibility: 'public' | 'private'
  maxPlayers: number
  settings: {
    turnSeconds: number
    auctionSeconds: number
    fastAnimation: boolean
    jackpotEnabled: boolean
    startBonus: number
  }
}

export type LobbyScreenProps = {
  displayName: string
  rooms: LobbyRoom[]
  onCreate: (options: CreateRoomOptions) => void
  onJoin: (roomId: string) => void
  onJoinByCode: (code: string) => void
  onStartDemo: () => void
  onSignOut: () => void
}

const lobbyStyles = `
  .cf-lobby {
    min-height: 100vh;
    color: #eaf6f6;
    background:
      radial-gradient(circle at 87% 3%, rgba(81, 212, 197, .13), transparent 28rem),
      radial-gradient(circle at 10% 72%, rgba(230, 170, 95, .10), transparent 31rem),
      #07131e;
  }
  .cf-lobby *, .cf-lobby *::before, .cf-lobby *::after { box-sizing: border-box; }
  .cf-lobby button, .cf-lobby input { font: inherit; }
  .cf-lobby button { cursor: pointer; }
  .cf-lobby button:focus-visible, .cf-lobby input:focus-visible { outline: 3px solid #75e4d6; outline-offset: 3px; }
  .cf-lobby-shell { width: min(1180px, calc(100% - 2.5rem)); margin: 0 auto; }
  .cf-lobby-header {
    display: flex; align-items: center; justify-content: space-between; gap: 1rem;
    min-height: 76px; border-bottom: 1px solid rgba(172, 224, 226, .11);
  }
  .cf-lobby-brand { display: inline-flex; align-items: center; gap: .72rem; color: #f7fcff; text-decoration: none; }
  .cf-lobby-brandmark {
    display: flex; align-items: end; gap: 3px; width: 2.15rem; height: 2.15rem; padding: .36rem;
    border: 1px solid rgba(174, 247, 238, .45); border-radius: 9px; background: rgba(117, 232, 217, .1);
    box-shadow: inset 0 0 0 1px rgba(239, 255, 251, .08);
  }
  .cf-lobby-brandmark i { width: 100%; border-radius: 2px 2px 1px 1px; background: linear-gradient(#b0fff4, #50c7c0); box-shadow: 0 0 12px rgba(106, 236, 221, .5); }
  .cf-lobby-brandmark i:nth-child(1) { height: 42%; }.cf-lobby-brandmark i:nth-child(2) { height: 78%; }.cf-lobby-brandmark i:nth-child(3) { height: 58%; }
  .cf-lobby-brand strong { display: block; font-size: .95rem; font-weight: 780; letter-spacing: .015em; }
  .cf-lobby-brand small { display: block; margin-top: .12rem; color: #7fabb5; font-size: .54rem; font-weight: 800; letter-spacing: .16em; }
  .cf-lobby-account { display: flex; align-items: center; gap: .75rem; }
  .cf-lobby-online { display: flex; align-items: center; gap: .35rem; color: #8db8c0; font-size: .68rem; }
  .cf-lobby-online i { width: 7px; height: 7px; border-radius: 50%; background: #6ce0cd; box-shadow: 0 0 12px rgba(92, 224, 205, .85); }
  .cf-lobby-avatar { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 10px; color: #06232a; background: linear-gradient(135deg, #f0c37d, #c58062); box-shadow: 0 5px 17px rgba(231, 176, 94, .18); font-size: .72rem; font-weight: 900; }
  .cf-lobby-user { min-width: 0; }.cf-lobby-user strong { display: block; max-width: 12rem; overflow: hidden; color: #dff1f3; font-size: .72rem; text-overflow: ellipsis; white-space: nowrap; }.cf-lobby-user span { display: block; margin-top: .08rem; color: #7297a1; font-size: .6rem; }
  .cf-lobby-signout { display: inline-flex; align-items: center; gap: .38rem; padding: .5rem .65rem; border: 1px solid rgba(187, 227, 230, .14); border-radius: 8px; color: #a7c2c9; background: rgba(255,255,255,.025); font-size: .68rem; font-weight: 750; transition: .18s ease; }
  .cf-lobby-signout:hover { color: #effdfd; background: rgba(255,255,255,.08); }
  .cf-lobby-main { padding: clamp(2.2rem, 5vw, 4.8rem) 0 3rem; }
  .cf-lobby-hero { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(17rem, .7fr); gap: clamp(1.5rem, 5vw, 5.5rem); align-items: end; }
  .cf-lobby-kicker { display: flex; align-items: center; gap: .4rem; margin: 0 0 .85rem; color: #81dfd2; font-size: .65rem; font-weight: 850; letter-spacing: .14em; }
  .cf-lobby-title { max-width: 10ch; margin: 0; color: #f0fbfb; font-family: Georgia, 'Times New Roman', serif; font-size: clamp(2.9rem, 6.2vw, 5.55rem); font-weight: 500; line-height: .92; letter-spacing: -.062em; }
  .cf-lobby-title em { color: #edbe79; font-style: normal; }
  .cf-lobby-subtitle { max-width: 36rem; margin: 1.45rem 0 0; color: #9bb8c1; font-size: .95rem; line-height: 1.65; }
  .cf-lobby-hero-actions { display: flex; flex-wrap: wrap; gap: .65rem; margin-top: 1.5rem; }
  .cf-lobby-create, .cf-lobby-demo, .cf-lobby-join { display: inline-flex; align-items: center; justify-content: center; gap: .42rem; min-height: 45px; padding: 0 .92rem; border-radius: 10px; font-size: .74rem; font-weight: 850; transition: transform .16s, filter .16s, background .16s; }
  .cf-lobby-create { border: 0; color: #08242a; background: linear-gradient(135deg, #a7f2e2, #65d4c5); box-shadow: 0 10px 26px rgba(58, 201, 183, .18); }.cf-lobby-create:hover { filter: brightness(1.05); transform: translateY(-1px); }
  .cf-lobby-demo { border: 1px solid rgba(240, 195, 121, .30); color: #f0ce92; background: rgba(229, 168, 84, .075); }.cf-lobby-demo:hover { background: rgba(229, 168, 84, .13); }
  .cf-lobby-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: .55rem; padding: 1rem; border: 1px solid rgba(184, 229, 228, .12); border-radius: 16px; background: linear-gradient(145deg, rgba(22, 54, 63, .72), rgba(9, 27, 38, .72)); box-shadow: 0 20px 55px rgba(0,0,0,.18); }
  .cf-lobby-stat { min-width: 0; padding: .65rem .35rem; }.cf-lobby-stat + .cf-lobby-stat { border-left: 1px solid rgba(188, 231, 230, .12); }.cf-lobby-stat strong { display: block; color: #f0c884; font-family: Georgia, 'Times New Roman', serif; font-size: 1.48rem; font-weight: 500; }.cf-lobby-stat span { display: block; margin-top: .18rem; color: #7c9da7; font-size: .57rem; font-weight: 750; letter-spacing: .06em; text-transform: uppercase; }
  .cf-lobby-content { display: grid; grid-template-columns: minmax(0, 1fr) minmax(17.5rem, 295px); gap: 1.15rem; margin-top: clamp(2rem, 5vw, 4.2rem); align-items: start; }
  .cf-lobby-rooms, .cf-lobby-invite { border: 1px solid rgba(182, 226, 227, .13); border-radius: 17px; background: rgba(9, 28, 38, .72); box-shadow: 0 18px 48px rgba(0,0,0,.12); }
  .cf-lobby-rooms-head { display: flex; align-items: center; justify-content: space-between; gap: .9rem; padding: 1.05rem 1.05rem .85rem; border-bottom: 1px solid rgba(176, 224, 225, .10); }.cf-lobby-section-title { display: flex; align-items: center; gap: .48rem; margin: 0; color: #e2f1f3; font-size: .72rem; font-weight: 850; letter-spacing: .09em; }.cf-lobby-section-title svg { color: #77dace; }.cf-lobby-section-label { color: #6f929c; font-size: .64rem; }
  .cf-lobby-search { position: relative; width: min(13.5rem, 44%); }.cf-lobby-search svg { position: absolute; top: 50%; left: .62rem; color: #6f929c; transform: translateY(-50%); }.cf-lobby-search input { width: 100%; min-height: 32px; padding: .38rem .58rem .38rem 1.9rem; border: 1px solid rgba(183, 229, 229, .13); border-radius: 7px; outline: none; color: #dff3f3; background: rgba(0,0,0,.13); font-size: .67rem; }.cf-lobby-search input::placeholder { color: #60818d; }
  .cf-lobby-room-list { display: grid; gap: .35rem; padding: .52rem; }.cf-lobby-room { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: .8rem; align-items: center; padding: .82rem .8rem; border: 1px solid transparent; border-radius: 11px; background: rgba(255,255,255,.012); transition: background .16s, border-color .16s, transform .16s; }.cf-lobby-room:hover { border-color: rgba(128, 222, 211, .17); background: rgba(82, 184, 177, .075); transform: translateX(2px); }
  .cf-lobby-room-top { display: flex; align-items: center; gap: .5rem; min-width: 0; }.cf-lobby-room-icon { display: grid; flex: 0 0 auto; place-items: center; width: 30px; height: 30px; border-radius: 8px; color: #91e3d7; background: rgba(101, 208, 195, .11); }.cf-lobby-room-name { overflow: hidden; color: #dbedef; font-size: .75rem; font-weight: 780; text-overflow: ellipsis; white-space: nowrap; }.cf-lobby-room-host { display: flex; align-items: center; gap: .22rem; margin-top: .1rem; color: #70919b; font-size: .61rem; }.cf-lobby-room-meta { display: flex; flex-wrap: wrap; gap: .36rem .68rem; margin: .48rem 0 0 2.22rem; color: #7d9da6; font-size: .61rem; }.cf-lobby-room-meta span { display: inline-flex; align-items: center; gap: .22rem; }.cf-lobby-pill { display: inline-flex; align-items: center; gap: .28rem; padding: .3rem .42rem; border-radius: 99px; color: #82decf; background: rgba(85, 203, 185, .09); font-size: .57rem; font-weight: 800; letter-spacing: .045em; text-transform: uppercase; }.cf-lobby-pill[data-state='in-progress'] { color: #efc981; background: rgba(226, 166, 83, .10); }.cf-lobby-pill[data-state='paused'] { color: #b9c7c9; background: rgba(164, 185, 187, .10); }
  .cf-lobby-join { flex: 0 0 auto; min-height: 34px; padding: 0 .65rem; border: 1px solid rgba(135, 223, 213, .28); color: #baf0e8; background: rgba(81, 205, 192, .075); font-size: .65rem; }.cf-lobby-join:hover { color: #07262c; background: #92e5d8; }.cf-lobby-join:disabled { cursor: not-allowed; opacity: .45; }
  .cf-lobby-empty { display: grid; place-items: center; min-height: 17rem; padding: 1.5rem; color: #7899a3; text-align: center; }.cf-lobby-empty svg { margin-bottom: .7rem; color: #6dd6c9; }.cf-lobby-empty strong { display: block; color: #cce5e8; font-size: .78rem; }.cf-lobby-empty p { max-width: 18rem; margin: .36rem 0 0; font-size: .68rem; line-height: 1.55; }
  .cf-lobby-invite { padding: 1.12rem; }.cf-lobby-invite-mark { display: grid; place-items: center; width: 38px; height: 38px; border: 1px solid rgba(236, 193, 118, .27); border-radius: 11px; color: #efc47f; background: rgba(228, 165, 83, .08); }.cf-lobby-invite h2 { margin: 1rem 0 .38rem; color: #e7f3f3; font-family: Georgia, 'Times New Roman', serif; font-size: 1.44rem; font-weight: 500; letter-spacing: -.035em; }.cf-lobby-invite p { margin: 0; color: #85a5ae; font-size: .7rem; line-height: 1.55; }.cf-lobby-code-form { display: grid; gap: .5rem; margin-top: 1.1rem; }.cf-lobby-code-form label { color: #a9c6cc; font-size: .61rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }.cf-lobby-code-row { display: flex; gap: .42rem; }.cf-lobby-code-row input { min-width: 0; flex: 1; min-height: 42px; padding: .55rem .62rem; border: 1px solid rgba(185, 229, 229, .17); border-radius: 8px; outline: none; color: #e9f8f8; background: rgba(0,0,0,.18); font-size: .77rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }.cf-lobby-code-row input::placeholder { color: #4e707b; font-weight: 600; letter-spacing: .08em; }.cf-lobby-code-row input:focus { border-color: #73dacc; box-shadow: 0 0 0 3px rgba(91,214,202,.12); }.cf-lobby-code-row button { display: inline-flex; align-items: center; justify-content: center; width: 42px; min-width: 42px; border: 0; border-radius: 8px; color: #07262b; background: #99e9da; }.cf-lobby-code-row button:hover { filter: brightness(1.04); }.cf-lobby-code-error { margin-top: .1rem !important; color: #f0b987 !important; font-size: .62rem !important; }.cf-lobby-invite-note { display: flex; align-items: flex-start; gap: .45rem; margin-top: 1rem; padding-top: .9rem; border-top: 1px solid rgba(186, 225, 228, .10); color: #6f929c; font-size: .61rem; line-height: 1.45; }.cf-lobby-invite-note svg { flex: 0 0 auto; margin-top: .05rem; color: #72d9cc; }
  @media (max-width: 820px) { .cf-lobby-hero { grid-template-columns: 1fr; }.cf-lobby-stats { max-width: 30rem; }.cf-lobby-content { grid-template-columns: 1fr; }.cf-lobby-invite { display: grid; grid-template-columns: auto minmax(0,1fr); column-gap: 1rem; }.cf-lobby-invite h2, .cf-lobby-invite > p, .cf-lobby-code-form, .cf-lobby-invite-note { grid-column: 2; }.cf-lobby-invite-mark { grid-row: span 4; align-self: start; } }
  @media (max-width: 580px) { .cf-lobby-shell { width: min(100% - 1.25rem, 1180px); }.cf-lobby-header { min-height: 65px; }.cf-lobby-online, .cf-lobby-user span, .cf-lobby-signout span { display: none; }.cf-lobby-account { gap: .48rem; }.cf-lobby-signout { padding: .52rem; }.cf-lobby-main { padding-top: 2.3rem; }.cf-lobby-subtitle { font-size: .85rem; }.cf-lobby-stats { gap: 0; }.cf-lobby-stat strong { font-size: 1.28rem; }.cf-lobby-stat span { font-size: .5rem; }.cf-lobby-rooms-head { align-items: flex-start; }.cf-lobby-search { width: 42%; }.cf-lobby-search input { font-size: .6rem; }.cf-lobby-room { padding: .72rem .64rem; }.cf-lobby-room-meta { margin-left: 0; }.cf-lobby-room-host { display: none; }.cf-lobby-invite { display: block; }.cf-lobby-invite-mark { margin-bottom: .8rem; }.cf-lobby-invite h2, .cf-lobby-invite > p, .cf-lobby-code-form, .cf-lobby-invite-note { grid-column: auto; } }
  @media (prefers-reduced-motion: reduce) { .cf-lobby *, .cf-lobby *::before, .cf-lobby *::after { transition-duration: .001ms !important; } }
`

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return (parts.length ? parts.slice(0, 2).map((part) => part[0]).join('') : '?').toUpperCase()
}

function readableStatus(status: LobbyRoom['status']) {
  return status.replace(/[-_]/g, ' ')
}

export function LobbyScreen({
  displayName,
  rooms,
  onCreate,
  onJoin,
  onJoinByCode,
  onStartDemo,
  onSignOut,
}: LobbyScreenProps) {
  const [query, setQuery] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [codeError, setCodeError] = useState('')
  const [creating, setCreating] = useState(false)
  const [roomTitle, setRoomTitle] = useState(`${displayName || 'My'}'s City Table`)
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')
  const [maxPlayers, setMaxPlayers] = useState(20)
  const [turnSeconds, setTurnSeconds] = useState(30)
  const [auctionSeconds, setAuctionSeconds] = useState(20)
  const [startBonus, setStartBonus] = useState(200)
  const [fastAnimation, setFastAnimation] = useState(true)
  const [jackpotEnabled, setJackpotEnabled] = useState(false)

  const publicRooms = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return rooms.filter((room) => {
      const isPublic = room.visibility.toLowerCase() === 'public'
      return isPublic && (!normalizedQuery || `${room.title} ${room.host}`.toLowerCase().includes(normalizedQuery))
    })
  }, [query, rooms])

  const waitingRooms = publicRooms.filter((room) => room.status.toLowerCase() === 'waiting')

  const submitInvite = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const code = inviteCode.trim()
    if (!code) {
      setCodeError('Enter the invite code from your host.')
      return
    }
    setCodeError('')
    onJoinByCode(code)
  }

  const submitCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const title = roomTitle.trim()
    if (title.length < 2) return
    onCreate({
      title,
      visibility,
      maxPlayers,
      settings: { turnSeconds, auctionSeconds, fastAnimation, jackpotEnabled, startBonus },
    })
    setCreating(false)
  }

  return (
    <div className="cf-lobby">
      <style>{lobbyStyles}</style>
      <div className="cf-lobby-shell">
        <header className="cf-lobby-header">
          <a className="cf-lobby-brand" href="#lobby" aria-label="Civic Fortune lobby">
            <span className="cf-lobby-brandmark" aria-hidden="true"><i /><i /><i /></span>
            <span>
              <strong>Civic Fortune</strong>
              <small>The city is yours</small>
            </span>
          </a>

          <div className="cf-lobby-account">
            <span className="cf-lobby-online"><i /> Connected</span>
            <span className="cf-lobby-avatar" aria-hidden="true">{initials(displayName)}</span>
            <span className="cf-lobby-user"><strong>{displayName || 'Guest player'}</strong><span>Your civic profile</span></span>
            <button className="cf-lobby-signout" type="button" onClick={onSignOut} aria-label="Sign out"><LogOut size={14} /><span>Sign out</span></button>
          </div>
        </header>

        <main className="cf-lobby-main">
          <section className="cf-lobby-hero" aria-labelledby="lobby-title">
            <div>
              <p className="cf-lobby-kicker"><Sparkles size={14} /> LIVE CITY TABLES</p>
              <h1 id="lobby-title" className="cf-lobby-title">Find your next <em>city.</em></h1>
              <p className="cf-lobby-subtitle">Choose an open public table, bring an invite code, or start a new game and set the terms for your skyline.</p>
              <div className="cf-lobby-hero-actions">
                <button className="cf-lobby-create" type="button" onClick={() => setCreating(true)}><Plus size={16} /> Create a table</button>
                <button className="cf-lobby-demo" type="button" onClick={onStartDemo}><Gamepad2 size={16} /> Explore the demo</button>
              </div>
            </div>
            <div className="cf-lobby-stats" aria-label="Lobby statistics">
              <div className="cf-lobby-stat"><strong>{waitingRooms.length}</strong><span>Open tables</span></div>
              <div className="cf-lobby-stat"><strong>{publicRooms.reduce((total, room) => total + room.seats, 0)}</strong><span>Players seated</span></div>
              <div className="cf-lobby-stat"><strong>20</strong><span>Seats per city</span></div>
            </div>
          </section>

          <section className="cf-lobby-content" aria-label="Find a game">
            <div className="cf-lobby-rooms">
              <div className="cf-lobby-rooms-head">
                <div>
                  <h2 className="cf-lobby-section-title"><MapPinned size={16} /> Open public tables</h2>
                  <span className="cf-lobby-section-label">{publicRooms.length} {publicRooms.length === 1 ? 'city' : 'cities'} available</span>
                </div>
                <label className="cf-lobby-search">
                  <Search size={14} aria-hidden="true" />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tables" aria-label="Search public tables" />
                </label>
              </div>

              <div className="cf-lobby-room-list">
                {publicRooms.map((room) => {
                  const isWaiting = room.status.toLowerCase() === 'waiting'
                  const isFull = room.seats >= room.maxPlayers
                  return (
                    <article className="cf-lobby-room" key={room.id}>
                      <div>
                        <div className="cf-lobby-room-top">
                          <span className="cf-lobby-room-icon" aria-hidden="true"><Building2 size={16} /></span>
                          <div>
                            <div className="cf-lobby-room-name">{room.title}</div>
                            <div className="cf-lobby-room-host">Hosted by {room.host}</div>
                          </div>
                        </div>
                        <div className="cf-lobby-room-meta">
                          <span><UsersRound size={13} /> {room.seats}/{room.maxPlayers} seats</span>
                          <span><Clock3 size={13} /> {isWaiting ? 'Starting soon' : readableStatus(room.status)}</span>
                          <span className="cf-lobby-pill" data-state={room.status.toLowerCase()}><Wifi size={10} /> {readableStatus(room.status)}</span>
                        </div>
                      </div>
                      <button className="cf-lobby-join" type="button" onClick={() => onJoin(room.id)} disabled={!isWaiting || isFull}>
                        {isFull ? 'Full' : isWaiting ? <>Join <ArrowRight size={13} /></> : 'Watch game'}
                      </button>
                    </article>
                  )
                })}
                {publicRooms.length === 0 && (
                  <div className="cf-lobby-empty">
                    <DoorOpen size={28} aria-hidden="true" />
                    <div><strong>{query ? 'No matching tables' : 'The city is quiet right now'}</strong><p>{query ? 'Try another table name or host name.' : 'Create the first open table and invite the next set of city builders.'}</p></div>
                  </div>
                )}
              </div>
            </div>

            <aside className="cf-lobby-invite" aria-labelledby="invite-title">
              <div className="cf-lobby-invite-mark" aria-hidden="true"><LockKeyhole size={18} /></div>
              <h2 id="invite-title">Have an invite?</h2>
              <p>Private tables stay off the public board. Enter the code shared by your host to claim your seat.</p>
              <form className="cf-lobby-code-form" onSubmit={submitInvite} noValidate>
                <label htmlFor="cf-invite-code">Private table code</label>
                <div className="cf-lobby-code-row">
                  <input id="cf-invite-code" value={inviteCode} onChange={(event) => { setInviteCode(event.target.value); setCodeError('') }} placeholder="Paste invite token" autoComplete="off" maxLength={128} aria-describedby={codeError ? 'cf-invite-error' : undefined} />
                  <button type="submit" aria-label="Join private table"><ArrowRight size={17} /></button>
                </div>
                {codeError && <p id="cf-invite-error" className="cf-lobby-code-error" role="alert">{codeError}</p>}
              </form>
              <div className="cf-lobby-invite-note"><KeyRound size={14} /><span>Paste the exact token shared by your host. Your seat and city progress are saved when you leave.</span></div>
            </aside>
          </section>
        </main>
      </div>
      {creating && (
        <div className="create-room-backdrop" role="presentation" onMouseDown={() => setCreating(false)}>
          <form className="create-room-dialog" onSubmit={submitCreate} onMouseDown={(event) => event.stopPropagation()} aria-label="Create a Civic Fortune table">
            <div className="create-room-heading">
              <span><Plus size={16} /> HOST A CITY</span>
              <button type="button" onClick={() => setCreating(false)} aria-label="Close create table dialog">×</button>
            </div>
            <h2>Set the terms.</h2>
            <label>Table name<input type="text" value={roomTitle} minLength={2} maxLength={60} onChange={(event) => setRoomTitle(event.target.value)} required /></label>
            <div className="create-room-grid">
              <label>Visibility<select value={visibility} onChange={(event) => setVisibility(event.target.value as 'public' | 'private')}><option value="public">Public lobby</option><option value="private">Invite only</option></select></label>
              <label>Seats<select value={maxPlayers} onChange={(event) => setMaxPlayers(Number(event.target.value))}><option value={4}>4 players</option><option value={8}>8 players</option><option value={12}>12 players</option><option value={20}>20 players</option></select></label>
              <label>Turn timer<select value={turnSeconds} onChange={(event) => setTurnSeconds(Number(event.target.value))}><option value={20}>20 seconds</option><option value={30}>30 seconds</option><option value={45}>45 seconds</option><option value={60}>60 seconds</option></select></label>
              <label>Auction timer<select value={auctionSeconds} onChange={(event) => setAuctionSeconds(Number(event.target.value))}><option value={15}>15 seconds</option><option value={20}>20 seconds</option><option value={30}>30 seconds</option><option value={45}>45 seconds</option></select></label>
              <label>Start bonus<select value={startBonus} onChange={(event) => setStartBonus(Number(event.target.value))}><option value={150}>¤150</option><option value={200}>¤200</option><option value={250}>¤250</option><option value={300}>¤300</option></select></label>
            </div>
            <div className="create-room-toggles">
              <label><input type="checkbox" checked={fastAnimation} onChange={(event) => setFastAnimation(event.target.checked)} /> Fast table animations</label>
              <label><input type="checkbox" checked={jackpotEnabled} onChange={(event) => setJackpotEnabled(event.target.checked)} /> Commons jackpot pot</label>
            </div>
            <button className="create-room-submit" type="submit"><Sparkles size={15} /> Open the table</button>
          </form>
        </div>
      )}
    </div>
  )
}

export default LobbyScreen
