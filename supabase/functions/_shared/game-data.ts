import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import type { User } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { HttpError } from "./http.ts";
import type { PlayerMeta, PrivateGameState, PublicGameEvent, PublicGameSnapshot } from "./contracts.ts";

export interface DbGame {
  id: string;
  title: string;
  visibility: "public" | "private";
  status: "lobby" | "active" | "paused" | "finished" | "abandoned";
  created_by: string;
  host_user_id: string;
  max_players: number;
  settings: unknown;
  state_version: number;
  current_player_id: string | null;
  turn_deadline_at: string | null;
  trade_deadline_at: string | null;
  created_at: string;
  started_at: string | null;
}

export interface DbMember {
  game_id: string;
  user_id: string;
  seat: number;
  token_color: string;
  role: "host" | "player";
  status: "joined" | "left" | "eliminated";
}

interface DbProfile {
  id: string;
  display_name: string;
  avatar_color: string;
}

export interface GameBundle {
  game: DbGame;
  members: DbMember[];
  playerMeta: PlayerMeta[];
  privateVersion: number;
  publicVersion: number;
  privateState: PrivateGameState;
  publicSnapshot: PublicGameSnapshot;
}

const databaseError = (error: unknown): never => {
  console.error("Supabase database error", error);
  throw new HttpError(500, "DATABASE_ERROR", "The game state could not be loaded");
};

function validPrivateState(value: unknown): value is PrivateGameState {
  if (!value || typeof value !== "object") return false;
  const state = value as Record<string, unknown>;
  return state.schemaVersion === 1 && typeof state.status === "string" && typeof state.phase === "string"
    && Array.isArray(state.turnOrder) && !!state.players && typeof state.players === "object"
    && !!state.assets && typeof state.assets === "object";
}

function validPublicSnapshot(value: unknown): value is PublicGameSnapshot {
  return !!value && typeof value === "object" && (value as Record<string, unknown>).schemaVersion === 1;
}

export async function loadGameBundle(client: SupabaseClient, gameId: string): Promise<GameBundle> {
  // These rows are written together in one transaction, but separate REST
  // reads can straddle that commit. Never hand callers a game row from N with
  // snapshots from N-1; retry a small bounded number of times instead.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const [gameResult, memberResult, privateResult, snapshotResult] = await Promise.all([
      client.from("games").select("*").eq("id", gameId).maybeSingle(),
      client.from("game_members").select("game_id,user_id,seat,token_color,role,status").eq("game_id", gameId).order("seat"),
      client.from("game_private_states").select("version,state").eq("game_id", gameId).maybeSingle(),
      client.from("game_public_snapshots").select("version,snapshot").eq("game_id", gameId).maybeSingle(),
    ]);
    if (gameResult.error || memberResult.error || privateResult.error || snapshotResult.error) {
      databaseError(gameResult.error ?? memberResult.error ?? privateResult.error ?? snapshotResult.error);
    }
    if (!gameResult.data) throw new HttpError(404, "GAME_NOT_FOUND", "That game does not exist");
    if (!privateResult.data || !snapshotResult.data || !validPrivateState(privateResult.data.state) || !validPublicSnapshot(snapshotResult.data.snapshot)) {
      throw new HttpError(409, "STATE_UNAVAILABLE", "The game state is not ready");
    }

    const game = gameResult.data as DbGame;
    const privateVersion = privateResult.data.version as number;
    const publicVersion = snapshotResult.data.version as number;
    if (game.state_version !== privateVersion || game.state_version !== publicVersion) {
      if (attempt < 2) {
        await new Promise<void>((resolve) => setTimeout(resolve, (attempt + 1) * 15));
        continue;
      }
      throw new HttpError(409, "SNAPSHOT_RETRY", "The board updated while loading; retry the snapshot", {
        currentVersion: game.state_version,
        retryAfterMs: 75,
      });
    }

    const members = (memberResult.data ?? []) as DbMember[];
    const userIds = members.map((member) => member.user_id);
    const profileResult = userIds.length
      ? await client.from("profiles").select("id,display_name,avatar_color").in("id", userIds)
      : { data: [], error: null };
    if (profileResult.error) databaseError(profileResult.error);
    const profiles = new Map(((profileResult.data ?? []) as DbProfile[]).map((profile) => [profile.id, profile]));
    const playerMeta = members.map((member) => {
      const profile = profiles.get(member.user_id);
      return {
        id: member.user_id,
        displayName: profile?.display_name ?? "Player",
        avatarColor: member.token_color || profile?.avatar_color || "#4f8cff",
        seat: member.seat,
        memberStatus: member.status,
      } satisfies PlayerMeta;
    });
    return {
      game,
      members,
      playerMeta,
      privateVersion,
      publicVersion,
      privateState: privateResult.data.state as PrivateGameState,
      publicSnapshot: snapshotResult.data.snapshot as PublicGameSnapshot,
    };
  }
  // The loop always returns or throws above; this keeps TypeScript exhaustive.
  throw new HttpError(409, "SNAPSHOT_RETRY", "The board updated while loading; retry the snapshot");
}

export function requireGameMember(bundle: Pick<GameBundle, "members">, userId: string): DbMember {
  const member = bundle.members.find((item) => item.user_id === userId && (item.status === "joined" || item.status === "eliminated"));
  if (!member) throw new HttpError(403, "NOT_A_MEMBER", "Join this room before accessing it");
  return member;
}

export function rpcResultOrThrow(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") throw new HttpError(500, "INVALID_RPC_RESPONSE", "The game service returned an invalid response");
  const result = value as Record<string, unknown>;
  if (result.ok === true) return result;
  const code = typeof result.code === "string" ? result.code : "ACTION_REJECTED";
  const status = code === "GAME_NOT_FOUND" ? 404 : code === "HOST_ONLY" || code === "NOT_A_MEMBER" ? 403 : code === "STALE_VERSION" || code === "DEADLINE_EXPIRED" || code === "LOBBY_CHANGED" ? 409 : 400;
  throw new HttpError(status, code, "The game state changed; refresh and try again", { currentVersion: result.currentVersion });
}

/** Replaces internal UUIDs in engine-authored prose before it reaches the HUD. */
export function humanizeEvents(events: PublicGameEvent[], playerMeta: PlayerMeta[]): PublicGameEvent[] {
  return events.map((event) => {
    let message = event.message;
    for (const player of playerMeta) message = message.replaceAll(player.id, player.displayName);
    return { ...event, message };
  });
}

/** Covers accounts created before the profile trigger was installed. */
export async function ensureProfile(client: SupabaseClient, user: User): Promise<PlayerMeta> {
  const existing = await client.from("profiles").select("id,display_name,avatar_color").eq("id", user.id).maybeSingle();
  if (existing.error) databaseError(existing.error);
  if (existing.data) {
    return { id: user.id, displayName: existing.data.display_name, avatarColor: existing.data.avatar_color, seat: 0, memberStatus: "joined" };
  }
  const metadataName = typeof user.user_metadata?.display_name === "string" ? user.user_metadata.display_name.trim() : "";
  const base = (metadataName || user.email?.split("@")[0] || "Player").slice(0, 20);
  const displayName = `${base.length >= 2 ? base : "Player"}-${user.id.slice(0, 8)}`;
  const insert = await client.from("profiles").insert({ id: user.id, display_name: displayName, avatar_color: "#4f8cff" }).select("id,display_name,avatar_color").single();
  const profile = insert.data;
  if (insert.error) databaseError(insert.error);
  if (!profile) throw new HttpError(500, "PROFILE_CREATE_FAILED", "Profile creation returned no row");
  return { id: user.id, displayName: profile.display_name, avatarColor: profile.avatar_color, seat: 0, memberStatus: "joined" };
}
