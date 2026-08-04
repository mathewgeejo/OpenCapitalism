import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { loadGameBundle, rpcResultOrThrow } from "../_shared/game-data.ts";
import { HttpError, isUuid, json, optionsResponse, publishGameUpdate, readJson, requireUser, serviceClient, withHttpErrors } from "../_shared/http.ts";

serve((request) => withHttpErrors(request, async () => {
  const preflight = optionsResponse(request);
  if (preflight) return preflight;
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  const user = await requireUser(request);
  const body = await readJson(request);
  if (!isUuid(body.gameId) || !isUuid(body.targetUserId)) throw new HttpError(400, "INVALID_ID", "gameId and targetUserId must be UUIDs");
  const admin = serviceClient();
  const { data, error } = await admin.rpc("transfer_civic_game_host", {
    p_game_id: body.gameId,
    p_actor_id: user.id,
    p_target_id: body.targetUserId,
  });
  if (error) throw new HttpError(500, "TRANSFER_FAILED", "Could not transfer room host status");
  const result = rpcResultOrThrow(data);
  const bundle = await loadGameBundle(admin, body.gameId);
  await publishGameUpdate(admin, body.gameId, { version: bundle.game.state_version, event: "game-updated", hostUserId: result.hostUserId });
  return json(request, { ok: true, hostUserId: result.hostUserId });
}));
