import { createClient, type SupabaseClient, type User } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const required = (name: string): string => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required Edge Function secret: ${name}`);
  return value;
};

export const isUuid = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export function corsHeaders(request?: Request): HeadersInit {
  const allowed = Deno.env.get("APP_ORIGIN")?.split(",").map((origin) => origin.trim()).filter(Boolean) ?? [];
  const origin = request?.headers.get("origin") ?? "";
  const allowOrigin = allowed.length === 0 ? "*" : allowed.includes(origin) ? origin : allowed[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export function optionsResponse(request: Request): Response | null {
  if (request.method !== "OPTIONS") return null;
  return new Response("ok", { headers: corsHeaders(request) });
}

export function json(request: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export function errorResponse(request: Request, status: number, code: string, message: string, extra: Record<string, unknown> = {}): Response {
  return json(request, { ok: false, error: { code, message, ...extra } }, status);
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const value = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "INVALID_JSON", "Request body must be a JSON object");
  }
}

export class HttpError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly extra: Record<string, unknown> = {}) {
    super(message);
    this.name = "HttpError";
  }
}

export function serviceClient(): SupabaseClient {
  return createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Validates the caller with the anon key; never trust a JWT-decoded id alone. */
export async function requireUser(request: Request): Promise<User> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) throw new HttpError(401, "UNAUTHENTICATED", "Sign in to continue");
  const client = createClient(required("SUPABASE_URL"), required("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const token = authorization.slice("Bearer ".length);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "UNAUTHENTICATED", "Your session has expired");
  return data.user;
}

export async function sha256Hex(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function randomToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/** Best-effort broadcast. Database state/events stay the durable recovery path. */
export async function publishGameUpdate(client: SupabaseClient, gameId: string, payload: Record<string, unknown>): Promise<void> {
  const channel = client.channel(`game:${gameId}`, { config: { private: true } });
  try {
    const status = await new Promise<string>((resolve) => {
      const timer = setTimeout(() => resolve("TIMED_OUT"), 2500);
      channel.subscribe((nextStatus) => {
        if (nextStatus === "SUBSCRIBED" || nextStatus === "CHANNEL_ERROR" || nextStatus === "TIMED_OUT") {
          clearTimeout(timer);
          resolve(nextStatus);
        }
      });
    });
    if (status === "SUBSCRIBED") {
      await channel.send({ type: "broadcast", event: "game-updated", payload });
    }
  } catch (error) {
    // A broadcast may fail while Realtime is restarting. The committed version
    // remains readable through game-snapshot, so it must never roll back play.
    console.warn("Realtime broadcast failed", error);
  } finally {
    await client.removeChannel(channel);
  }
}

export async function withHttpErrors(request: Request, handler: () => Promise<Response>): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    if (error instanceof HttpError) return errorResponse(request, error.status, error.code, error.message, error.extra);
    console.error(error);
    return errorResponse(request, 500, "INTERNAL_ERROR", "The game service could not complete that request");
  }
}
