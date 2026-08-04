import { describe, expect, it } from "vitest";
import { BOARD, createGameState, reduceGame } from "./index";
import type { GameState, PlayerInput, TileId } from "./index";

const players: PlayerInput[] = [
  { id: "ava", name: "Ava", color: "#38bdf8" },
  { id: "bo", name: "Bo", color: "#f43f5e" },
];

const waitingGame = () => createGameState({ id: "test-game", players, now: 1_000 });

const startedGame = () => reduceGame(waitingGame(), { type: "START_GAME", playerId: "ava", now: 2_000 });

const withOwnership = (state: GameState, ownerId: string, tileIds: TileId[]): GameState => {
  const copy = structuredClone(state) as GameState;
  tileIds.forEach((tileId) => {
    copy.properties[tileId].ownerId = ownerId;
  });
  copy.players.forEach((player) => {
    player.propertyIds = Object.values(copy.properties)
      .filter((property) => property.ownerId === player.id)
      .map((property) => property.tileId);
  });
  return copy;
};

describe("Civic Fortune board", () => {
  it("has an original, data-driven 52-space board with 32 district parcels", () => {
    expect(BOARD).toHaveLength(52);
    expect(BOARD.filter((tile) => tile.kind === "district")).toHaveLength(32);
    expect(BOARD.filter((tile) => tile.kind === "transit")).toHaveLength(4);
    expect(BOARD.filter((tile) => tile.kind === "utility")).toHaveLength(2);
    expect(BOARD.map((tile) => tile.id)).toEqual(expect.arrayContaining(["founders-plaza", "commons-festival", "return-to-hold"]));
  });
});

describe("Civic Fortune reducer", () => {
  it("starts a room, rolls, and buys a landed district without mutating the prior state", () => {
    const started = startedGame();
    const landed = reduceGame(started, { type: "ROLL", playerId: "ava", dice: [1, 2], now: 3_000 });
    const bought = reduceGame(landed, { type: "BUY_PROPERTY", playerId: "ava", now: 3_100 });

    expect(started.phase).toBe("awaitingRoll");
    expect(landed.phase).toBe("awaitingPurchase");
    expect(bought.phase).toBe("awaitingEndTurn");
    expect(bought.properties["marina-row"].ownerId).toBe("ava");
    expect(bought.players.find((player) => player.id === "ava")?.cash).toBe(1_720);
    expect(started.properties["marina-row"].ownerId).toBeNull();
  });

  it("collects rent from a landing player and credits the owner", () => {
    const landed = reduceGame(startedGame(), { type: "ROLL", playerId: "ava", dice: [1, 2], now: 3_000 });
    const owned = reduceGame(landed, { type: "BUY_PROPERTY", playerId: "ava", now: 3_100 });
    const nextTurn = reduceGame(owned, { type: "END_TURN", playerId: "ava", now: 3_200 });
    const rented = reduceGame(nextTurn, { type: "ROLL", playerId: "bo", dice: [1, 2], now: 3_300 });

    expect(rented.phase).toBe("awaitingEndTurn");
    expect(rented.players.find((player) => player.id === "ava")?.cash).toBe(1_726);
    expect(rented.players.find((player) => player.id === "bo")?.cash).toBe(1_794);
    expect(rented.events.at(-1)?.type).toBe("rent");
  });

  it("sells a declined parcel through an open auction", () => {
    const landed = reduceGame(startedGame(), { type: "ROLL", playerId: "ava", dice: [1, 2], now: 3_000 });
    const auction = reduceGame(landed, { type: "DECLINE_PROPERTY", playerId: "ava", now: 3_100 });
    const bid = reduceGame(auction, { type: "PLACE_BID", playerId: "ava", amount: 50, now: 3_200 });
    const closed = reduceGame(bid, { type: "PASS_BID", playerId: "bo", now: 3_300 });

    expect(auction.phase).toBe("auction");
    expect(closed.phase).toBe("awaitingEndTurn");
    expect(closed.properties["marina-row"].ownerId).toBe("ava");
    expect(closed.players.find((player) => player.id === "ava")?.cash).toBe(1_750);
  });

  it("enforces even construction and allows half-price building sales", () => {
    const owned = withOwnership(startedGame(), "ava", ["cedar-quay", "marina-row"]);
    const firstBuild = reduceGame(owned, { type: "BUILD", playerId: "ava", tileId: "cedar-quay", now: 3_000 });

    expect(firstBuild.properties["cedar-quay"].buildings).toBe(1);
    expect(() => reduceGame(firstBuild, { type: "BUILD", playerId: "ava", tileId: "cedar-quay", now: 3_100 })).toThrow(/evenly/i);

    const evenBuild = reduceGame(firstBuild, { type: "BUILD", playerId: "ava", tileId: "marina-row", now: 3_200 });
    const sold = reduceGame(evenBuild, { type: "SELL_BUILDING", playerId: "ava", tileId: "marina-row", now: 3_300 });
    expect(sold.properties["marina-row"].buildings).toBe(0);
    expect(sold.players.find((player) => player.id === "ava")?.cash).toBe(1_725);
  });

  it("creates debt when rent exceeds cash and resolves bankruptcy", () => {
    let state = withOwnership(startedGame(), "bo", ["marina-row"]);
    state = structuredClone(state) as GameState;
    state.players.find((player) => player.id === "ava")!.cash = 3;
    const indebted = reduceGame(state, { type: "ROLL", playerId: "ava", dice: [1, 2], now: 3_000 });
    const bankrupt = reduceGame(indebted, { type: "DECLARE_BANKRUPTCY", playerId: "ava", now: 3_100 });

    expect(indebted.phase).toBe("awaitingDebt");
    expect(indebted.debt).toMatchObject({ playerId: "ava", amount: 3, creditorPlayerId: "bo" });
    expect(bankrupt.players.find((player) => player.id === "ava")?.status).toBe("bankrupt");
    expect(bankrupt.status).toBe("complete");
    expect(bankrupt.winnerId).toBe("bo");
  });

  it("transfers cash and property after a valid accepted trade", () => {
    const ownedByAva = withOwnership(startedGame(), "ava", ["cedar-quay"]);
    const owned = withOwnership(ownedByAva, "bo", ["marina-row"]);
    const offered = reduceGame(owned, {
      type: "OFFER_TRADE",
      playerId: "ava",
      toPlayerId: "bo",
      offeredPropertyIds: ["cedar-quay"],
      requestedPropertyIds: ["marina-row"],
      offeredCash: 30,
      now: 3_000,
      tradeId: "swap-1",
    });
    const accepted = reduceGame(offered, { type: "RESPOND_TRADE", playerId: "bo", tradeId: "swap-1", accept: true, now: 3_100 });

    expect(accepted.properties["cedar-quay"].ownerId).toBe("bo");
    expect(accepted.properties["marina-row"].ownerId).toBe("ava");
    expect(accepted.players.find((player) => player.id === "ava")?.cash).toBe(1_770);
    expect(accepted.players.find((player) => player.id === "bo")?.cash).toBe(1_830);
  });

  it("applies a card effect from the server-side deck", () => {
    let state = startedGame();
    state = structuredClone(state) as GameState;
    state.players.find((player) => player.id === "ava")!.position = 6;
    const cardState = reduceGame(state, { type: "ROLL", playerId: "ava", dice: [1, 1], now: 3_000 });

    expect(cardState.players.find((player) => player.id === "ava")?.cash).toBe(1_950);
    expect(cardState.events.some((event) => event.type === "card" && event.data?.cardId === "event-market-surge")).toBe(true);
  });
});
