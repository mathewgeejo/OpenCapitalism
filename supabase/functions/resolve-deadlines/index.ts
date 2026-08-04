import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { applyGameAction, gamePatch, secureDice, toPublicSnapshot } from "../_shared/engine.ts";
import { GameRuleError } from "../_shared/contracts.ts";
import { humanizeEvents, loadGameBundle } from "../_shared/game-data.ts";
import { HttpError, json, publishGameUpdate, serviceClient, withHttpErrors } from "../_shared/http.ts";

async function resolveOne(gameId: string): Promise<"resolved" | "skipped"> {
  const admin = serviceClient();
  const bundle = await loadGameBundle(admin, gameId);
  const currentTime = Date.now();
  const turnDue = Boolean(bundle.game.turn_deadline_at && new Date(bundle.game.turn_deadline_at).getTime() <= currentTime);
  const tradeDue = Boolean(bundle.game.trade_deadline_at && new Date(bundle.game.trade_deadline_at).getTime() <= currentTime);
  if (bundle.game.status !== "active" || (!turnDue && !tradeDue)) return "skipped";
  const actorId = bundle.privateState.currentPlayerId;
  if (!actorId) return "skipped";
  const now = new Date();
  let result;
  try {
    result = applyGameAction(bundle.privateState, { type: "resolve_deadline" }, {
      actorId,
      now,
      isHost: bundle.game.host_user_id === actorId,
      rollDice: secureDice,
      makeId: crypto.randomUUID,
    });
  } catch (error) {
    // A different resolver/action may have won between the due query and this
    // read. It is a normal no-op, not an operational failure.
    if (error instanceof GameRuleError && error.code === "NOT_DUE") return "skipped";
    throw error;
  }
  const snapshot = toPublicSnapshot(result.state, bundle.playerMeta);
  const events = humanizeEvents(result.events, bundle.playerMeta).map((event, ordinal) => ({
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
  const deadline = new Date().toISOString();
  const [turnResult, tradeResult] = await Promise.all([
    admin
    .from("games")
    .select("id")
    .eq("status", "active")
    .lte("turn_deadline_at", deadline)
    .order("turn_deadline_at", { ascending: true })
    .limit(50),
    admin
      .from("games")
      .select("id")
      .eq("status", "active")
      .lte("trade_deadline_at", deadline)
      .order("trade_deadline_at", { ascending: true })
      .limit(50),
  ]);
  if (turnResult.error || tradeResult.error) throw new HttpError(500, "DATABASE_ERROR", "Could not inspect expired game deadlines");
  const dueGameIds = [...new Set([...(turnResult.data ?? []), ...(tradeResult.data ?? [])].map((row) => row.id))].slice(0, 50);
  let resolved = 0;
  let skipped = 0;
  const failures: string[] = [];
  for (const gameId of dueGameIds) {
    try {
      if (await resolveOne(gameId) === "resolved") resolved += 1;
      else skipped += 1;
    } catch (error) {
      console.error(`Failed to resolve expired game ${gameId}`, error);
      failures.push(gameId);
    }
  }
  return json(request, { ok: true, resolved, skipped, failures });
}));
