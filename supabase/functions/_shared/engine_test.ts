import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { activateGame, applyGameAction, createInitialGameState, toPublicSnapshot, toViewerSnapshot } from "./engine.ts";
import { DEFAULT_SETTINGS, GameRuleError, type EngineContext, type PrivateGameState } from "./contracts.ts";

const players = ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"];
const now = new Date("2026-08-05T12:00:00.000Z");

function context(actorId: string, dice: [number, number] = [1, 1], at = now): EngineContext {
  return { actorId, now: at, isHost: actorId === players[0], rollDice: () => dice, makeId: () => "00000000-0000-4000-8000-000000000099" };
}

function game(): PrivateGameState {
  return activateGame(createInitialGameState(players, DEFAULT_SETTINGS, now, <T>(items: T[]) => items), context(players[0]));
}

Deno.test("roll, purchase, and public cash state are authoritative", () => {
  const state = game();
  state.players[players[0]].position = 51;
  const landed = applyGameAction(state, { type: "roll" }, context(players[0]));
  assertEquals(landed.state.pendingPurchase?.tileId, "cedar-quay");
  const bought = applyGameAction(landed.state, { type: "buy_asset" }, context(players[0]));
  assertEquals(bought.state.assets["cedar-quay"].ownerId, players[0]);
  assertEquals(bought.state.players[players[0]].cash, 1640); // $1500 + $200 start bonus - $60
});

Deno.test("rent transfers to the owner and never trusts a client amount", () => {
  const state = game();
  state.players[players[0]].position = 51;
  state.assets["cedar-quay"].ownerId = players[1];
  const next = applyGameAction(state, { type: "roll" }, context(players[0]));
  assertEquals(next.state.players[players[0]].cash, 1696);
  assertEquals(next.state.players[players[1]].cash, 1504);
  assertEquals(next.state.phase, "await_end_turn");
});

Deno.test("arriving on Founders' Plaza awards the start dividend exactly once", () => {
  const state = game();
  state.players[players[0]].position = 50;
  const result = applyGameAction(state, { type: "roll" }, context(players[0]));
  assertEquals(result.state.players[players[0]].position, 0);
  assertEquals(result.state.players[players[0]].cash, 1700);
  assertEquals(result.events.filter((event) => event.kind === "start_bonus").length, 1);
});

Deno.test("a card move to Founders' Plaza also awards the start dividend once", () => {
  const state = game();
  state.players[players[0]].position = 6;
  state.eventDeck = ["harbor_transfer"];
  state.eventCursor = 0;
  const result = applyGameAction(state, { type: "roll" }, context(players[0], [1, 1]));
  assertEquals(result.state.players[players[0]].position, 0);
  assertEquals(result.state.players[players[0]].cash, 1700);
  assertEquals(result.events.filter((event) => event.kind === "start_bonus").length, 1);
});

Deno.test("development must remain even across a completed district", () => {
  const state = game();
  state.assets["cedar-quay"].ownerId = players[0];
  state.assets["marina-row"].ownerId = players[0];
  const first = applyGameAction(state, { type: "build", tileId: "cedar-quay" }, context(players[0]));
  assertEquals(first.state.assets["cedar-quay"].buildings, 1);
  assertThrows(
    () => applyGameAction(first.state, { type: "build", tileId: "cedar-quay" }, context(players[0])),
    GameRuleError,
    "Supply kits must be built evenly",
  );
});

Deno.test("declined assets auction to the highest remaining bidder", () => {
  const state = game();
  state.players[players[0]].position = 51;
  const landed = applyGameAction(state, { type: "roll" }, context(players[0]));
  const auction = applyGameAction(landed.state, { type: "decline_asset" }, context(players[0]));
  const bid = applyGameAction(auction.state, { type: "place_bid", amount: 65 }, context(players[1]));
  const settled = applyGameAction(bid.state, { type: "pass_bid" }, context(players[0]));
  assertEquals(settled.state.assets["cedar-quay"].ownerId, players[1]);
  assertEquals(settled.state.players[players[1]].cash, 1435);
});

Deno.test("mortgaging is blocked until district development is sold", () => {
  const state = game();
  state.assets["cedar-quay"].ownerId = players[0];
  state.assets["marina-row"].ownerId = players[0];
  state.assets["cedar-quay"].buildings = 1;
  assertThrows(
    () => applyGameAction(state, { type: "mortgage", tileId: "cedar-quay" }, context(players[0])),
    GameRuleError,
    "Sell all district development",
  );
});

Deno.test("unpayable debt eliminates a player and ends a two-player game", () => {
  const state = game();
  state.players[players[0]].cash = 0;
  state.pendingDebt = { playerId: players[0], amount: 80, creditorId: players[1], reason: "rent", afterPhase: "await_end_turn", addToJackpot: false };
  state.phase = "await_debt";
  const result = applyGameAction(state, { type: "declare_bankruptcy" }, context(players[0]));
  assertEquals(result.state.players[players[0]].bankrupt, true);
  assertEquals(result.state.status, "finished");
  assertEquals(result.memberStatusChanges, [{ userId: players[0], status: "eliminated" }]);
});

Deno.test("a debtor can liquidate assets and complete a debt-relief trade", () => {
  const state = game();
  state.players[players[0]].cash = 0;
  state.assets["cedar-quay"].ownerId = players[0];
  state.assets["marina-row"].ownerId = players[0];
  state.assets["cedar-quay"].buildings = 1;
  state.pendingDebt = { playerId: players[0], amount: 100, creditorId: null, reason: "levy", afterPhase: "await_end_turn", addToJackpot: false };
  state.phase = "await_debt";
  const sold = applyGameAction(state, { type: "sell_building", tileId: "cedar-quay" }, context(players[0]));
  assertEquals(sold.state.players[players[0]].cash, 25);
  const mortgaged = applyGameAction(sold.state, { type: "mortgage", tileId: "cedar-quay" }, context(players[0]));
  assertEquals(mortgaged.state.players[players[0]].cash, 55);
  const offered = applyGameAction(mortgaged.state, {
    type: "offer_trade",
    toUserId: players[1],
    offerCash: 0,
    requestCash: 100,
    offerTileIds: ["cedar-quay"],
    requestTileIds: [],
  }, context(players[0]));
  const trade = offered.state.trades[0];
  const accepted = applyGameAction(offered.state, { type: "respond_trade", tradeId: trade.id, accept: true }, context(players[1]));
  assertEquals(accepted.state.assets["cedar-quay"].ownerId, players[1]);
  assertEquals(accepted.state.players[players[0]].cash, 155);
  assertEquals(accepted.state.phase, "await_debt");
});

Deno.test("expired offers are pruned durably before a new offer can consume the trade limit", () => {
  const state = game();
  state.turnDeadlineAt = new Date(now.getTime() + 10 * 60_000).toISOString();
  state.trades = Array.from({ length: 20 }, (_, index) => ({
    id: `expired-${index}`,
    fromUserId: players[0],
    toUserId: players[1],
    offerCash: 0,
    requestCash: 1,
    offerTileIds: [],
    requestTileIds: [],
    expiresAt: new Date(now.getTime() - 1_000).toISOString(),
  }));
  const result = applyGameAction(state, {
    type: "offer_trade",
    toUserId: players[1],
    offerCash: 25,
    requestCash: 50,
    offerTileIds: [],
    requestTileIds: [],
  }, context(players[0], [1, 1], new Date(now.getTime() + 1_000)));
  assertEquals(result.state.trades.length, 1);
  assertEquals(result.events.filter((event) => event.kind === "trade_expired").length, 20);
  assertEquals(result.events.at(-1)?.kind, "trade_offered");
});

Deno.test("trade terms are visible only to the two trade parties", () => {
  const state = game();
  const offered = applyGameAction(state, {
    type: "offer_trade",
    toUserId: players[1],
    offerCash: 25,
    requestCash: 50,
    offerTileIds: [],
    requestTileIds: [],
  }, context(players[0]));
  const meta = players.map((id, seat) => ({ id, displayName: `Player ${seat + 1}`, avatarColor: "#ef4444", seat, memberStatus: "joined" as const }));
  const publicSnapshot = toPublicSnapshot(offered.state, meta);
  const proposerView = toViewerSnapshot(publicSnapshot, offered.state, players[0]);
  const recipientView = toViewerSnapshot(publicSnapshot, offered.state, players[1]);
  const spectatorView = toViewerSnapshot(publicSnapshot, offered.state, "00000000-0000-4000-8000-000000000003");
  assertEquals((publicSnapshot.trades[0] as Record<string, unknown>).offerCash, undefined);
  assertEquals(proposerView.tradeDetails[0].offerCash, 25);
  assertEquals(recipientView.tradeDetails[0].requestCash, 50);
  assertEquals(spectatorView.tradeDetails, []);
});

Deno.test("detained players can exit only with doubles, a permit, or a fee", () => {
  const state = game();
  state.players[players[0]].isDetained = true;
  assertThrows(
    () => applyGameAction(state, { type: "use_release_permit" }, context(players[0])),
    GameRuleError,
    "cannot use a release permit",
  );
  state.players[players[0]].hasReleasePermit = true;
  const released = applyGameAction(state, { type: "use_release_permit" }, context(players[0]));
  assertEquals(released.state.players[players[0]].isDetained, false);
  assertEquals(released.state.players[players[0]].hasReleasePermit, false);
});

Deno.test("pausing an auction preserves its remaining deadline on resume", () => {
  const state = game();
  state.players[players[0]].position = 51;
  const landed = applyGameAction(state, { type: "roll" }, context(players[0]));
  const auction = applyGameAction(landed.state, { type: "decline_asset" }, context(players[0]));
  const pauseAt = new Date(now.getTime() + 5_000);
  const paused = applyGameAction(auction.state, { type: "pause_game" }, context(players[0], [1, 1], pauseAt));
  assertEquals(paused.state.pausedDeadlineRemainingMs, 15_000);
  const resumeAt = new Date(now.getTime() + 60_000);
  const resumed = applyGameAction(paused.state, { type: "resume_game" }, context(players[0], [1, 1], resumeAt));
  assertEquals(new Date(resumed.state.auction!.endsAt).getTime(), resumeAt.getTime() + 15_000);
  assertEquals(resumed.state.turnDeadlineAt, resumed.state.auction!.endsAt);
});
