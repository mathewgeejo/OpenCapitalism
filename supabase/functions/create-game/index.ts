import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createInitialGameState, secureShuffle, toPublicSnapshot } from "../_shared/engine.ts";
import { normalizeSettings } from "../_shared/contracts.ts";
import { ensureProfile, rpcResultOrThrow } from "../_shared/game-data.ts";
import { HttpError, json, optionsResponse, publishGameUpdate, readJson, requireUser, serviceClient, withHttpErrors } from "../_shared/http.ts";

serve((request) => withHttpErrors(request, async () => {
  const preflight = optionsResponse(request);
  if (preflight) return preflight;
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  const user = await requireUser(request);
  const body = await readJson(request);
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (title.length < 2 || title.length > 60) throw new HttpError(400, "INVALID_TITLE", "Room title must be 2–60 characters");
  const visibility = body.visibility === "private" ? "private" : body.visibility === "public" || body.visibility === undefined ? "public" : null;
  if (!visibility) throw new HttpError(400, "INVALID_VISIBILITY", "visibility must be public or private");
  const maxPlayers = Number.isSafeInteger(body.maxPlayers) && (body.maxPlayers as number) >= 2 && (body.maxPlayers as number) <= 20
    ? body.maxPlayers as number
    : body.maxPlayers === undefined ? 20 : null;
  if (!maxPlayers) throw new HttpError(400, "INVALID_MAX_PLAYERS", "maxPlayers must be between 2 and 20");

  const settings = normalizeSettings(body.settings);
  const admin = serviceClient();
  const host = await ensureProfile(admin, user);
  const gameId = crypto.randomUUID();
  const state = createInitialGameState([user.id], settings, new Date(), secureShuffle);
  // Mirrors `civic_seat_color(0)` in the migration; game snapshots use the
  // room-local seat palette rather than the account-wide profile colour.
  const snapshot = toPublicSnapshot(state, [{ ...host, seat: 0, avatarColor: "#ef4444" }]);
  const { data, error } = await admin.rpc("bootstrap_civic_game", {
    p_game_id: gameId,
    p_creator_id: user.id,
    p_title: title,
    p_visibility: visibility,
    p_max_players: maxPlayers,
    p_settings: settings,
    p_public_snapshot: snapshot,
    p_private_state: state,
  });
  if (error) throw new HttpError(500, "CREATE_FAILED", "Could not create the room");
  const result = rpcResultOrThrow(data);
  await publishGameUpdate(admin, gameId, { version: 0, event: "lobby-updated" });
  return json(request, {
    ok: true,
    game: { id: gameId, title, visibility, status: "lobby", maxPlayers, settings, hostUserId: user.id },
    version: result.version,
  }, 201);
}));
