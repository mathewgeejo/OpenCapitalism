import {
  ASSET_TILES,
  BOARD,
  BOARD_BY_ID,
  DETENTION_INDEX,
  districtTiles,
  isAsset,
  tileAt,
  type BoardTile,
  type DistrictTile,
} from "./board.ts";
import {
  type AssetState,
  type EngineContext,
  type EngineResult,
  type GameAction,
  type GameSettings,
  type GameStatus,
  type PendingDebt,
  type PlayerMeta,
  type PrivateGameState,
  type PublicGameEvent,
  type PublicGameSnapshot,
  GameRuleError,
} from "./contracts.ts";

type CardEffect =
  | { type: "cash"; amount: number }
  | { type: "pay"; amount: number; jackpot?: boolean }
  | { type: "move"; position: number }
  | { type: "nearest_route" }
  | { type: "detention" }
  | { type: "release_permit" };

interface Card {
  id: string;
  title: string;
  effect: CardEffect;
}

const EVENT_CARDS: readonly Card[] = [
  { id: "street_festival", title: "Street festival dividend", effect: { type: "cash", amount: 120 } },
  { id: "signal_repair", title: "Signal repair assessment", effect: { type: "pay", amount: 60, jackpot: true } },
  { id: "express_route", title: "Express route diversion", effect: { type: "nearest_route" } },
  { id: "audit_notice", title: "Audit notice", effect: { type: "detention" } },
  { id: "harbor_transfer", title: "Harbor transfer", effect: { type: "move", position: 0 } },
  { id: "release_badge", title: "Civic release permit", effect: { type: "release_permit" } },
  { id: "market_rebate", title: "Market rebate", effect: { type: "cash", amount: 80 } },
  { id: "storm_cleanup", title: "Storm cleanup contribution", effect: { type: "pay", amount: 90, jackpot: true } },
];

const CIVIC_CARDS: readonly Card[] = [
  { id: "infrastructure_grant", title: "Infrastructure grant", effect: { type: "cash", amount: 150 } },
  { id: "city_services", title: "City services contribution", effect: { type: "pay", amount: 50, jackpot: true } },
  { id: "public_art", title: "Public-art award", effect: { type: "cash", amount: 70 } },
  { id: "zoning_hearing", title: "Zoning hearing", effect: { type: "move", position: 39 } },
  { id: "release_authorization", title: "Release authorization", effect: { type: "release_permit" } },
  { id: "garden_endowment", title: "Garden endowment", effect: { type: "cash", amount: 110 } },
  { id: "council_fee", title: "Council filing fee", effect: { type: "pay", amount: 75, jackpot: true } },
  { id: "district_transfer", title: "District transfer", effect: { type: "move", position: 25 } },
];

const EVENT_CARD_BY_ID = new Map(EVENT_CARDS.map((card) => [card.id, card]));
const CIVIC_CARD_BY_ID = new Map(CIVIC_CARDS.map((card) => [card.id, card]));

const money = (amount: number) => `$${amount.toLocaleString("en-US")}`;
const clone = <T>(value: T): T => structuredClone(value);
const isoAfter = (now: Date, seconds: number) => new Date(now.getTime() + seconds * 1000).toISOString();
const rule = (code: string, message: string): never => { throw new GameRuleError(code, message); };

function alivePlayerIds(state: PrivateGameState): string[] {
  return state.turnOrder.filter((id) => state.players[id] && !state.players[id].bankrupt);
}

function assertKnownPlayer(state: PrivateGameState, userId: string) {
  if (!state.players[userId] || state.players[userId].bankrupt) rule("NOT_ELIGIBLE", "That player cannot take game actions");
}

function assertActive(state: PrivateGameState) {
  if (state.status !== "active") rule("GAME_NOT_ACTIVE", "This game is not active");
}

function assertTurn(state: PrivateGameState, actorId: string) {
  if (state.currentPlayerId !== actorId) rule("NOT_YOUR_TURN", "It is not your turn");
}

function assertPhase(state: PrivateGameState, ...allowed: PrivateGameState["phase"][]) {
  if (!allowed.includes(state.phase)) rule("INVALID_PHASE", "That action is not available right now");
}

function playerName(meta: Map<string, PlayerMeta>, id: string): string {
  return meta.get(id)?.displayName ?? "A player";
}

function assetState(state: PrivateGameState, tileId: string): AssetState {
  const value = state.assets[tileId];
  if (!value) rule("INVALID_ASSET", "Unknown asset");
  return value;
}

function assetTile(tileId: string): DistrictTile | Extract<typeof ASSET_TILES[number], { kind: "route" | "works" }> {
  const tile = BOARD_BY_ID.get(tileId);
  if (!tile || !isAsset(tile)) throw new GameRuleError("INVALID_ASSET", "That space is not an asset");
  return tile;
}

function ownedAssets(state: PrivateGameState, userId: string): string[] {
  return Object.entries(state.assets).filter(([, value]) => value.ownerId === userId).map(([id]) => id);
}

function ownsEntireDistrict(state: PrivateGameState, ownerId: string, district: string): boolean {
  return districtTiles(district).every((tile) => state.assets[tile.id]?.ownerId === ownerId);
}

function districtHasBuildings(state: PrivateGameState, district: string): boolean {
  return districtTiles(district).some((tile) => (state.assets[tile.id]?.buildings ?? 0) > 0);
}

function districtHasMortgage(state: PrivateGameState, district: string): boolean {
  return districtTiles(district).some((tile) => state.assets[tile.id]?.mortgaged);
}

function setTurnDeadline(state: PrivateGameState, ctx: EngineContext, seconds = state.settings.turnSeconds) {
  state.turnDeadlineAt = isoAfter(ctx.now, seconds);
}

function markAwaitEnd(state: PrivateGameState) {
  if (state.status === "active" && !state.pendingDebt && !state.pendingPurchase && !state.auction) {
    state.phase = "await_end_turn";
  }
}

function credit(state: PrivateGameState, userId: string, amount: number) {
  state.players[userId].cash += amount;
}

function charge(
  state: PrivateGameState,
  playerId: string,
  amount: number,
  creditorId: string | null,
  reason: string,
  afterPhase: PendingDebt["afterPhase"],
  events: PublicGameEvent[],
  addToJackpot = false,
): boolean {
  const player = state.players[playerId];
  if (player.cash >= amount) {
    player.cash -= amount;
    if (creditorId) credit(state, creditorId, amount);
    if (addToJackpot && state.settings.jackpotEnabled) state.jackpot += amount;
    events.push({ kind: "payment", actorId: playerId, message: `${reason}: ${money(amount)}`, data: { amount, creditorId } });
    return true;
  }
  state.pendingDebt = { playerId, amount, creditorId, reason, afterPhase, addToJackpot };
  state.phase = "await_debt";
  state.canRollAgain = false;
  events.push({ kind: "debt_due", actorId: playerId, message: `${playerId} owes ${money(amount)} for ${reason}`, data: { amount, creditorId, reason } });
  return false;
}

function moveBy(state: PrivateGameState, playerId: string, steps: number, events: PublicGameEvent[]) {
  const player = state.players[playerId];
  const oldPosition = player.position;
  const absolute = oldPosition + steps;
  player.position = absolute % BOARD.length;
  if (absolute >= BOARD.length) {
    credit(state, playerId, state.settings.startBonus);
    events.push({ kind: "start_bonus", actorId: playerId, message: `Passed Harbor Gate and collected ${money(state.settings.startBonus)}`, data: { amount: state.settings.startBonus } });
  }
}

function moveTo(state: PrivateGameState, playerId: string, position: number, events: PublicGameEvent[], collectStart = true) {
  const player = state.players[playerId];
  if (collectStart && position < player.position) {
    credit(state, playerId, state.settings.startBonus);
    events.push({ kind: "start_bonus", actorId: playerId, message: `Passed Harbor Gate and collected ${money(state.settings.startBonus)}`, data: { amount: state.settings.startBonus } });
  }
  player.position = position;
}

function sendToDetention(state: PrivateGameState, playerId: string, events: PublicGameEvent[], reason: string) {
  const player = state.players[playerId];
  player.position = DETENTION_INDEX;
  player.isDetained = true;
  player.detentionAttempts = 0;
  player.doublesThisTurn = 0;
  state.canRollAgain = false;
  state.phase = "await_end_turn";
  events.push({ kind: "detained", actorId: playerId, message: `${reason}; sent to Civic Holding`, data: { position: DETENTION_INDEX } });
}

function calculateRent(state: PrivateGameState, tile: ReturnType<typeof assetTile>, rollTotal: number): number {
  const asset = assetState(state, tile.id);
  if (!asset.ownerId || asset.mortgaged) return 0;
  if (tile.kind === "district") {
    if (asset.buildings > 0) return tile.rents[asset.buildings];
    return ownsEntireDistrict(state, asset.ownerId, tile.district) ? tile.rents[0] * 2 : tile.rents[0];
  }
  if (tile.kind === "route") {
    const ownedRoutes = ASSET_TILES.filter((candidate) => candidate.kind === "route" && state.assets[candidate.id]?.ownerId === asset.ownerId).length;
    return 25 * 2 ** Math.max(0, ownedRoutes - 1);
  }
  const ownedWorks = ASSET_TILES.filter((candidate) => candidate.kind === "works" && state.assets[candidate.id]?.ownerId === asset.ownerId).length;
  return Math.max(1, rollTotal) * (ownedWorks >= 2 ? 10 : 4);
}

function nextRoutePosition(position: number): number {
  for (let offset = 1; offset <= BOARD.length; offset += 1) {
    const candidate = tileAt(position + offset);
    if (candidate.kind === "route") return candidate.index;
  }
  return position;
}

function drawCard(
  state: PrivateGameState,
  playerId: string,
  deckKind: "event" | "civic",
  ctx: EngineContext,
  events: PublicGameEvent[],
  rollTotal: number,
) {
  const ids = deckKind === "event" ? state.eventDeck : state.civicDeck;
  const cursorKey = deckKind === "event" ? "eventCursor" : "civicCursor";
  let cursor = state[cursorKey];
  if (cursor >= ids.length) cursor = 0;
  const card = (deckKind === "event" ? EVENT_CARD_BY_ID : CIVIC_CARD_BY_ID).get(ids[cursor]);
  if (!card) throw new GameRuleError("STATE_CORRUPT", "Card deck is invalid");
  state[cursorKey] = (cursor + 1) % ids.length;
  events.push({ kind: "card_drawn", actorId: playerId, message: `${playerId} drew ${card.title}`, data: { deck: deckKind, cardId: card.id } });

  switch (card.effect.type) {
    case "cash":
      credit(state, playerId, card.effect.amount);
      events.push({ kind: "card_effect", actorId: playerId, message: `${playerId} received ${money(card.effect.amount)}`, data: { amount: card.effect.amount } });
      markAwaitEnd(state);
      return;
    case "pay":
      if (charge(state, playerId, card.effect.amount, null, card.title, "await_end_turn", events, Boolean(card.effect.jackpot))) markAwaitEnd(state);
      return;
    case "move":
      moveTo(state, playerId, card.effect.position, events);
      resolveLanding(state, playerId, ctx, events, rollTotal);
      return;
    case "nearest_route":
      moveTo(state, playerId, nextRoutePosition(state.players[playerId].position), events);
      resolveLanding(state, playerId, ctx, events, rollTotal);
      return;
    case "detention":
      sendToDetention(state, playerId, events, card.title);
      return;
    case "release_permit":
      state.players[playerId].hasReleasePermit = true;
      events.push({ kind: "card_effect", actorId: playerId, message: `${playerId} received a release permit`, data: {} });
      markAwaitEnd(state);
      return;
  }
}

function resolveLanding(state: PrivateGameState, playerId: string, ctx: EngineContext, events: PublicGameEvent[], rollTotal: number) {
  const tile = tileAt(state.players[playerId].position);
  events.push({ kind: "landed", actorId: playerId, message: `${playerId} landed on ${tile.name}`, data: { tileId: tile.id, position: tile.index } });

  if (isAsset(tile)) {
    const asset = assetState(state, tile.id);
    if (!asset.ownerId) {
      state.pendingPurchase = { tileId: tile.id, cost: tile.price };
      state.phase = "await_purchase";
      return;
    }
    if (asset.ownerId === playerId || asset.mortgaged) {
      markAwaitEnd(state);
      return;
    }
    const rent = calculateRent(state, tile, rollTotal);
    if (rent > 0) {
      if (charge(state, playerId, rent, asset.ownerId, `rent at ${tile.name}`, "await_end_turn", events)) markAwaitEnd(state);
    }
    else markAwaitEnd(state);
    return;
  }

  if (tile.kind === "levy") {
    if (charge(state, playerId, tile.amount, null, tile.name, "await_end_turn", events, true)) markAwaitEnd(state);
    return;
  }
  if (tile.kind === "event" || tile.kind === "civic") {
    drawCard(state, playerId, tile.kind, ctx, events, rollTotal);
    return;
  }
  if (tile.kind === "corner") {
    if (tile.effect === "start") {
      credit(state, playerId, state.settings.startBonus);
      events.push({ kind: "start_bonus", actorId: playerId, message: `Landed on Harbor Gate and collected ${money(state.settings.startBonus)}`, data: { amount: state.settings.startBonus } });
    } else if (tile.effect === "commons" && state.settings.jackpotEnabled && state.jackpot > 0) {
      const reward = state.jackpot;
      state.jackpot = 0;
      credit(state, playerId, reward);
      events.push({ kind: "jackpot_collected", actorId: playerId, message: `${playerId} collected the Commons fund: ${money(reward)}`, data: { amount: reward } });
    } else if (tile.effect === "audit") {
      sendToDetention(state, playerId, events, "Audit Office review");
      return;
    }
    markAwaitEnd(state);
  }
}

function startAuction(state: PrivateGameState, tileId: string, ctx: EngineContext, events: PublicGameEvent[]) {
  const tile = assetTile(tileId);
  const asset = assetState(state, tileId);
  if (asset.ownerId) rule("INVALID_AUCTION", "That asset is already owned");
  state.pendingPurchase = null;
  state.auction = {
    tileId,
    highestBid: 0,
    highestBidderId: null,
    passedPlayerIds: [],
    endsAt: isoAfter(ctx.now, state.settings.auctionSeconds),
  };
  state.turnDeadlineAt = state.auction.endsAt;
  state.phase = "await_auction";
  events.push({ kind: "auction_started", actorId: state.currentPlayerId, message: `${tile.name} entered an open auction`, data: { tileId, endsAt: state.auction.endsAt } });
}

function settleAuction(state: PrivateGameState, ctx: EngineContext, events: PublicGameEvent[]) {
  const auction = state.auction;
  if (!auction) return;
  const tile = assetTile(auction.tileId);
  if (auction.highestBidderId && state.players[auction.highestBidderId].cash >= auction.highestBid) {
    state.players[auction.highestBidderId].cash -= auction.highestBid;
    state.assets[auction.tileId].ownerId = auction.highestBidderId;
    events.push({ kind: "auction_won", actorId: auction.highestBidderId, message: `${auction.highestBidderId} won ${tile.name} for ${money(auction.highestBid)}`, data: { tileId: tile.id, amount: auction.highestBid } });
  } else {
    events.push({ kind: "auction_closed", actorId: state.currentPlayerId, message: `No qualifying bid for ${tile.name}`, data: { tileId: tile.id } });
  }
  state.auction = null;
  state.phase = "await_end_turn";
  setTurnDeadline(state, ctx);
}

function maybeSettleAuction(state: PrivateGameState, ctx: EngineContext, events: PublicGameEvent[]) {
  const auction = state.auction;
  if (!auction) return;
  const active = alivePlayerIds(state);
  const eligibleToPass = active.filter((id) => id !== auction.highestBidderId);
  if (eligibleToPass.every((id) => auction.passedPlayerIds.includes(id))) settleAuction(state, ctx, events);
}

function advanceTurn(state: PrivateGameState, ctx: EngineContext, events: PublicGameEvent[]) {
  const alive = alivePlayerIds(state);
  if (alive.length <= 1) {
    state.status = "finished";
    state.phase = "finished";
    state.turnDeadlineAt = null;
    state.currentPlayerId = alive[0] ?? null;
    if (alive[0]) events.push({ kind: "game_finished", actorId: alive[0], message: `${alive[0]} wins Civic Fortune`, data: { winnerId: alive[0] } });
    return;
  }

  const currentIndex = Math.max(0, state.turnOrder.indexOf(state.currentPlayerId ?? ""));
  let nextId = alive[0];
  for (let offset = 1; offset <= state.turnOrder.length; offset += 1) {
    const candidate = state.turnOrder[(currentIndex + offset) % state.turnOrder.length];
    if (alive.includes(candidate)) {
      nextId = candidate;
      if (currentIndex + offset >= state.turnOrder.length) state.round += 1;
      break;
    }
  }
  state.currentPlayerId = nextId;
  state.players[nextId].doublesThisTurn = 0;
  state.canRollAgain = false;
  state.pendingPurchase = null;
  state.pendingDebt = null;
  state.phase = "await_roll";
  setTurnDeadline(state, ctx);
  events.push({ kind: "turn_started", actorId: nextId, message: `${nextId}'s turn`, data: { playerId: nextId, deadlineAt: state.turnDeadlineAt } });
}

function endTurn(state: PrivateGameState, ctx: EngineContext, events: PublicGameEvent[]) {
  if (state.canRollAgain && !state.players[state.currentPlayerId!].isDetained) {
    state.canRollAgain = false;
    state.phase = "await_roll";
    setTurnDeadline(state, ctx);
    events.push({ kind: "bonus_roll", actorId: state.currentPlayerId, message: `${state.currentPlayerId} earned another roll`, data: {} });
    return;
  }
  advanceTurn(state, ctx, events);
}

function buildOn(state: PrivateGameState, actorId: string, tileId: string, events: PublicGameEvent[]) {
  const tile = assetTile(tileId);
  if (tile.kind !== "district") throw new GameRuleError("INVALID_BUILD", "Only districts can receive supply kits");
  const asset = assetState(state, tileId);
  if (asset.ownerId !== actorId) rule("NOT_OWNER", "You do not own that district");
  if (!ownsEntireDistrict(state, actorId, tile.district)) rule("INCOMPLETE_DISTRICT", "Own the full district before building");
  if (districtHasMortgage(state, tile.district)) rule("DISTRICT_MORTGAGED", "Clear every district mortgage before building");
  if (asset.buildings >= 5) rule("MAX_DEVELOPMENT", "That district already has a landmark");
  const peers = districtTiles(tile.district).map((candidate) => assetState(state, candidate.id).buildings);
  if (asset.buildings !== Math.min(...peers)) rule("EVEN_DEVELOPMENT_REQUIRED", "Supply kits must be built evenly across a district");
  if (state.players[actorId].cash < tile.buildCost) rule("INSUFFICIENT_CASH", "Not enough cash to build there");
  state.players[actorId].cash -= tile.buildCost;
  asset.buildings += 1;
  events.push({ kind: "building_added", actorId, message: `${actorId} added ${asset.buildings === 5 ? "a landmark" : "a supply kit"} at ${tile.name}`, data: { tileId, buildings: asset.buildings } });
}

function sellBuilding(state: PrivateGameState, actorId: string, tileId: string, events: PublicGameEvent[]) {
  const tile = assetTile(tileId);
  if (tile.kind !== "district") throw new GameRuleError("INVALID_BUILD", "Only districts have supply kits");
  const asset = assetState(state, tileId);
  if (asset.ownerId !== actorId) rule("NOT_OWNER", "You do not own that district");
  if (asset.buildings <= 0) rule("NO_BUILDINGS", "There is no development to sell");
  const after = asset.buildings - 1;
  const peers = districtTiles(tile.district).filter((candidate) => candidate.id !== tile.id).map((candidate) => assetState(state, candidate.id).buildings);
  if (peers.some((count) => count > after + 1)) rule("EVEN_DEVELOPMENT_REQUIRED", "Supply kits must be sold evenly across a district");
  asset.buildings = after;
  credit(state, actorId, Math.floor(tile.buildCost / 2));
  events.push({ kind: "building_sold", actorId, message: `${actorId} sold development at ${tile.name}`, data: { tileId, buildings: asset.buildings } });
}

function mortgage(state: PrivateGameState, actorId: string, tileId: string, events: PublicGameEvent[]) {
  const tile = assetTile(tileId);
  const asset = assetState(state, tileId);
  if (asset.ownerId !== actorId) rule("NOT_OWNER", "You do not own that asset");
  if (asset.mortgaged) rule("ALREADY_MORTGAGED", "That asset is already mortgaged");
  if (tile.kind === "district" && districtHasBuildings(state, tile.district)) rule("BUILDINGS_PRESENT", "Sell all district development before mortgaging");
  asset.mortgaged = true;
  credit(state, actorId, tile.mortgageValue);
  events.push({ kind: "mortgaged", actorId, message: `${actorId} mortgaged ${tile.name} for ${money(tile.mortgageValue)}`, data: { tileId, amount: tile.mortgageValue } });
}

function unmortgage(state: PrivateGameState, actorId: string, tileId: string, events: PublicGameEvent[]) {
  const tile = assetTile(tileId);
  const asset = assetState(state, tileId);
  if (asset.ownerId !== actorId) rule("NOT_OWNER", "You do not own that asset");
  if (!asset.mortgaged) rule("NOT_MORTGAGED", "That asset is not mortgaged");
  const amount = Math.ceil(tile.mortgageValue * 1.1);
  if (state.players[actorId].cash < amount) rule("INSUFFICIENT_CASH", "Not enough cash to clear this mortgage");
  state.players[actorId].cash -= amount;
  asset.mortgaged = false;
  events.push({ kind: "unmortgaged", actorId, message: `${actorId} cleared the mortgage on ${tile.name}`, data: { tileId, amount } });
}

function assertTradableAssets(state: PrivateGameState, ownerId: string, tileIds: string[]) {
  for (const tileId of tileIds) {
    const tile = assetTile(tileId);
    const asset = assetState(state, tileId);
    if (asset.ownerId !== ownerId) rule("NOT_OWNER", "A proposed trade includes an asset its owner does not hold");
    if (tile.kind === "district" && districtHasBuildings(state, tile.district)) rule("BUILDINGS_PRESENT", "Sell district development before trading it");
  }
}

function transferTrade(state: PrivateGameState, actorId: string, tradeId: string, accept: boolean, ctx: EngineContext, events: PublicGameEvent[]) {
  const index = state.trades.findIndex((trade) => trade.id === tradeId);
  if (index < 0) rule("TRADE_NOT_FOUND", "That trade is no longer available");
  const trade = state.trades[index];
  if (trade.toUserId !== actorId) rule("NOT_TRADE_RECIPIENT", "Only the invited player can respond");
  if (new Date(trade.expiresAt).getTime() <= ctx.now.getTime()) {
    state.trades.splice(index, 1);
    rule("TRADE_EXPIRED", "That trade has expired");
  }
  if (!accept) {
    state.trades.splice(index, 1);
    events.push({ kind: "trade_declined", actorId, message: `${actorId} declined a trade`, data: { tradeId } });
    return;
  }
  if (state.players[trade.fromUserId].cash < trade.offerCash || state.players[trade.toUserId].cash < trade.requestCash) {
    rule("TRADE_CASH_CHANGED", "One player no longer has the proposed cash");
  }
  assertTradableAssets(state, trade.fromUserId, trade.offerTileIds);
  assertTradableAssets(state, trade.toUserId, trade.requestTileIds);
  state.players[trade.fromUserId].cash += trade.requestCash - trade.offerCash;
  state.players[trade.toUserId].cash += trade.offerCash - trade.requestCash;
  for (const tileId of trade.offerTileIds) state.assets[tileId].ownerId = trade.toUserId;
  for (const tileId of trade.requestTileIds) state.assets[tileId].ownerId = trade.fromUserId;
  state.trades.splice(index, 1);
  events.push({ kind: "trade_completed", actorId, message: `${trade.fromUserId} and ${trade.toUserId} completed a trade`, data: { tradeId } });
}

function bankruptPlayer(state: PrivateGameState, playerId: string, ctx: EngineContext, events: PublicGameEvent[], changes: EngineResult["memberStatusChanges"]) {
  const debt = state.pendingDebt;
  if (!debt || debt.playerId !== playerId) throw new GameRuleError("NO_DEBT", "There is no debt to resolve");
  const player = state.players[playerId];
  const creditor = debt.creditorId && state.players[debt.creditorId] && !state.players[debt.creditorId].bankrupt ? debt.creditorId : null;
  if (creditor && player.cash > 0) credit(state, creditor, player.cash);
  for (const tileId of ownedAssets(state, playerId)) {
    const asset = state.assets[tileId];
    asset.ownerId = creditor;
    if (!creditor) {
      asset.buildings = 0;
      asset.mortgaged = false;
    }
  }
  player.cash = 0;
  player.bankrupt = true;
  state.pendingDebt = null;
  state.pendingPurchase = null;
  state.trades = state.trades.filter((trade) => trade.fromUserId !== playerId && trade.toUserId !== playerId);
  changes.push({ userId: playerId, status: "eliminated" });
  events.push({ kind: "player_eliminated", actorId: playerId, message: `${playerId} is out of Civic Fortune`, data: { creditorId: creditor } });
  advanceTurn(state, ctx, events);
}

/** Creates hidden canonical state. Call it at room creation and again at start. */
export function createInitialGameState(playerIds: string[], settings: GameSettings, now: Date, shuffle: <T>(items: T[]) => T[]): PrivateGameState {
  if (playerIds.length < 1 || playerIds.length > 20) throw new GameRuleError("INVALID_PLAYERS", "A room needs one to twenty players");
  const assets: Record<string, AssetState> = {};
  for (const tile of ASSET_TILES) assets[tile.id] = { ownerId: null, buildings: 0, mortgaged: false };
  const players = Object.fromEntries(playerIds.map((id) => [id, {
    cash: 1500,
    position: 0,
    isDetained: false,
    detentionAttempts: 0,
    hasReleasePermit: false,
    doublesThisTurn: 0,
    bankrupt: false,
  }]));
  return {
    schemaVersion: 1,
    status: "lobby",
    phase: "await_roll",
    settings,
    currentPlayerId: playerIds[0],
    turnDeadlineAt: null,
    round: 1,
    turnOrder: [...playerIds],
    players,
    assets,
    pendingPurchase: null,
    pendingDebt: null,
    auction: null,
    trades: [],
    jackpot: 0,
    lastRoll: null,
    eventDeck: shuffle(EVENT_CARDS.map((card) => card.id)),
    civicDeck: shuffle(CIVIC_CARDS.map((card) => card.id)),
    eventCursor: 0,
    civicCursor: 0,
    canRollAgain: false,
    phaseBeforePause: null,
    pausedDeadlineRemainingMs: null,
  };
}

export function activateGame(state: PrivateGameState, ctx: EngineContext): PrivateGameState {
  const next = clone(state);
  if (next.turnOrder.length < 2) rule("NEED_TWO_PLAYERS", "At least two players are needed to start");
  next.status = "active";
  next.phase = "await_roll";
  next.currentPlayerId = next.turnOrder[0];
  setTurnDeadline(next, ctx);
  return next;
}

/** Applies a single validated intent to a private state copy. */
export function applyGameAction(source: PrivateGameState, action: GameAction, ctx: EngineContext): EngineResult {
  const state = clone(source);
  const events: PublicGameEvent[] = [];
  const memberStatusChanges: EngineResult["memberStatusChanges"] = [];
  const actorId = ctx.actorId;
  assertKnownPlayer(state, actorId);

  const requireTurn = () => { assertActive(state); assertTurn(state, actorId); };
  const managementPhase = () => assertPhase(state, "await_roll", "await_end_turn");

  // The scheduler resolves expiry, but do not let a late client intent sneak
  // in during its polling window. The transaction RPC repeats this check under
  // the row lock so the edge check is not the sole enforcement point.
  if (state.status === "active" && action.type !== "resolve_deadline") {
    const deadline = state.auction?.endsAt ?? state.turnDeadlineAt;
    if (deadline && new Date(deadline).getTime() <= ctx.now.getTime()) {
      throw new GameRuleError("DEADLINE_EXPIRED", "The turn timer has expired; refresh the board");
    }
  }

  if (action.type === "pause_game") {
    assertActive(state);
    if (!ctx.isHost) rule("HOST_ONLY", "Only the host can pause the game");
    const deadline = state.auction?.endsAt ?? state.turnDeadlineAt;
    state.pausedDeadlineRemainingMs = deadline ? Math.max(0, new Date(deadline).getTime() - ctx.now.getTime()) : null;
    state.phaseBeforePause = state.phase;
    state.phase = "paused";
    state.status = "paused";
    state.turnDeadlineAt = null;
    events.push({ kind: "game_paused", actorId, message: "The host paused the game", data: {} });
    return { state, events, memberStatusChanges };
  }
  if (action.type === "resume_game") {
    if (state.status !== "paused") rule("GAME_NOT_PAUSED", "The game is not paused");
    if (!ctx.isHost) rule("HOST_ONLY", "Only the host can resume the game");
    state.status = "active";
    state.phase = state.phaseBeforePause ?? "await_roll";
    state.phaseBeforePause = null;
    if (state.pausedDeadlineRemainingMs !== null) {
      const resumedDeadline = new Date(ctx.now.getTime() + state.pausedDeadlineRemainingMs).toISOString();
      state.turnDeadlineAt = resumedDeadline;
      if (state.auction) state.auction.endsAt = resumedDeadline;
    } else {
      setTurnDeadline(state, ctx);
    }
    state.pausedDeadlineRemainingMs = null;
    events.push({ kind: "game_resumed", actorId, message: "The host resumed the game", data: {} });
    return { state, events, memberStatusChanges };
  }
  if (action.type === "end_game") {
    if (!ctx.isHost) rule("HOST_ONLY", "Only the host can end the game");
    if (state.status === "finished" || state.status === "abandoned") rule("GAME_ENDED", "This game has already ended");
    state.status = "finished";
    state.phase = "finished";
    state.turnDeadlineAt = null;
    events.push({ kind: "game_ended", actorId, message: "The host ended the game", data: {} });
    return { state, events, memberStatusChanges };
  }

  if (action.type === "resolve_deadline") {
    assertActive(state);
    const deadline = state.auction?.endsAt ?? state.turnDeadlineAt;
    if (!deadline || new Date(deadline).getTime() > ctx.now.getTime()) rule("NOT_DUE", "This deadline has not expired");
    if (state.auction) {
      settleAuction(state, ctx, events);
    } else if (state.pendingPurchase) {
      startAuction(state, state.pendingPurchase.tileId, ctx, events);
    } else if (state.pendingDebt) {
      bankruptPlayer(state, state.pendingDebt.playerId, ctx, events, memberStatusChanges);
    } else {
      events.push({ kind: "turn_expired", actorId: state.currentPlayerId, message: "Turn timer expired", data: {} });
      advanceTurn(state, ctx, events);
    }
    return { state, events, memberStatusChanges };
  }

  if (action.type === "respond_trade") {
    assertActive(state);
    if (state.auction || state.pendingDebt) rule("TRADE_UNAVAILABLE", "Trades are not available while a resolution is pending");
    transferTrade(state, actorId, action.tradeId, action.accept, ctx, events);
    return { state, events, memberStatusChanges };
  }
  if (action.type === "cancel_trade") {
    assertActive(state);
    const index = state.trades.findIndex((trade) => trade.id === action.tradeId);
    if (index < 0) rule("TRADE_NOT_FOUND", "That trade is no longer available");
    const trade = state.trades[index];
    if (trade.fromUserId !== actorId && trade.toUserId !== actorId) rule("NOT_TRADE_PARTY", "Only a trade party may cancel it");
    state.trades.splice(index, 1);
    events.push({ kind: "trade_cancelled", actorId, message: `${actorId} cancelled a trade`, data: { tradeId: action.tradeId } });
    return { state, events, memberStatusChanges };
  }
  if (action.type === "place_bid" || action.type === "pass_bid") {
    assertActive(state);
    assertPhase(state, "await_auction");
    const auction = state.auction;
    if (!auction) throw new GameRuleError("NO_AUCTION", "There is no active auction");
    if (auction.passedPlayerIds.includes(actorId)) rule("AUCTION_PASSED", "You have already passed on this auction");
    if (action.type === "place_bid") {
      if (action.amount < auction.highestBid + 5) rule("BID_TOO_LOW", "Bids must increase by at least $5");
      if (state.players[actorId].cash < action.amount) rule("INSUFFICIENT_CASH", "You cannot bid more cash than you hold");
      auction.highestBid = action.amount;
      auction.highestBidderId = actorId;
      events.push({ kind: "bid_placed", actorId, message: `${actorId} bid ${money(action.amount)}`, data: { tileId: auction.tileId, amount: action.amount } });
    } else {
      auction.passedPlayerIds.push(actorId);
      events.push({ kind: "auction_passed", actorId, message: `${actorId} passed on the auction`, data: { tileId: auction.tileId } });
    }
    maybeSettleAuction(state, ctx, events);
    return { state, events, memberStatusChanges };
  }

  requireTurn();

  switch (action.type) {
    case "roll": {
      assertPhase(state, "await_roll");
      const player = state.players[actorId];
      const dice = ctx.rollDice();
      const total = dice[0] + dice[1];
      const doubled = dice[0] === dice[1];
      state.lastRoll = { playerId: actorId, dice };
      events.push({ kind: "rolled", actorId, message: `${actorId} rolled ${dice[0]} + ${dice[1]}`, data: { dice, total, doubled } });

      if (player.isDetained) {
        if (doubled) {
          player.isDetained = false;
          player.detentionAttempts = 0;
          state.canRollAgain = false;
          moveBy(state, actorId, total, events);
          resolveLanding(state, actorId, ctx, events, total);
        } else {
          player.detentionAttempts += 1;
          state.canRollAgain = false;
          if (player.detentionAttempts >= 3) {
            player.isDetained = false;
            player.detentionAttempts = 0;
            charge(state, actorId, 50, null, "Civic Holding release fee", "await_roll", events, true);
          } else {
            state.phase = "await_end_turn";
          }
        }
        return { state, events, memberStatusChanges };
      }

      player.doublesThisTurn = doubled ? player.doublesThisTurn + 1 : 0;
      if (player.doublesThisTurn >= 3) {
        sendToDetention(state, actorId, events, "Three doubles in one turn");
        return { state, events, memberStatusChanges };
      }
      state.canRollAgain = doubled;
      moveBy(state, actorId, total, events);
      resolveLanding(state, actorId, ctx, events, total);
      return { state, events, memberStatusChanges };
    }
    case "buy_asset": {
      assertPhase(state, "await_purchase");
      const purchase = state.pendingPurchase;
      if (!purchase) throw new GameRuleError("NO_PURCHASE", "There is no asset to purchase");
      const tile = assetTile(purchase.tileId);
      if (state.players[actorId].cash < purchase.cost) rule("INSUFFICIENT_CASH", "Not enough cash to purchase this asset");
      state.players[actorId].cash -= purchase.cost;
      state.assets[purchase.tileId].ownerId = actorId;
      state.pendingPurchase = null;
      state.phase = "await_end_turn";
      events.push({ kind: "asset_bought", actorId, message: `${actorId} acquired ${tile.name} for ${money(purchase.cost)}`, data: { tileId: tile.id, amount: purchase.cost } });
      return { state, events, memberStatusChanges };
    }
    case "decline_asset": {
      assertPhase(state, "await_purchase");
      const purchase = state.pendingPurchase;
      if (!purchase) throw new GameRuleError("NO_PURCHASE", "There is no asset to decline");
      startAuction(state, purchase.tileId, ctx, events);
      return { state, events, memberStatusChanges };
    }
    case "end_turn": {
      assertPhase(state, "await_end_turn");
      endTurn(state, ctx, events);
      return { state, events, memberStatusChanges };
    }
    case "pay_detention": {
      assertPhase(state, "await_roll");
      const player = state.players[actorId];
      if (!player.isDetained) rule("NOT_DETAINED", "You are not in Civic Holding");
      if (!charge(state, actorId, 50, null, "Civic Holding release fee", "await_roll", events, true)) return { state, events, memberStatusChanges };
      player.isDetained = false;
      player.detentionAttempts = 0;
      return { state, events, memberStatusChanges };
    }
    case "use_release_permit": {
      assertPhase(state, "await_roll");
      const player = state.players[actorId];
      if (!player.isDetained || !player.hasReleasePermit) rule("NO_RELEASE_PERMIT", "You cannot use a release permit now");
      player.isDetained = false;
      player.detentionAttempts = 0;
      player.hasReleasePermit = false;
      events.push({ kind: "release_permit_used", actorId, message: `${actorId} used a release permit`, data: {} });
      return { state, events, memberStatusChanges };
    }
    case "build": {
      managementPhase();
      buildOn(state, actorId, action.tileId, events);
      return { state, events, memberStatusChanges };
    }
    case "sell_building": {
      managementPhase();
      sellBuilding(state, actorId, action.tileId, events);
      return { state, events, memberStatusChanges };
    }
    case "mortgage": {
      managementPhase();
      mortgage(state, actorId, action.tileId, events);
      return { state, events, memberStatusChanges };
    }
    case "unmortgage": {
      managementPhase();
      unmortgage(state, actorId, action.tileId, events);
      return { state, events, memberStatusChanges };
    }
    case "offer_trade": {
      managementPhase();
      if (action.toUserId === actorId) rule("INVALID_TRADE", "You cannot trade with yourself");
      assertKnownPlayer(state, action.toUserId);
      if (state.trades.length >= 20) rule("TOO_MANY_TRADES", "Resolve an existing trade first");
      if (action.offerCash > state.players[actorId].cash || action.requestCash > state.players[action.toUserId].cash) rule("INSUFFICIENT_CASH", "A proposed cash amount exceeds a player's cash");
      if (action.offerCash + action.requestCash + action.offerTileIds.length + action.requestTileIds.length === 0) rule("EMPTY_TRADE", "A trade must include cash or an asset");
      assertTradableAssets(state, actorId, action.offerTileIds);
      assertTradableAssets(state, action.toUserId, action.requestTileIds);
      const tradeId = ctx.makeId();
      state.trades.push({ ...action, id: tradeId, fromUserId: actorId, expiresAt: isoAfter(ctx.now, 120) });
      events.push({ kind: "trade_offered", actorId, message: `${actorId} offered a trade to ${action.toUserId}`, data: { tradeId, toUserId: action.toUserId } });
      return { state, events, memberStatusChanges };
    }
    case "pay_debt": {
      assertPhase(state, "await_debt");
      const debt = state.pendingDebt;
      if (!debt || debt.playerId !== actorId) throw new GameRuleError("NO_DEBT", "You do not have a payable debt");
      if (!charge(state, actorId, debt.amount, debt.creditorId, debt.reason, debt.afterPhase, events, debt.addToJackpot)) return { state, events, memberStatusChanges };
      state.pendingDebt = null;
      state.phase = debt.afterPhase;
      return { state, events, memberStatusChanges };
    }
    case "declare_bankruptcy": {
      assertPhase(state, "await_debt");
      bankruptPlayer(state, actorId, ctx, events, memberStatusChanges);
      return { state, events, memberStatusChanges };
    }
    default:
      throw new GameRuleError("INVALID_ACTION", "That action is not available in the current game state");
  }
}

function estimateNetWorth(state: PrivateGameState, userId: string): number {
  let total = state.players[userId].cash;
  for (const tile of ASSET_TILES) {
    const asset = state.assets[tile.id];
    if (asset.ownerId !== userId) continue;
    total += asset.mortgaged ? tile.mortgageValue : tile.price;
    if (tile.kind === "district") total += asset.buildings * tile.buildCost;
  }
  return total;
}

/** Removes deck order and hidden deal terms before a state reaches the browser. */
export function toPublicSnapshot(state: PrivateGameState, playerMeta: PlayerMeta[]): PublicGameSnapshot {
  const metas = new Map(playerMeta.map((item) => [item.id, item]));
  return {
    schemaVersion: 1,
    status: state.status,
    phase: state.phase,
    currentPlayerId: state.currentPlayerId,
    turnDeadlineAt: state.turnDeadlineAt,
    round: state.round,
    players: state.turnOrder.map((id) => {
      const player = state.players[id];
      const meta = metas.get(id);
      return {
        id,
        displayName: meta?.displayName ?? "Player",
        avatarColor: meta?.avatarColor ?? "#4f8cff",
        seat: meta?.seat ?? 0,
        memberStatus: player.bankrupt ? "eliminated" : meta?.memberStatus ?? "joined",
        cash: player.cash,
        netWorth: estimateNetWorth(state, id),
        position: player.position,
        isDetained: player.isDetained,
        bankrupt: player.bankrupt,
        assetCount: ownedAssets(state, id).length,
      };
    }),
    assets: ASSET_TILES.map((tile) => ({
      tileId: tile.id,
      kind: tile.kind,
      ownerId: state.assets[tile.id].ownerId,
      buildings: state.assets[tile.id].buildings,
      mortgaged: state.assets[tile.id].mortgaged,
    })),
    pendingPurchase: state.pendingPurchase ? { ...state.pendingPurchase } : null,
    auction: state.auction ? { ...state.auction, passedPlayerIds: [...state.auction.passedPlayerIds] } : null,
    trades: state.trades.map(({ id, fromUserId, toUserId, expiresAt }) => ({ id, fromUserId, toUserId, expiresAt })),
    jackpot: state.jackpot,
    lastRoll: state.lastRoll ? { playerId: state.lastRoll.playerId, dice: [...state.lastRoll.dice] as [number, number] } : null,
  };
}

export function gamePatch(state: PrivateGameState): { status: GameStatus; currentPlayerId: string | null; turnDeadlineAt: string | null } {
  return { status: state.status, currentPlayerId: state.currentPlayerId, turnDeadlineAt: state.turnDeadlineAt };
}

/** Cryptographically unpredictable server-side Fisher–Yates shuffle. */
export function secureShuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const random = new Uint32Array(1);
    crypto.getRandomValues(random);
    const swap = random[0] % (index + 1);
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

export function secureDice(): [number, number] {
  const random = new Uint32Array(2);
  crypto.getRandomValues(random);
  return [(random[0] % 6) + 1, (random[1] % 6) + 1];
}
