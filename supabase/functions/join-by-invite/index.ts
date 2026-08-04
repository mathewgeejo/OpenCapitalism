import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { ensureProfile, loadGameBundle, rpcResultOrThrow } from "../_shared/game-data.ts";
import { HttpError, json, optionsResponse, publishGameUpdate, readJson, requireUser, serviceClient, sha256Hex, withHttpErrors } from "../_shared/http.ts";

/** Lets a lobby accept a short invite code without exposing a game UUID in the UI. */
serve((request) => withHttpErrors(request, async () => {
  const preflight = optionsResponse(request);
  if (preflight) return preflight;
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  const user = await requireUser(request);
  const body = await readJson(request);
  if (typeof body.inviteToken !== "string" || body.inviteToken.length < 16 || body.inviteToken.length > 200) {
    throw new HttpError(400, "INVALID_INVITE", "Enter a valid invite code");
  }
  const admin = serviceClient();
  await ensureProfile(admin, user);
  const tokenDigest = await sha256Hex(body.inviteToken);
  const { data: invite, error: inviteError } = await admin
    .from("game_invites")
    .select("game_id")
    .eq("token_digest", tokenDigest)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (inviteError) throw new HttpError(500, "INVITE_LOOKUP_FAILED", "Could not check that invite code");
  if (!invite) throw new HttpError(404, "INVITE_NOT_FOUND", "That invite code is invalid or has expired");

  const { data, error } = await admin.rpc("join_civic_game", {
    p_game_id: invite.game_id,
    p_user_id: user.id,
    p_invite_token_digest: tokenDigest,
  });
  if (error) throw new HttpError(500, "JOIN_FAILED", "Could not join that room");
  const result = rpcResultOrThrow(data);
  const bundle = await loadGameBundle(admin, invite.game_id);
  await publishGameUpdate(admin, invite.game_id, { version: bundle.game.state_version, event: "lobby-updated" });
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
