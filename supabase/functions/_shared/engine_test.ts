import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { activateGame, applyGameAction, createInitialGameState } from "./engine.ts";
import { DEFAULT_SETTINGS, GameRuleError, type EngineContext, type PrivateGameState } from "./contracts.ts";

const players = ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"];
const now = new Date("2026-08-05T12:00:00.000Z");

function context(actorId: string, dice: [number, number] = [1, 1]): EngineContext {
  return { actorId, now, isHost: actorId === players[0], rollDice: () => dice, makeId: () => "00000000-0000-4000-8000-000000000099" };
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
