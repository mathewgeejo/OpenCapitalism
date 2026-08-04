# Civic Fortune Supabase backend

This directory contains the authoritative multiplayer backend. Browser clients
can read a game’s public snapshot and event feed, but cannot write money,
dice, ownership, deck order, or turn state directly.

## Deploy

1. Create/link a Supabase project, then apply the migration:

   ```sh
   supabase db push
   ```

2. Copy `functions/.env.example` to a local non-committed env file for local
   serving. In the hosted project, add the values as Edge Function secrets:

   ```sh
   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=... APP_ORIGIN=https://app.example.com CRON_SECRET=...
   ```

   `SUPABASE_URL` and `SUPABASE_ANON_KEY` are normally provided to Functions
   by Supabase. The service role key and cron secret must never be in Vite
   variables, source control, or browser requests.

3. Deploy every function:

   ```sh
   supabase functions deploy create-game
   supabase functions deploy join-game
   supabase functions deploy join-by-invite
   supabase functions deploy start-game
   supabase functions deploy game-snapshot
   supabase functions deploy game-action
   supabase functions deploy leave-game
   supabase functions deploy transfer-host
   supabase functions deploy create-invite
   supabase functions deploy resolve-deadlines
   ```

4. In Supabase Auth, enable email/password and magic links, add the production
   redirect URL, and configure Google OAuth with that same callback/redirect
   configuration. The `auth.users` trigger creates a profile automatically.

5. Invoke `resolve-deadlines` from a trusted scheduler at least once every
   10 seconds (or as frequently as the deployment permits):

   ```sh
   curl -X POST https://PROJECT.supabase.co/functions/v1/resolve-deadlines \
     -H "x-cron-secret: $CRON_SECRET"
   ```

   The resolver is idempotent under races: it reloads the versioned state and
   the commit RPC rejects a concurrent action that won first. It resolves both
   expired turns and the earliest pending trade expiry, so timed-out offers are
   removed from canonical state even if no player clicks a control.

## Browser function contract

Call player-facing functions at `/functions/v1/<name>` with the user access
token as `Authorization: Bearer <access-token>`. All bodies are JSON.

| Function | Request body / query | Result |
| --- | --- | --- |
| `create-game` | `{ title, visibility?: "public"\|"private", maxPlayers?: 2..20, settings?: { turnSeconds?, auctionSeconds?, fastAnimation?, jackpotEnabled?, startBonus? } }` | New lobby room and version `0`. |
| `join-game` | `{ gameId, inviteToken? }` | Seat, lobby metadata, and roster. A private room requires the raw one-time invite token. |
| `join-by-invite` | `{ inviteToken }` | Same join response, for a code-entry UI that does not know the game UUID. |
| `start-game` | `{ gameId, knownVersion }` | Host only; starts a lobby with at least two seats and returns `{ version, snapshot }`. |
| `game-snapshot` | `GET ?gameId=<uuid>&afterEventId=<optional bigint>` or `POST { gameId, afterEventId? }` | `{ game, members, snapshot, events }`; use it on entry, refresh, reconnect, or a skipped version. |
| `game-action` | `{ gameId, knownVersion, clientActionId, action }` | Authoritative state transition. Returns `{ version, eventIds, snapshot }`; retry the same `clientActionId` safely. |
| `leave-game` | `{ gameId }` | Leaves only a lobby. Active games preserve the seat for reconnect; use in-game bankruptcy/concession flow instead. |
| `transfer-host` | `{ gameId, targetUserId }` | Current host transfers host role to a joined player. |
| `create-invite` | `{ gameId, inviteeUserId?, maxUses?: 1..20, expiresInHours?: 1..168 }` | Host-only private-lobby invite. The returned raw token is shown exactly once. |

For the authenticated public-room browser, call `supabase.rpc('list_public_civic_lobbies')`. It returns only `id`, `title`, `visibility`, `status`, `max_players`, `seat_count`, `host_display_name`, and `created_at`; it never reveals members of unjoined rooms.

`game-action.action` is one of:

```ts
{ type: "roll" }
{ type: "buy_asset" } | { type: "decline_asset" }
{ type: "place_bid", amount } | { type: "pass_bid" }
{ type: "end_turn" } | { type: "pay_detention" } | { type: "use_release_permit" }
{ type: "build" | "sell_building" | "mortgage" | "unmortgage", tileId }
{ type: "offer_trade", toUserId, offerCash, requestCash, offerTileIds, requestTileIds }
{ type: "respond_trade", tradeId, accept } | { type: "cancel_trade", tradeId }
{ type: "pay_debt" } | { type: "declare_bankruptcy" } | { type: "resolve_deadline" }
{ type: "pause_game" } | { type: "resume_game" } | { type: "end_game" }
```

Every action is validated against the server-loaded private state. Dice and
deck shuffles use `crypto.getRandomValues` only inside Edge Functions.
Public snapshots include a safe pending `debt` projection (`playerId`, `amount`,
and `reason`) so the current player can choose `pay_debt` or
`declare_bankruptcy`; creditor/internal continuation fields stay server-only.
The response-only `snapshot.members` roster includes all current room members,
which is especially important while a lobby has not yet built its final
turn-order. Each member gets a room-local seat color from a 20-color palette;
changing a seat never changes their global profile color.

Open trade metadata (`id`, parties, expiry) is visible to room members, but the
cash and asset terms are not persisted in `game_public_snapshots`. A signed-in
proposer or recipient receives only their own terms in
`snapshot.tradeDetails`; every other member receives an empty array. Clients
should treat `SNAPSHOT_RETRY` (HTTP 409) as a short, safe refetch: the backend
uses bounded version-consistency reads and never intentionally returns a game
row and snapshot from different versions.

## Realtime contract

After `join-game`, subscribe with the authenticated browser client to the
private channel `game:<gameId>`. Track only presence from the client; the
server broadcasts the `game-updated` event with `{ version, eventIds }` after
a successful commit.

```ts
const channel = supabase
  .channel(`game:${gameId}`, { config: { private: true, presence: { key: user.id } } })
  .on("broadcast", { event: "game-updated" }, ({ payload }) => {
    // If payload.version is not currentVersion + 1, refetch game-snapshot.
  })
  .on("presence", { event: "sync" }, () => {
    // Render online/away roster indicators.
  })
  .subscribe(async (status) => {
    if (status === "SUBSCRIBED") await channel.track({ onlineAt: new Date().toISOString() });
  });
```

The migration grants members only `SELECT` access to player-visible tables,
grants no browser access to `game_private_states` or idempotency receipts, and
authorizes only `presence` inserts on the private Realtime topic. Public games
are discoverable only while their lobby is open.

## Data and engine boundary

`functions/_shared/board.ts` is the data-driven, original 52-space Civic
Fortune board. `functions/_shared/engine.ts` is a pure transition layer used
by Edge Functions; its public projection removes card/deck order, debt
details, and unaccepted trade terms. The frontend should mirror the public
board definitions for rendering but must treat `game-snapshot` as truth.

For an engine-only smoke test (no Supabase project required):

```sh
npx --yes deno@2.5.0 test supabase/functions/_shared/engine_test.ts
```
