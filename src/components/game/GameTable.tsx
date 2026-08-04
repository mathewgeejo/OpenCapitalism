import { useEffect, useState } from 'react'
import { Accessibility, Link2, LogOut, Table2, Trees, Volume2 } from 'lucide-react'
import { Board3D, type BoardView } from '../board/Board3D'
import type { GameAction, GameViewState } from '../../game/types'
import { BOARD } from '../../game/board'
import { Brand } from '../Brand'
import { ActivityFeed } from './ActivityFeed'
import { GameControls } from './GameControls'
import { PlayerPanel, CurrentPlayerSummary } from './PlayerPanel'
import { TileInspector } from './TileInspector'

type GameTableProps = {
  game: GameViewState
  actorId: string
  connected?: boolean
  roomTitle?: string
  roomVisibility?: 'public' | 'private'
  onCreateInvite?: () => void
  onAction: (action: GameAction) => void
  onExit: () => void
}

export function GameTable({ game, actorId, connected = false, roomTitle = 'Harbor Assembly', roomVisibility = 'public', onCreateInvite, onAction, onExit }: GameTableProps) {
  const [selectedTileId, setSelectedTileId] = useState<string | null>(BOARD[0]?.id ?? null)
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(actorId)
  const [view, setView] = useState<BoardView>('3d')
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReducedMotion(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="topbar-left">
          <Brand compact />
          <div className="room-label">
            <Trees size={15} />
            <span><strong>{roomTitle}</strong> · {roomVisibility === 'private' ? 'Invite-only table' : 'Public table'}</span>
          </div>
          <CurrentPlayerSummary game={game} />
        </div>
        <div className="topbar-right">
          <span className="connection"><i /> <span>{connected ? 'Live secure room' : 'Local preview'}</span></span>
          {onCreateInvite && game.hostId === actorId && game.phase === 'lobby' && (
            <button className="topbar-button" type="button" onClick={onCreateInvite} title="Create private invite">
              <Link2 size={15} /> <span className="topbar-button-label">Invite</span>
            </button>
          )}
          <button className="topbar-button" type="button" onClick={() => setView(view === '3d' ? 'table' : '3d')} title="Switch board view">
            <Table2 size={15} /> <span className="topbar-button-label">{view === '3d' ? 'Table view' : '3D view'}</span>
          </button>
          <button className="topbar-button" type="button" onClick={() => setReducedMotion(!reducedMotion)} title="Toggle reduced motion">
            <Accessibility size={15} /> <span className="topbar-button-label">Motion</span>
          </button>
          <button className="topbar-button" type="button" onClick={onExit} title="Leave table">
            <LogOut size={15} /> <span className="topbar-button-label">Leave</span>
          </button>
        </div>
      </header>

      <div className="game-workspace">
        <section className="table-area">
          <div className="board-canvas">
            <Board3D
              game={game}
              selectedSpaceId={selectedTileId}
              onSelectSpace={setSelectedTileId}
              view={view}
              reducedMotion={reducedMotion}
              shadows={!reducedMotion}
              style={{ height: '100%', minHeight: '100%' }}
            />
          </div>
          <TileInspector game={game} selectedTileId={selectedTileId} actorId={actorId} onAction={onAction} />
          <GameControls game={game} actorId={actorId} onAction={onAction} />
        </section>
        <aside className="game-sidebar">
          <PlayerPanel game={game} selectedPlayerId={selectedPlayerId} onSelect={setSelectedPlayerId} />
          <ActivityFeed game={game} />
        </aside>
      </div>
      <span className="sr-only" aria-live="polite">{game.events.at(-1)?.message ?? 'Civic Fortune table ready'}</span>
      <span className="sound-mark" aria-hidden="true"><Volume2 size={13} /> LIVE</span>
    </main>
  )
}
