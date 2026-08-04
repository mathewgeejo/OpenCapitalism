import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { loadGameBundle, requireGameMember } from "../_shared/game-data.ts";
import { HttpError, isUuid, json, optionsResponse, readJson, requireUser, serviceClient, withHttpErrors } from "../_shared/http.ts";

serve((request) => withHttpErrors(request, async () => {
  const preflight = optionsResponse(request);
  if (preflight) return preflight;
  if (request.method !== "GET" && request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  const user = await requireUser(request);
  const url = new URL(request.url);
  const body: Record<string, unknown> = request.method === "POST" ? await readJson(request) : {};
  const gameId = request.method === "POST" ? body.gameId : url.searchParams.get("gameId");
  if (!isUuid(gameId)) throw new HttpError(400, "INVALID_GAME_ID", "gameId must be a UUID");
  const afterRaw = request.method === "POST" ? body.afterEventId : url.searchParams.get("afterEventId");
  const afterEventId = afterRaw === undefined || afterRaw === null || afterRaw === "" ? null : Number(afterRaw);
  if (afterEventId !== null && (!Number.isSafeInteger(afterEventId) || afterEventId < 0)) {
    throw new HttpError(400, "INVALID_EVENT_CURSOR", "afterEventId must be a non-negative integer");
  }

  const admin = serviceClient();
  const bundle = await loadGameBundle(admin, gameId);
  requireGameMember(bundle, user.id);
  let eventsQuery = admin
    .from("game_events")
    .select("id,version,ordinal,kind,actor_id,message,data,created_at")
    .eq("game_id", gameId);
  if (afterEventId !== null) eventsQuery = eventsQuery.gt("id", afterEventId).order("id", { ascending: true }).limit(100);
  else eventsQuery = eventsQuery.order("id", { ascending: false }).limit(100);
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
    // Initial loads get the latest page but preserve oldest→newest rendering.
    events: afterEventId === null ? [...(events ?? [])].reverse() : events ?? [],
  });
}));
