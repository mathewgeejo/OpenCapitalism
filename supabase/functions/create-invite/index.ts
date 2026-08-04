import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { loadGameBundle, requireGameMember, rpcResultOrThrow } from "../_shared/game-data.ts";
import { HttpError, isUuid, json, optionsResponse, randomToken, readJson, requireUser, serviceClient, sha256Hex, withHttpErrors } from "../_shared/http.ts";

serve((request) => withHttpErrors(request, async () => {
  const preflight = optionsResponse(request);
  if (preflight) return preflight;
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  const user = await requireUser(request);
  const body = await readJson(request);
  if (!isUuid(body.gameId)) throw new HttpError(400, "INVALID_GAME_ID", "gameId must be a UUID");
  if (body.inviteeUserId !== undefined && !isUuid(body.inviteeUserId)) throw new HttpError(400, "INVALID_INVITEE", "inviteeUserId must be a UUID");
  const maxUses = Number.isSafeInteger(body.maxUses) && (body.maxUses as number) >= 1 && (body.maxUses as number) <= 20 ? body.maxUses as number : body.maxUses === undefined ? 1 : null;
  const expiresInHours = Number.isSafeInteger(body.expiresInHours) && (body.expiresInHours as number) >= 1 && (body.expiresInHours as number) <= 168
    ? body.expiresInHours as number : body.expiresInHours === undefined ? 24 : null;
  if (!maxUses || !expiresInHours) throw new HttpError(400, "INVALID_INVITE", "maxUses and expiresInHours are out of range");

  const admin = serviceClient();
  const bundle = await loadGameBundle(admin, body.gameId);
  requireGameMember(bundle, user.id);
  if (bundle.game.host_user_id !== user.id) throw new HttpError(403, "HOST_ONLY", "Only the host can create room invites");
  if (bundle.game.visibility !== "private" || bundle.game.status !== "lobby") throw new HttpError(409, "INVITES_UNAVAILABLE", "Invites are only available for private lobby rooms");

  const inviteToken = randomToken();
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin.rpc("create_civic_game_invite", {
    p_game_id: body.gameId,
    p_actor_id: user.id,
    p_invitee_user_id: body.inviteeUserId ?? null,
    p_token_digest: await sha256Hex(inviteToken),
    p_max_uses: maxUses,
    p_expires_at: expiresAt,
  });
  if (error) throw new HttpError(500, "INVITE_CREATE_FAILED", "Could not create the invite");
  const result = rpcResultOrThrow(data);
  return json(request, { ok: true, invite: { id: result.id, token: inviteToken, expiresAt: result.expiresAt, maxUses: result.maxUses } }, 201);
}));
