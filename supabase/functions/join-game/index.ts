import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { ensureProfile, loadGameBundle, rpcResultOrThrow } from "../_shared/game-data.ts";
import { HttpError, isUuid, json, optionsResponse, publishGameUpdate, readJson, requireUser, serviceClient, sha256Hex, withHttpErrors } from "../_shared/http.ts";

serve((request) => withHttpErrors(request, async () => {
  const preflight = optionsResponse(request);
  if (preflight) return preflight;
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  const user = await requireUser(request);
  const body = await readJson(request);
  if (!isUuid(body.gameId)) throw new HttpError(400, "INVALID_GAME_ID", "gameId must be a UUID");
  if (body.inviteToken !== undefined && (typeof body.inviteToken !== "string" || body.inviteToken.length < 16 || body.inviteToken.length > 200)) {
    throw new HttpError(400, "INVALID_INVITE", "inviteToken is invalid");
  }

  const admin = serviceClient();
  await ensureProfile(admin, user);
  const tokenDigest = typeof body.inviteToken === "string" ? await sha256Hex(body.inviteToken) : null;
  const { data, error } = await admin.rpc("join_civic_game", {
    p_game_id: body.gameId,
    p_user_id: user.id,
    p_invite_token_digest: tokenDigest,
  });
  if (error) throw new HttpError(500, "JOIN_FAILED", "Could not join that room");
  const result = rpcResultOrThrow(data);
  const bundle = await loadGameBundle(admin, body.gameId);
  await publishGameUpdate(admin, body.gameId, { version: bundle.game.state_version, event: "lobby-updated" });
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
    },
    seat: result.seat,
    alreadyJoined: result.alreadyJoined === true,
    members: bundle.playerMeta,
  });
}));
