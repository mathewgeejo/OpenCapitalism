import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { loadGameBundle, rpcResultOrThrow } from "../_shared/game-data.ts";
import { HttpError, isUuid, json, optionsResponse, publishGameUpdate, readJson, requireUser, serviceClient, withHttpErrors } from "../_shared/http.ts";

serve((request) => withHttpErrors(request, async () => {
  const preflight = optionsResponse(request);
  if (preflight) return preflight;
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  const user = await requireUser(request);
  const body = await readJson(request);
  if (!isUuid(body.gameId)) throw new HttpError(400, "INVALID_GAME_ID", "gameId must be a UUID");
  const admin = serviceClient();
  const { data, error } = await admin.rpc("leave_civic_game", { p_game_id: body.gameId, p_user_id: user.id });
  if (error) throw new HttpError(500, "LEAVE_FAILED", "Could not leave that room");
  rpcResultOrThrow(data);
  const bundle = await loadGameBundle(admin, body.gameId);
  await publishGameUpdate(admin, body.gameId, { version: bundle.game.state_version, event: "lobby-updated" });
  return json(request, { ok: true });
}));
