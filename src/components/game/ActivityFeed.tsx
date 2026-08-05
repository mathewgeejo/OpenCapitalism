import type { GameViewState } from '../../game/types'
import { eventTimestamp, getPlayer } from '../../lib/gamePresentation'

export function ActivityFeed({ game }: { game: GameViewState }) {
  const events = [...game.events].slice(-40).reverse()
  return (
    <section className="activity" aria-label="Game activity">
      <div className="activity-header">
        <h3>TABLE TALES</h3>
        <span>{game.events.length} events</span>
      </div>
      <div className="event-list" role="log" aria-live="polite">
        {events.map((event) => {
          const actor = getPlayer(game, event.actorId)
          return (
            <div className="event-item" key={event.id}>
              <i aria-hidden="true" />
              <div>
                {actor && <strong>{actor.name} </strong>}
                {event.message}
                <time dateTime={new Date(event.createdAt).toISOString()}>{eventTimestamp(event.createdAt)}</time>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
