import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { activateGame, createInitialGameState, secureShuffle, toPublicSnapshot } from "../_shared/engine.ts";
import { normalizeSettings } from "../_shared/contracts.ts";
import { loadGameBundle, requireGameMember, rpcResultOrThrow } from "../_shared/game-data.ts";
import { HttpError, isUuid, json, optionsResponse, publishGameUpdate, readJson, requireUser, serviceClient, withHttpErrors } from "../_shared/http.ts";

serve((request) => withHttpErrors(request, async () => {
  const preflight = optionsResponse(request);
  if (preflight) return preflight;
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  const user = await requireUser(request);
  const body = await readJson(request);
  if (!isUuid(body.gameId)) throw new HttpError(400, "INVALID_GAME_ID", "gameId must be a UUID");
  if (!Number.isSafeInteger(body.knownVersion) || (body.knownVersion as number) < 0) throw new HttpError(400, "INVALID_VERSION", "knownVersion must be a non-negative integer");

  const admin = serviceClient();
  const bundle = await loadGameBundle(admin, body.gameId);
  requireGameMember(bundle, user.id);
  if (bundle.game.host_user_id !== user.id) throw new HttpError(403, "HOST_ONLY", "Only the room host may start the game");
  if (bundle.game.status !== "lobby") throw new HttpError(409, "GAME_ALREADY_STARTED", "That game has already started");
  const members = bundle.playerMeta.filter((member) => member.memberStatus === "joined").sort((a, b) => a.seat - b.seat);
  if (members.length < 2) throw new HttpError(400, "NEED_TWO_PLAYERS", "At least two players must join before starting");

  const context = { actorId: user.id, now: new Date(), isHost: true, rollDice: () => [1, 1] as [number, number], makeId: crypto.randomUUID };
  const initial = createInitialGameState(members.map((member) => member.id), normalizeSettings(bundle.game.settings), context.now, secureShuffle);
  const state = activateGame(initial, context);
  const snapshot = toPublicSnapshot(state, members);
  const { data, error } = await admin.rpc("start_civic_game", {
    p_game_id: body.gameId,
    p_actor_id: user.id,
    p_known_version: body.knownVersion,
    p_current_player_id: state.currentPlayerId,
    p_turn_deadline_at: state.turnDeadlineAt,
    p_public_snapshot: snapshot,
    p_private_state: state,
  });
  if (error) throw new HttpError(500, "START_FAILED", "Could not start the game");
  const result = rpcResultOrThrow(data);
  await publishGameUpdate(admin, body.gameId, { version: result.version, eventIds: result.eventIds, event: "game-updated" });
  return json(request, { ok: true, version: result.version, snapshot });
}));
