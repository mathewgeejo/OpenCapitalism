import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { applyGameAction, gamePatch, secureDice, toPublicSnapshot } from "../_shared/engine.ts";
import { loadGameBundle } from "../_shared/game-data.ts";
import { HttpError, json, publishGameUpdate, serviceClient, withHttpErrors } from "../_shared/http.ts";

async function resolveOne(gameId: string): Promise<"resolved" | "skipped"> {
  const admin = serviceClient();
  const bundle = await loadGameBundle(admin, gameId);
  if (bundle.game.status !== "active" || !bundle.game.turn_deadline_at || new Date(bundle.game.turn_deadline_at).getTime() > Date.now()) return "skipped";
  const actorId = bundle.privateState.currentPlayerId;
  if (!actorId) return "skipped";
  const now = new Date();
  const result = applyGameAction(bundle.privateState, { type: "resolve_deadline" }, {
    actorId,
    now,
    isHost: bundle.game.host_user_id === actorId,
    rollDice: secureDice,
    makeId: crypto.randomUUID,
  });
  const snapshot = toPublicSnapshot(result.state, bundle.playerMeta);
  const events = result.events.map((event, ordinal) => ({
    ordinal,
    kind: event.kind,
    actorId: event.actorId ?? actorId,
    message: event.message,
    data: event.data ?? {},
  }));
  const { data, error } = await admin.rpc("commit_civic_game_action", {
    p_game_id: gameId,
    p_actor_id: actorId,
    p_known_version: bundle.game.state_version,
    p_client_action_id: crypto.randomUUID(),
    p_action_kind: "resolve_deadline",
    p_next_game: gamePatch(result.state),
    p_public_snapshot: snapshot,
    p_private_state: result.state,
    p_events: events,
    p_member_status_changes: result.memberStatusChanges,
  });
  if (error) throw error;
  const commit = data as Record<string, unknown>;
  if (commit.ok !== true || commit.duplicate === true) return "skipped";
  await publishGameUpdate(admin, gameId, { version: commit.version, eventIds: commit.eventIds, event: "game-updated" });
  return "resolved";
}

serve((request) => withHttpErrors(request, async () => {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  const expectedSecret = Deno.env.get("CRON_SECRET");
  if (!expectedSecret || request.headers.get("x-cron-secret") !== expectedSecret) throw new HttpError(401, "UNAUTHORIZED", "Invalid scheduler credentials");
  const admin = serviceClient();
  const { data: dueGames, error } = await admin
    .from("games")
    .select("id")
    .eq("status", "active")
    .lte("turn_deadline_at", new Date().toISOString())
    .order("turn_deadline_at", { ascending: true })
    .limit(50);
  if (error) throw new HttpError(500, "DATABASE_ERROR", "Could not inspect expired turns");
  let resolved = 0;
  let skipped = 0;
  const failures: string[] = [];
  for (const row of dueGames ?? []) {
    try {
      if (await resolveOne(row.id) === "resolved") resolved += 1;
      else skipped += 1;
    } catch (error) {
      console.error(`Failed to resolve expired game ${row.id}`, error);
      failures.push(row.id);
    }
  }
  return json(request, { ok: true, resolved, skipped, failures });
}));
