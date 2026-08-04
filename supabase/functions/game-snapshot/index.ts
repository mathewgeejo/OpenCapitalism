import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { loadGameBundle, requireGameMember } from "../_shared/game-data.ts";
import { HttpError, isUuid, json, optionsResponse, requireUser, serviceClient, withHttpErrors } from "../_shared/http.ts";

serve((request) => withHttpErrors(request, async () => {
  const preflight = optionsResponse(request);
  if (preflight) return preflight;
  if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });
  const user = await requireUser(request);
  const url = new URL(request.url);
  const gameId = url.searchParams.get("gameId");
  if (!isUuid(gameId)) throw new HttpError(400, "INVALID_GAME_ID", "gameId must be a UUID");
  const afterRaw = url.searchParams.get("afterEventId");
  const afterEventId = afterRaw === null ? null : Number(afterRaw);
  if (afterEventId !== null && (!Number.isSafeInteger(afterEventId) || afterEventId < 0)) {
    throw new HttpError(400, "INVALID_EVENT_CURSOR", "afterEventId must be a non-negative integer");
  }

  const admin = serviceClient();
  const bundle = await loadGameBundle(admin, gameId);
  requireGameMember(bundle, user.id);
  let eventsQuery = admin
    .from("game_events")
    .select("id,version,ordinal,kind,actor_id,message,data,created_at")
    .eq("game_id", gameId)
    .order("id", { ascending: true })
    .limit(100);
  if (afterEventId !== null) eventsQuery = eventsQuery.gt("id", afterEventId);
  const { data: events, error } = await eventsQuery;
  if (error) throw new HttpError(500, "EVENTS_UNAVAILABLE", "The activity feed could not be loaded");
  return json(request, {
    ok: true,
    game: {
      id: bundle.game.id,
      title: bundle.game.title,
      visibility: bundle.game.visibility,
      status: bundle.game.status,
      hostUserId: bundle.game.host_user_id,
      maxPlayers: bundle.game.max_players,
      settings: bundle.game.settings,
      version: bundle.game.state_version,
      currentPlayerId: bundle.game.current_player_id,
      turnDeadlineAt: bundle.game.turn_deadline_at,
    },
    members: bundle.playerMeta,
    snapshot: bundle.publicSnapshot,
    events: events ?? [],
  });
}));
