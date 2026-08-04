import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { applyGameAction, gamePatch, secureDice, toPublicSnapshot } from "../_shared/engine.ts";
import { GameRuleError, parseGameAction, type GameAction } from "../_shared/contracts.ts";
import { loadGameBundle, requireGameMember, rpcResultOrThrow } from "../_shared/game-data.ts";
import { HttpError, isUuid, json, optionsResponse, publishGameUpdate, readJson, requireUser, serviceClient, withHttpErrors } from "../_shared/http.ts";

const ruleHttpError = (error: GameRuleError): HttpError => {
  const conflictCodes = new Set(["NOT_YOUR_TURN", "INVALID_PHASE", "GAME_NOT_ACTIVE", "STALE_VERSION", "NOT_DUE", "TRADE_EXPIRED"]);
  return new HttpError(conflictCodes.has(error.code) ? 409 : 400, error.code, error.message);
};

serve((request) => withHttpErrors(request, async () => {
  const preflight = optionsResponse(request);
  if (preflight) return preflight;
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  const user = await requireUser(request);
  const body = await readJson(request);
  if (!isUuid(body.gameId)) throw new HttpError(400, "INVALID_GAME_ID", "gameId must be a UUID");
  if (!isUuid(body.clientActionId)) throw new HttpError(400, "INVALID_CLIENT_ACTION_ID", "clientActionId must be a UUID");
  if (!Number.isSafeInteger(body.knownVersion) || (body.knownVersion as number) < 0) throw new HttpError(400, "INVALID_VERSION", "knownVersion must be a non-negative integer");

  let action: GameAction;
  try {
    action = parseGameAction(body.action);
  } catch (error) {
    if (error instanceof GameRuleError) throw ruleHttpError(error);
    throw error;
  }

  const admin = serviceClient();
  const bundle = await loadGameBundle(admin, body.gameId);
  requireGameMember(bundle, user.id);
  const knownVersion = body.knownVersion as number;
  if (bundle.game.state_version !== knownVersion || bundle.privateVersion !== knownVersion || bundle.publicVersion !== knownVersion) {
    throw new HttpError(409, "STALE_VERSION", "The board changed; refresh and try again", { currentVersion: bundle.game.state_version });
  }

  let result;
  try {
    result = applyGameAction(bundle.privateState, action, {
      actorId: user.id,
      now: new Date(),
      isHost: bundle.game.host_user_id === user.id,
      rollDice: secureDice,
      makeId: crypto.randomUUID,
    });
  } catch (error) {
    if (error instanceof GameRuleError) throw ruleHttpError(error);
    throw error;
  }
  const snapshot = toPublicSnapshot(result.state, bundle.playerMeta);
  const events = result.events.map((event, ordinal) => ({
    ordinal,
    kind: event.kind,
    actorId: event.actorId ?? user.id,
    message: event.message,
    data: event.data ?? {},
  }));
  const patch = gamePatch(result.state);
  const { data, error } = await admin.rpc("commit_civic_game_action", {
    p_game_id: body.gameId,
    p_actor_id: user.id,
    p_known_version: knownVersion,
    p_client_action_id: body.clientActionId,
    p_action_kind: action.type,
    p_next_game: patch,
    p_public_snapshot: snapshot,
    p_private_state: result.state,
    p_events: events,
    p_member_status_changes: result.memberStatusChanges,
  });
  if (error) {
    console.error("game-action commit failed", error);
    throw new HttpError(500, "COMMIT_FAILED", "Could not save that game action");
  }
  const commit = rpcResultOrThrow(data);
  if (commit.duplicate === true) {
    return json(request, { ok: true, duplicate: true, version: commit.version, reconcile: true });
  }
  await publishGameUpdate(admin, body.gameId, { version: commit.version, eventIds: commit.eventIds, event: "game-updated" });
  return json(request, { ok: true, duplicate: false, version: commit.version, eventIds: commit.eventIds, snapshot });
}));
