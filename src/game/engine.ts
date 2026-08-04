import {
  BOARD,
  BOARD_SIZE,
  getGroupTiles,
  getOwnableTiles,
  getTileAt,
  getTileById,
  isDistrictTile,
  isOwnableTile,
} from "./board";
import { createDecks } from "./cards";
import type {
  AuctionState,
  BuildingCount,
  Card,
  CardDeck,
  CardDeckState,
  DebtState,
  EngineContext,
  GameAction,
  GameEvent,
  GameEventType,
  GamePhase,
  GameRules,
  GameState,
  Player,
  PlayerId,
  PlayerInput,
  PropertyState,
  PublicGameState,
  Tile,
  TileId,
  TradeOffer,
} from "./types";
import { GameRuleError } from "./types";

export const DEFAULT_RULES: Readonly<GameRules> = Object.freeze({
  maxPlayers: 20,
  startingCash: 1_500,
  startBonus: 200,
  turnTimerSeconds: 30,
  auctionSeconds: 30,
  detentionFee: 50,
  jackpotEnabled: false,
  fastAnimations: false,
});

const PLAYER_COLORS = [
  "#38bdf8",
  "#f43f5e",
  "#facc15",
  "#34d399",
  "#a78bfa",
  "#fb923c",
  "#22d3ee",
  "#f472b6",
  "#84cc16",
  "#e879f9",
  "#60a5fa",
  "#f97316",
  "#2dd4bf",
  "#c084fc",
  "#fda4af",
  "#bef264",
  "#67e8f9",
  "#fbbf24",
  "#818cf8",
  "#4ade80",
];

export interface CreateGameStateOptions {
  id?: string;
  hostId?: PlayerId;
  players: PlayerInput[];
  rules?: Partial<GameRules>;
  now?: number;
  /** Useful for deterministic tests; production games use the original decks. */
  decks?: Partial<CardDeckState>;
}

function rule(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) {
    throw new GameRuleError(code, message);
  }
}

const nowFrom = (action: { now?: number }, context: EngineContext): number => action.now ?? context.now?.() ?? Date.now();

const cloneDeck = (deck: Card[]): Card[] => deck.map((card) => ({ ...card, effect: { ...card.effect } } as Card));

const cloneState = (state: GameState): GameState => ({
  ...state,
  players: state.players.map((player) => ({ ...player, propertyIds: [...player.propertyIds] })),
  rules: { ...state.rules },
  properties: Object.fromEntries(
    Object.entries(state.properties).map(([tileId, property]) => [tileId, { ...property }]),
  ) as Record<TileId, PropertyState>,
  pendingPurchase: state.pendingPurchase ? { ...state.pendingPurchase } : null,
  auction: state.auction
    ? {
        ...state.auction,
        eligiblePlayerIds: [...state.auction.eligiblePlayerIds],
        passedPlayerIds: [...state.auction.passedPlayerIds],
      }
    : null,
  debt: state.debt ? { ...state.debt } : null,
  trades: state.trades.map((trade) => ({
    ...trade,
    offeredPropertyIds: [...trade.offeredPropertyIds],
    requestedPropertyIds: [...trade.requestedPropertyIds],
  })),
  lastRoll: state.lastRoll ? [...state.lastRoll] as [number, number] : null,
  decks: { event: cloneDeck(state.decks.event), civic: cloneDeck(state.decks.civic) },
  events: state.events.map((event) => ({ ...event, data: event.data ? { ...event.data } : undefined })),
});

const createInitialProperties = (): Record<TileId, PropertyState> =>
  getOwnableTiles().reduce<Record<TileId, PropertyState>>((properties, tile) => {
    properties[tile.id] = { tileId: tile.id, ownerId: null, buildings: 0, mortgaged: false };
    return properties;
  }, {});

/** Creates a waiting room; only START_GAME begins the first timed turn. */
export const createGameState = (options: CreateGameStateOptions): GameState => {
  const rules: GameRules = { ...DEFAULT_RULES, ...options.rules };
  rule(options.players.length >= 1, "NO_PLAYERS", "At least one player is required to create a game.");
  rule(options.players.length <= rules.maxPlayers, "ROOM_FULL", `A game may have at most ${rules.maxPlayers} players.`);

  const ids = new Set(options.players.map((player) => player.id));
  rule(ids.size === options.players.length, "DUPLICATE_PLAYER", "Every player needs a unique id.");

  const joinedAt = options.now ?? Date.now();
  const hostId = options.hostId ?? options.players[0].id;
  rule(ids.has(hostId), "UNKNOWN_HOST", "The host must be one of the room's players.");
  const defaults = createDecks();
  const decks: CardDeckState = {
    event: options.decks?.event ? cloneDeck(options.decks.event) : defaults.event,
    civic: options.decks?.civic ? cloneDeck(options.decks.civic) : defaults.civic,
  };

  return {
    id: options.id ?? "local-game",
    version: 0,
    status: "waiting",
    phase: "lobby",
    hostId,
    players: options.players.map((player, index) => ({
      id: player.id,
      name: player.name.trim() || `Player ${index + 1}`,
      color: player.color || PLAYER_COLORS[index % PLAYER_COLORS.length],
      cash: rules.startingCash,
      position: 0,
      status: "active",
      detentionTurns: 0,
      detentionPasses: 0,
      doublesRolled: 0,
      propertyIds: [],
      joinedAt,
    })),
    currentPlayerId: null,
    currentTurn: 0,
    turnEndsAt: null,
    rules,
    properties: createInitialProperties(),
    pendingPurchase: null,
    auction: null,
    debt: null,
    trades: [],
    lastRoll: null,
    jackpot: 0,
    decks,
    events: [],
    winnerId: null,
    phaseBeforePause: null,
  };
};

export const toPublicGameState = (state: GameState): PublicGameState => {
  const { decks, ...publicState } = state;
  return {
    ...publicState,
    deckCounts: { event: decks.event.length, civic: decks.civic.length },
  };
};

export const getPlayer = (state: GameState, playerId: PlayerId): Player | undefined =>
  state.players.find((player) => player.id === playerId);

export const getProperty = (state: GameState, tileId: TileId): PropertyState | undefined => state.properties[tileId];

export const getNetWorth = (state: GameState, playerId: PlayerId): number => {
  const player = getPlayer(state, playerId);
  if (!player) return 0;
  return player.cash + player.propertyIds.reduce((total, tileId) => {
    const tile = getTileById(tileId);
    const property = state.properties[tileId];
    if (!tile || !property || !isOwnableTile(tile)) return total;
    const propertyValue = property.mortgaged ? Math.floor(tile.price / 2) : tile.price;
    const buildingValue = isDistrictTile(tile) ? property.buildings * (tile.buildCost / 2) : 0;
    return total + propertyValue + buildingValue;
  }, 0);
};

export const getSortedPlayersByNetWorth = (state: GameState): Player[] =>
  [...state.players].sort((left, right) => getNetWorth(state, right.id) - getNetWorth(state, left.id));

const getRequiredPlayer = (state: GameState, playerId: PlayerId): Player => {
  const player = getPlayer(state, playerId);
  rule(player, "UNKNOWN_PLAYER", "This player is not seated in the game.");
  return player;
};

const getRequiredProperty = (state: GameState, tileId: TileId): PropertyState => {
  const property = state.properties[tileId];
  rule(property, "NOT_OWNABLE", "This board space cannot be owned.");
  return property;
};

const getActivePlayers = (state: GameState): Player[] => state.players.filter((player) => player.status === "active" || player.status === "detained");

const requireActiveGame = (state: GameState): void => {
  rule(state.status === "active", "GAME_NOT_ACTIVE", "The game is not currently active.");
  rule(state.phase !== "paused", "GAME_PAUSED", "The game is currently paused.");
  rule(state.phase !== "complete", "GAME_COMPLETE", "The game has already finished.");
};

const requireCurrentPlayer = (state: GameState, playerId: PlayerId): Player => {
  requireActiveGame(state);
  rule(state.currentPlayerId === playerId, "NOT_YOUR_TURN", "It is not this player's turn.");
  const player = getRequiredPlayer(state, playerId);
  rule(player.status === "active" || player.status === "detained", "PLAYER_INACTIVE", "This player is not active.");
  return player;
};

const addEvent = (
  state: GameState,
  type: GameEventType,
  actorId: PlayerId | null,
  message: string,
  now: number,
  context: EngineContext,
  data?: GameEvent["data"],
): void => {
  const sequence = state.events.length === 0 ? 1 : state.events[state.events.length - 1].sequence + 1;
  const id = context.createId?.("event") ?? `${state.id}:event:${sequence}`;
  state.events.push({ id, sequence, type, actorId, message, createdAt: now, ...(data ? { data } : {}) });
};

const setTurnDeadline = (state: GameState, now: number): void => {
  state.turnEndsAt = now + state.rules.turnTimerSeconds * 1_000;
};

const clearTransientTurnState = (state: GameState): void => {
  state.pendingPurchase = null;
  state.auction = null;
  state.debt = null;
  state.lastRoll = null;
};

const propertyIdsFor = (state: GameState, playerId: PlayerId): TileId[] =>
  Object.values(state.properties)
    .filter((property) => property.ownerId === playerId)
    .map((property) => property.tileId)
    .sort((left, right) => (getTileById(left)?.index ?? 0) - (getTileById(right)?.index ?? 0));

const synchronizePropertyIds = (state: GameState): void => {
  state.players.forEach((player) => {
    player.propertyIds = propertyIdsFor(state, player.id);
  });
};

const assignProperty = (state: GameState, tileId: TileId, ownerId: PlayerId | null): void => {
  const property = getRequiredProperty(state, tileId);
  property.ownerId = ownerId;
  if (!ownerId) {
    property.buildings = 0;
    property.mortgaged = false;
  }
  synchronizePropertyIds(state);
};

const isDouble = (roll: [number, number] | null): boolean => Boolean(roll && roll[0] === roll[1]);

const assertDice = (dice: [number, number]): void => {
  rule(
    Number.isInteger(dice[0]) && Number.isInteger(dice[1]) && dice[0] >= 1 && dice[0] <= 6 && dice[1] >= 1 && dice[1] <= 6,
    "INVALID_DICE",
    "Dice must each be whole numbers from 1 through 6.",
  );
};

const resolveDice = (action: Extract<GameAction, { type: "ROLL" }>, context: EngineContext): [number, number] => {
  const dice = action.dice ?? context.rollDice?.();
  rule(dice, "DICE_SOURCE_REQUIRED", "An authoritative dice source is required for a roll.");
  assertDice(dice);
  return dice;
};

const chargePlayer = (
  state: GameState,
  playerId: PlayerId,
  amount: number,
  creditorPlayerId: PlayerId | null,
  reason: string,
  now: number,
  context: EngineContext,
  addToJackpot = false,
): boolean => {
  rule(amount >= 0, "INVALID_AMOUNT", "A charge cannot be negative.");
  const player = getRequiredPlayer(state, playerId);
  const paid = Math.min(player.cash, amount);
  player.cash -= paid;
  if (creditorPlayerId) getRequiredPlayer(state, creditorPlayerId).cash += paid;
  if (addToJackpot && state.rules.jackpotEnabled) state.jackpot += paid;

  const remaining = amount - paid;
  if (remaining > 0) {
    state.debt = { playerId, amount: remaining, creditorPlayerId, reason };
    state.phase = "awaitingDebt";
    addEvent(state, "debt", playerId, `${player.name} owes ${remaining} credits for ${reason}.`, now, context, { amount: remaining });
    return false;
  }
  return true;
};

const endLanding = (state: GameState): void => {
  if (!state.debt) state.phase = "awaitingEndTurn";
};

const sendToDetention = (state: GameState, player: Player, now: number, context: EngineContext, reason: string): void => {
  const detention = BOARD.find((tile) => tile.kind === "detention");
  rule(detention, "BOARD_INVALID", "The board is missing Civic Hold.");
  player.position = detention.index;
  player.status = "detained";
  player.detentionTurns = 0;
  player.doublesRolled = 0;
  state.pendingPurchase = null;
  addEvent(state, "detained", player.id, `${player.name} is sent to Civic Hold (${reason}).`, now, context);
  endLanding(state);
};

const calculateRent = (state: GameState, tile: Tile, property: PropertyState): number => {
  if (!property.ownerId || property.mortgaged || !isOwnableTile(tile)) return 0;
  if (tile.kind === "district" && isDistrictTile(tile)) {
    const listedRent = tile.rent?.[property.buildings] ?? 0;
    if (property.buildings > 0) return listedRent;
    const group = getGroupTiles(tile.group);
    const ownsFullGroup = group.every((groupTile) => state.properties[groupTile.id]?.ownerId === property.ownerId && !state.properties[groupTile.id]?.mortgaged);
    return ownsFullGroup ? listedRent * 2 : listedRent;
  }
  if (tile.kind === "transit") {
    const count = getOwnableTiles().filter((candidate) => candidate.kind === "transit" && state.properties[candidate.id]?.ownerId === property.ownerId && !state.properties[candidate.id]?.mortgaged).length;
    return tile.rent?.[Math.max(0, count - 1)] ?? 0;
  }
  if (tile.kind === "utility") {
    const count = getOwnableTiles().filter((candidate) => candidate.kind === "utility" && state.properties[candidate.id]?.ownerId === property.ownerId && !state.properties[candidate.id]?.mortgaged).length;
    const multiplier = tile.rent?.[Math.max(0, count - 1)] ?? 4;
    return ((state.lastRoll?.[0] ?? 0) + (state.lastRoll?.[1] ?? 0)) * multiplier;
  }
  return 0;
};

const movePlayerBy = (state: GameState, player: Player, spaces: number, now: number, context: EngineContext): void => {
  const startPosition = player.position;
  const rawDestination = startPosition + spaces;
  // Passing or arriving at Founders' Plaza pays here. The landing resolver
  // deliberately has no second Start payment.
  const passedStart = spaces > 0 ? Math.floor(rawDestination / BOARD_SIZE) : 0;
  player.position = ((rawDestination % BOARD_SIZE) + BOARD_SIZE) % BOARD_SIZE;
  if (passedStart > 0) {
    const bonus = state.rules.startBonus * passedStart;
    player.cash += bonus;
    addEvent(state, "message", player.id, `${player.name} passes Founders' Plaza and collects ${bonus} credits.`, now, context, { amount: bonus });
  }
  addEvent(state, "moved", player.id, `${player.name} moves to ${getTileAt(player.position).name}.`, now, context, { from: startPosition, to: player.position });
  resolveLanding(state, player, now, context);
};

const movePlayerTo = (state: GameState, player: Player, destination: number, now: number, context: EngineContext): void => {
  const normalized = ((destination % BOARD_SIZE) + BOARD_SIZE) % BOARD_SIZE;
  const startPosition = player.position;
  const passesStart = normalized < startPosition ? 1 : 0;
  player.position = normalized;
  if (passesStart) {
    player.cash += state.rules.startBonus;
    addEvent(state, "message", player.id, `${player.name} passes Founders' Plaza and collects ${state.rules.startBonus} credits.`, now, context, { amount: state.rules.startBonus });
  }
  addEvent(state, "moved", player.id, `${player.name} moves to ${getTileAt(normalized).name}.`, now, context, { from: startPosition, to: normalized });
  resolveLanding(state, player, now, context);
};

const drawCard = (state: GameState, deckName: CardDeck): Card => {
  const deck = state.decks[deckName];
  rule(deck.length > 0, "EMPTY_DECK", `The ${deckName} deck is empty.`);
  const card = deck.shift();
  rule(card, "EMPTY_DECK", `The ${deckName} deck is empty.`);
  deck.push(card);
  return card;
};

const applyCard = (state: GameState, player: Player, card: Card, now: number, context: EngineContext): void => {
  addEvent(state, "card", player.id, `${player.name} draws ${card.title}: ${card.text}`, now, context, { cardId: card.id });
  const { effect } = card;
  switch (effect.type) {
    case "cash": {
      if (effect.amount >= 0) {
        player.cash += effect.amount;
        endLanding(state);
      } else {
        const paid = chargePlayer(state, player.id, -effect.amount, null, card.title, now, context);
        if (paid) endLanding(state);
      }
      return;
    }
    case "moveTo":
      movePlayerTo(state, player, effect.tileIndex, now, context);
      return;
    case "moveRelative":
      movePlayerBy(state, player, effect.spaces, now, context);
      return;
    case "detention":
      sendToDetention(state, player, now, context, card.title);
      return;
    case "detentionPass":
      player.detentionPasses += 1;
      endLanding(state);
      return;
    case "repair": {
      let houseCount = 0;
      let towerCount = 0;
      player.propertyIds.forEach((tileId) => {
        const buildings = state.properties[tileId]?.buildings ?? 0;
        if (buildings === 5) towerCount += 1;
        else houseCount += buildings;
      });
      const cost = houseCount * effect.perHouse + towerCount * effect.perTower;
      const paid = chargePlayer(state, player.id, cost, null, card.title, now, context);
      if (paid) endLanding(state);
      return;
    }
    case "collectFromEach": {
      getActivePlayers(state).filter((other) => other.id !== player.id).forEach((other) => {
        const paid = Math.min(other.cash, effect.amount);
        other.cash -= paid;
        player.cash += paid;
      });
      endLanding(state);
      return;
    }
    case "payEach": {
      const recipients = getActivePlayers(state).filter((other) => other.id !== player.id);
      recipients.forEach((recipient) => {
        const paid = Math.min(player.cash, effect.amount);
        player.cash -= paid;
        recipient.cash += paid;
      });
      endLanding(state);
      return;
    }
  }
};

const resolveLanding = (state: GameState, player: Player, now: number, context: EngineContext): void => {
  const tile = getTileAt(player.position);
  if (isOwnableTile(tile)) {
    const property = getRequiredProperty(state, tile.id);
    if (!property.ownerId) {
      state.pendingPurchase = { playerId: player.id, tileId: tile.id, price: tile.price };
      state.phase = "awaitingPurchase";
      addEvent(state, "message", player.id, `${tile.name} is available for ${tile.price} credits.`, now, context, { tileId: tile.id, amount: tile.price });
      return;
    }
    if (property.ownerId !== player.id && !property.mortgaged) {
      const rent = calculateRent(state, tile, property);
      const owner = getRequiredPlayer(state, property.ownerId);
      addEvent(state, "rent", player.id, `${player.name} owes ${rent} credits to ${owner.name} for ${tile.name}.`, now, context, { tileId: tile.id, amount: rent });
      const paid = chargePlayer(state, player.id, rent, owner.id, `${tile.name} rent`, now, context);
      if (paid) endLanding(state);
      return;
    }
    endLanding(state);
    return;
  }

  switch (tile.kind) {
    case "levy": {
      const levy = tile.levy ?? 0;
      addEvent(state, "levy", player.id, `${player.name} owes a ${levy} credit levy.`, now, context, { amount: levy });
      const paid = chargePlayer(state, player.id, levy, null, tile.name, now, context, true);
      if (paid) endLanding(state);
      return;
    }
    case "event":
    case "civic":
      applyCard(state, player, drawCard(state, tile.kind), now, context);
      return;
    case "goToDetention":
      sendToDetention(state, player, now, context, tile.name);
      return;
    case "festival":
      if (state.rules.jackpotEnabled && state.jackpot > 0) {
        const prize = state.jackpot;
        state.jackpot = 0;
        player.cash += prize;
        addEvent(state, "message", player.id, `${player.name} receives the ${prize} credit festival jackpot.`, now, context, { amount: prize });
      }
      endLanding(state);
      return;
    default:
      endLanding(state);
  }
};

const advanceTurn = (state: GameState, now: number, context: EngineContext): void => {
  const active = getActivePlayers(state);
  if (active.length <= 1) {
    state.status = "complete";
    state.phase = "complete";
    state.winnerId = active[0]?.id ?? null;
    state.currentPlayerId = null;
    state.turnEndsAt = null;
    if (active[0]) addEvent(state, "message", active[0].id, `${active[0].name} wins Civic Fortune.`, now, context);
    return;
  }

  const oldPlayer = state.currentPlayerId ? getPlayer(state, state.currentPlayerId) : undefined;
  if (oldPlayer) oldPlayer.doublesRolled = 0;
  const startIndex = state.currentPlayerId ? state.players.findIndex((player) => player.id === state.currentPlayerId) : -1;
  let next: Player | undefined;
  for (let offset = 1; offset <= state.players.length; offset += 1) {
    const candidate = state.players[(Math.max(startIndex, 0) + offset) % state.players.length];
    if (candidate.status === "active" || candidate.status === "detained") {
      next = candidate;
      break;
    }
  }
  rule(next, "NO_NEXT_PLAYER", "No active player is available for the next turn.");
  clearTransientTurnState(state);
  state.currentPlayerId = next.id;
  state.currentTurn += 1;
  state.phase = "awaitingRoll";
  setTurnDeadline(state, now);
};

const startAuction = (state: GameState, tileId: TileId, playerId: PlayerId, now: number, context: EngineContext): void => {
  const eligiblePlayerIds = getActivePlayers(state).map((player) => player.id);
  const auction: AuctionState = {
    tileId,
    startedByPlayerId: playerId,
    highestBid: 0,
    highestBidderId: null,
    eligiblePlayerIds,
    passedPlayerIds: [],
    endsAt: now + state.rules.auctionSeconds * 1_000,
  };
  state.pendingPurchase = null;
  state.auction = auction;
  state.phase = "auction";
  addEvent(state, "auctionStarted", playerId, `${getTileById(tileId)?.name ?? "This parcel"} enters an open auction.`, now, context, { tileId });
};

const finishAuction = (state: GameState, now: number, context: EngineContext, expired = false): void => {
  const auction = state.auction;
  rule(auction, "NO_AUCTION", "There is no active auction.");
  const tile = getTileById(auction.tileId);
  rule(tile && isOwnableTile(tile), "BOARD_INVALID", "Auctioned space must be ownable.");
  if (auction.highestBidderId) {
    const winner = getRequiredPlayer(state, auction.highestBidderId);
    rule(winner.cash >= auction.highestBid, "INSUFFICIENT_CASH", "The winning bidder no longer has sufficient cash.");
    winner.cash -= auction.highestBid;
    assignProperty(state, tile.id, winner.id);
    addEvent(state, "auctionWon", winner.id, `${winner.name} wins ${tile.name} for ${auction.highestBid} credits.`, now, context, { tileId: tile.id, amount: auction.highestBid });
  } else {
    addEvent(state, expired ? "auctionExpired" : "message", null, `${tile.name} receives no bids and remains unowned.`, now, context, { tileId: tile.id });
  }
  state.auction = null;
  state.phase = "awaitingEndTurn";
};

const assertManageablePhase = (state: GameState): void => {
  rule(state.phase === "awaitingRoll" || state.phase === "awaitingEndTurn", "ACTION_NOT_AVAILABLE", "This action is not available during the current turn phase.");
  rule(!state.debt, "OUTSTANDING_DEBT", "Resolve outstanding debt first.");
};

const assertLiquidationPhase = (state: GameState, playerId: PlayerId): void => {
  const normalTurn = state.phase === "awaitingRoll" || state.phase === "awaitingEndTurn";
  const resolvingOwnDebt = state.phase === "awaitingDebt" && state.debt?.playerId === playerId;
  rule(normalTurn || resolvingOwnDebt, "ACTION_NOT_AVAILABLE", "Only the active player may liquidate assets during their turn or debt resolution.");
};

const assertOwner = (state: GameState, playerId: PlayerId, tileId: TileId): { player: Player; tile: Tile; property: PropertyState } => {
  const player = requireCurrentPlayer(state, playerId);
  const tile = getTileById(tileId);
  rule(tile && isOwnableTile(tile), "NOT_OWNABLE", "Only ownable spaces may be managed.");
  const property = getRequiredProperty(state, tileId);
  rule(property.ownerId === player.id, "NOT_OWNER", "Only the owner may manage this property.");
  return { player, tile, property };
};

const hasCompleteGroup = (state: GameState, playerId: PlayerId, tile: Tile): boolean => {
  if (!isDistrictTile(tile)) return false;
  return getGroupTiles(tile.group).every((candidate) => {
    const property = state.properties[candidate.id];
    return property?.ownerId === playerId && !property.mortgaged;
  });
};

const groupHasBuildings = (state: GameState, tile: Tile): boolean =>
  isDistrictTile(tile) && getGroupTiles(tile.group).some((candidate) => (state.properties[candidate.id]?.buildings ?? 0) > 0);

const calculateBuildingLevel = (value: number): BuildingCount => {
  rule(value >= 0 && value <= 5 && Number.isInteger(value), "INVALID_BUILDING_LEVEL", "Buildings must be between 0 and 5.");
  return value as BuildingCount;
};

const validateTradeAssets = (state: GameState, ownerId: PlayerId, tileIds: TileId[]): void => {
  rule(new Set(tileIds).size === tileIds.length, "DUPLICATE_PROPERTY", "A property can only appear once in a trade.");
  tileIds.forEach((tileId) => {
    const property = getRequiredProperty(state, tileId);
    rule(property.ownerId === ownerId, "NOT_OWNER", "A player can only trade their own properties.");
    rule(property.buildings === 0, "BUILDINGS_PRESENT", "Sell buildings before trading a district.");
  });
};

const finaliseTrade = (state: GameState, trade: TradeOffer, now: number, context: EngineContext): void => {
  const from = getRequiredPlayer(state, trade.fromPlayerId);
  const to = getRequiredPlayer(state, trade.toPlayerId);
  validateTradeAssets(state, from.id, trade.offeredPropertyIds);
  validateTradeAssets(state, to.id, trade.requestedPropertyIds);
  rule(from.cash >= trade.offeredCash, "INSUFFICIENT_CASH", "The offering player no longer has enough cash.");
  rule(to.cash >= trade.requestedCash, "INSUFFICIENT_CASH", "The receiving player no longer has enough cash.");

  from.cash = from.cash - trade.offeredCash + trade.requestedCash;
  to.cash = to.cash - trade.requestedCash + trade.offeredCash;
  trade.offeredPropertyIds.forEach((tileId) => assignProperty(state, tileId, to.id));
  trade.requestedPropertyIds.forEach((tileId) => assignProperty(state, tileId, from.id));
  trade.status = "accepted";
  addEvent(state, "tradeAccepted", to.id, `${to.name} accepts ${from.name}'s trade offer.`, now, context, { tradeId: trade.id });
};

const executeStartGame = (state: GameState, action: Extract<GameAction, { type: "START_GAME" }>, now: number, context: EngineContext): void => {
  rule(state.status === "waiting" && state.phase === "lobby", "GAME_ALREADY_STARTED", "The game has already started.");
  rule(state.hostId === action.playerId, "HOST_ONLY", "Only the host may start the game.");
  rule(getActivePlayers(state).length >= 2, "NEED_MORE_PLAYERS", "At least two players are required to start.");
  state.status = "active";
  state.phase = "awaitingRoll";
  state.currentPlayerId = getActivePlayers(state)[0].id;
  state.currentTurn = 1;
  setTurnDeadline(state, now);
  addEvent(state, "gameStarted", action.playerId, "The Civic Fortune game begins.", now, context);
};

const executeRoll = (state: GameState, action: Extract<GameAction, { type: "ROLL" }>, now: number, context: EngineContext): void => {
  const player = requireCurrentPlayer(state, action.playerId);
  rule(state.phase === "awaitingRoll", "ROLL_NOT_AVAILABLE", "Roll the dice only at the start of your turn.");
  const dice = resolveDice(action, context);
  state.lastRoll = dice;
  const total = dice[0] + dice[1];
  addEvent(state, "roll", player.id, `${player.name} rolls ${dice[0]} + ${dice[1]} = ${total}.`, now, context, { dieOne: dice[0], dieTwo: dice[1], total });

  if (player.status === "detained") {
    if (dice[0] === dice[1]) {
      player.status = "active";
      player.detentionTurns = 0;
      player.doublesRolled = 0;
      addEvent(state, "released", player.id, `${player.name} rolls doubles and leaves Civic Hold.`, now, context);
      movePlayerBy(state, player, total, now, context);
      return;
    }
    player.detentionTurns += 1;
    if (player.detentionTurns < 3) {
      state.phase = "awaitingEndTurn";
      addEvent(state, "message", player.id, `${player.name} remains in Civic Hold.`, now, context);
      return;
    }
    const paid = chargePlayer(state, player.id, state.rules.detentionFee, null, "Civic Hold release", now, context);
    if (!paid) return;
    player.status = "active";
    player.detentionTurns = 0;
    player.doublesRolled = 0;
    addEvent(state, "released", player.id, `${player.name} pays the Civic Hold fee and leaves.`, now, context);
    movePlayerBy(state, player, total, now, context);
    return;
  }

  if (dice[0] === dice[1]) {
    player.doublesRolled += 1;
    if (player.doublesRolled >= 3) {
      sendToDetention(state, player, now, context, "three consecutive doubles");
      return;
    }
  } else {
    player.doublesRolled = 0;
  }
  movePlayerBy(state, player, total, now, context);
};

const executeBuy = (state: GameState, action: Extract<GameAction, { type: "BUY_PROPERTY" }>, now: number, context: EngineContext): void => {
  const player = requireCurrentPlayer(state, action.playerId);
  rule(state.phase === "awaitingPurchase" && state.pendingPurchase, "PURCHASE_NOT_AVAILABLE", "There is no property awaiting a purchase decision.");
  rule(state.pendingPurchase.playerId === player.id, "NOT_PURCHASER", "Only the landing player may buy this property.");
  const tile = getTileById(state.pendingPurchase.tileId);
  rule(tile && isOwnableTile(tile), "BOARD_INVALID", "The pending property is invalid.");
  const property = getRequiredProperty(state, tile.id);
  rule(!property.ownerId, "ALREADY_OWNED", "This property is already owned.");
  rule(player.cash >= tile.price, "INSUFFICIENT_CASH", "You do not have enough cash to buy this property.");
  player.cash -= tile.price;
  assignProperty(state, tile.id, player.id);
  state.pendingPurchase = null;
  state.phase = "awaitingEndTurn";
  addEvent(state, "bought", player.id, `${player.name} buys ${tile.name} for ${tile.price} credits.`, now, context, { tileId: tile.id, amount: tile.price });
};

const executeDecline = (state: GameState, action: Extract<GameAction, { type: "DECLINE_PROPERTY" }>, now: number, context: EngineContext): void => {
  const player = requireCurrentPlayer(state, action.playerId);
  rule(state.phase === "awaitingPurchase" && state.pendingPurchase, "PURCHASE_NOT_AVAILABLE", "There is no property awaiting a purchase decision.");
  rule(state.pendingPurchase.playerId === player.id, "NOT_PURCHASER", "Only the landing player may decline this property.");
  const tileId = state.pendingPurchase.tileId;
  addEvent(state, "declined", player.id, `${player.name} declines ${getTileById(tileId)?.name ?? "the property"}.`, now, context, { tileId });
  startAuction(state, tileId, player.id, now, context);
};

const executeBid = (state: GameState, action: Extract<GameAction, { type: "PLACE_BID" }>, now: number, context: EngineContext): void => {
  requireActiveGame(state);
  rule(state.phase === "auction" && state.auction, "NO_AUCTION", "There is no active auction.");
  const player = getRequiredPlayer(state, action.playerId);
  rule(player.status === "active" || player.status === "detained", "PLAYER_INACTIVE", "Only active players may bid.");
  const auction = state.auction;
  rule(auction.eligiblePlayerIds.includes(player.id), "NOT_ELIGIBLE", "This player is not eligible to bid.");
  rule(!auction.passedPlayerIds.includes(player.id), "BIDDER_PASSED", "A passed bidder cannot re-enter an auction.");
  rule(Number.isInteger(action.amount) && action.amount > auction.highestBid, "BID_TOO_LOW", "A bid must exceed the current highest bid.");
  rule(player.cash >= action.amount, "INSUFFICIENT_CASH", "A bid cannot exceed available cash.");
  auction.highestBid = action.amount;
  auction.highestBidderId = player.id;
  addEvent(state, "bid", player.id, `${player.name} bids ${action.amount} credits for ${getTileById(auction.tileId)?.name ?? "the parcel"}.`, now, context, { tileId: auction.tileId, amount: action.amount });
};

const executePassBid = (state: GameState, action: Extract<GameAction, { type: "PASS_BID" }>, now: number, context: EngineContext): void => {
  requireActiveGame(state);
  rule(state.phase === "auction" && state.auction, "NO_AUCTION", "There is no active auction.");
  const auction = state.auction;
  const player = getRequiredPlayer(state, action.playerId);
  rule(auction.eligiblePlayerIds.includes(player.id), "NOT_ELIGIBLE", "This player is not eligible to bid.");
  rule(!auction.passedPlayerIds.includes(player.id), "ALREADY_PASSED", "This player has already passed.");
  rule(auction.highestBidderId !== player.id, "HIGH_BIDDER_CANNOT_PASS", "The current high bidder must be outbid or wait for the auction to close.");
  auction.passedPlayerIds.push(player.id);
  addEvent(state, "message", player.id, `${player.name} passes on ${getTileById(auction.tileId)?.name ?? "the parcel"}.`, now, context, { tileId: auction.tileId });
  const stillBidding = auction.eligiblePlayerIds.filter((id) => !auction.passedPlayerIds.includes(id));
  if (stillBidding.length <= 1) finishAuction(state, now, context);
};

const executeExpireAuction = (state: GameState, action: Extract<GameAction, { type: "EXPIRE_AUCTION" }>, now: number, context: EngineContext): void => {
  requireActiveGame(state);
  rule(state.phase === "auction" && state.auction, "NO_AUCTION", "There is no active auction.");
  rule(state.auction.endsAt === null || now >= state.auction.endsAt, "AUCTION_NOT_EXPIRED", "The auction has not expired yet.");
  finishAuction(state, now, context, true);
};

const executeEndTurn = (state: GameState, action: Extract<GameAction, { type: "END_TURN" }>, now: number, context: EngineContext): void => {
  const player = requireCurrentPlayer(state, action.playerId);
  rule(state.phase === "awaitingEndTurn", "END_TURN_NOT_AVAILABLE", "Finish the current board action before ending the turn.");
  addEvent(state, "turnEnded", player.id, `${player.name} ends their turn.`, now, context);
  if (isDouble(state.lastRoll) && player.status === "active" && player.doublesRolled > 0) {
    state.phase = "awaitingRoll";
    setTurnDeadline(state, now);
    addEvent(state, "message", player.id, `${player.name} rolled doubles and takes another turn.`, now, context);
    return;
  }
  advanceTurn(state, now, context);
};

const executeBuild = (state: GameState, action: Extract<GameAction, { type: "BUILD" }>, now: number, context: EngineContext): void => {
  assertManageablePhase(state);
  const { player, tile, property } = assertOwner(state, action.playerId, action.tileId);
  rule(isDistrictTile(tile), "NOT_BUILDABLE", "Only district parcels can receive buildings.");
  rule(hasCompleteGroup(state, player.id, tile), "INCOMPLETE_GROUP", "You must own the entire unmortgaged district group before building.");
  rule(property.buildings < 5, "MAX_BUILDINGS", "This district already has a tower.");
  const groupProperties = getGroupTiles(tile.group).map((candidate) => getRequiredProperty(state, candidate.id));
  const minimum = Math.min(...groupProperties.map((groupProperty) => groupProperty.buildings));
  rule(property.buildings === minimum, "UNEQUAL_BUILDING", "Build evenly across all districts in the group.");
  rule(player.cash >= tile.buildCost, "INSUFFICIENT_CASH", "You do not have enough cash to build here.");
  player.cash -= tile.buildCost;
  property.buildings = calculateBuildingLevel(property.buildings + 1);
  addEvent(state, "built", player.id, `${player.name} builds on ${tile.name}.`, now, context, { tileId: tile.id, buildings: property.buildings });
};

const executeSellBuilding = (state: GameState, action: Extract<GameAction, { type: "SELL_BUILDING" }>, now: number, context: EngineContext): void => {
  assertLiquidationPhase(state, action.playerId);
  const { player, tile, property } = assertOwner(state, action.playerId, action.tileId);
  rule(isDistrictTile(tile), "NOT_BUILDABLE", "Only district buildings can be sold.");
  rule(property.buildings > 0, "NO_BUILDINGS", "There are no buildings to sell here.");
  const groupProperties = getGroupTiles(tile.group).map((candidate) => getRequiredProperty(state, candidate.id));
  const maximum = Math.max(...groupProperties.map((groupProperty) => groupProperty.buildings));
  rule(property.buildings === maximum, "UNEQUAL_SELL", "Sell evenly across all districts in the group.");
  property.buildings = calculateBuildingLevel(property.buildings - 1);
  const proceeds = Math.floor(tile.buildCost / 2);
  player.cash += proceeds;
  addEvent(state, "soldBuilding", player.id, `${player.name} sells a building on ${tile.name}.`, now, context, { tileId: tile.id, buildings: property.buildings, amount: proceeds });
};

const executeMortgage = (state: GameState, action: Extract<GameAction, { type: "MORTGAGE" }>, now: number, context: EngineContext): void => {
  assertLiquidationPhase(state, action.playerId);
  const { player, tile, property } = assertOwner(state, action.playerId, action.tileId);
  rule(!property.mortgaged, "ALREADY_MORTGAGED", "This property is already mortgaged.");
  rule(!groupHasBuildings(state, tile), "GROUP_HAS_BUILDINGS", "Sell all buildings in this district group before mortgaging.");
  rule(isOwnableTile(tile), "NOT_OWNABLE", "Only an ownable tile can be mortgaged.");
  property.mortgaged = true;
  const value = Math.floor(tile.price / 2);
  player.cash += value;
  addEvent(state, "mortgaged", player.id, `${player.name} mortgages ${tile.name} for ${value} credits.`, now, context, { tileId: tile.id, amount: value });
};

const executeUnmortgage = (state: GameState, action: Extract<GameAction, { type: "UNMORTGAGE" }>, now: number, context: EngineContext): void => {
  assertManageablePhase(state);
  const { player, tile, property } = assertOwner(state, action.playerId, action.tileId);
  rule(property.mortgaged, "NOT_MORTGAGED", "This property is not mortgaged.");
  rule(isOwnableTile(tile), "NOT_OWNABLE", "Only an ownable tile can be unmortgaged.");
  const cost = Math.ceil(tile.price * 0.55);
  rule(player.cash >= cost, "INSUFFICIENT_CASH", "You do not have enough cash to unmortgage this property.");
  player.cash -= cost;
  property.mortgaged = false;
  addEvent(state, "unmortgaged", player.id, `${player.name} unmortgages ${tile.name} for ${cost} credits.`, now, context, { tileId: tile.id, amount: cost });
};

const executePayDebt = (state: GameState, action: Extract<GameAction, { type: "PAY_DEBT" }>, now: number, context: EngineContext): void => {
  requireActiveGame(state);
  rule(state.phase === "awaitingDebt" && state.debt, "NO_DEBT", "There is no outstanding debt to pay.");
  const debt = state.debt;
  rule(debt.playerId === action.playerId, "NOT_DEBTOR", "Only the debtor may resolve this debt.");
  const player = getRequiredPlayer(state, action.playerId);
  const amount = action.amount ?? debt.amount;
  rule(Number.isInteger(amount) && amount > 0, "INVALID_AMOUNT", "Debt payments must be a positive whole number.");
  rule(amount <= debt.amount, "PAYMENT_TOO_LARGE", "The payment exceeds the outstanding debt.");
  rule(player.cash >= amount, "INSUFFICIENT_CASH", "You do not have enough cash for that payment.");
  player.cash -= amount;
  if (debt.creditorPlayerId) getRequiredPlayer(state, debt.creditorPlayerId).cash += amount;
  debt.amount -= amount;
  addEvent(state, "debtPaid", player.id, `${player.name} pays ${amount} credits toward ${debt.reason}.`, now, context, { amount });
  if (debt.amount === 0) {
    state.debt = null;
    state.phase = "awaitingEndTurn";
  }
};

const executeBankruptcy = (state: GameState, action: Extract<GameAction, { type: "DECLARE_BANKRUPTCY" }>, now: number, context: EngineContext): void => {
  requireActiveGame(state);
  rule(state.phase === "awaitingDebt" && state.debt, "NO_DEBT", "Bankruptcy is only available while resolving a debt.");
  const debt = state.debt;
  rule(debt.playerId === action.playerId, "NOT_DEBTOR", "Only the debtor may declare bankruptcy.");
  const player = getRequiredPlayer(state, action.playerId);
  const creditor = debt.creditorPlayerId ? getRequiredPlayer(state, debt.creditorPlayerId) : null;
  [...player.propertyIds].forEach((tileId) => {
    const property = getRequiredProperty(state, tileId);
    if (creditor) {
      assignProperty(state, tileId, creditor.id);
    } else {
      property.ownerId = null;
      property.buildings = 0;
      property.mortgaged = false;
    }
  });
  player.propertyIds = [];
  player.cash = 0;
  player.status = "bankrupt";
  player.doublesRolled = 0;
  state.trades.forEach((trade) => {
    if (trade.status === "open" && (trade.fromPlayerId === player.id || trade.toPlayerId === player.id)) trade.status = "cancelled";
  });
  state.debt = null;
  synchronizePropertyIds(state);
  addEvent(state, "bankrupt", player.id, `${player.name} is bankrupt.`, now, context, { creditorId: creditor?.id ?? null });
  advanceTurn(state, now, context);
};

const executePayDetentionFee = (state: GameState, action: Extract<GameAction, { type: "PAY_DETENTION_FEE" }>, now: number, context: EngineContext): void => {
  const player = requireCurrentPlayer(state, action.playerId);
  rule(state.phase === "awaitingRoll" && player.status === "detained", "NOT_DETAINED", "Only a detained player may pay this fee.");
  const paid = chargePlayer(state, player.id, state.rules.detentionFee, null, "Civic Hold release", now, context);
  if (!paid) return;
  player.status = "active";
  player.detentionTurns = 0;
  addEvent(state, "released", player.id, `${player.name} pays the Civic Hold fee and leaves.`, now, context);
};

const executeUseDetentionPass = (state: GameState, action: Extract<GameAction, { type: "USE_DETENTION_PASS" }>, now: number, context: EngineContext): void => {
  const player = requireCurrentPlayer(state, action.playerId);
  rule(state.phase === "awaitingRoll" && player.status === "detained", "NOT_DETAINED", "Only a detained player may use this pass.");
  rule(player.detentionPasses > 0, "NO_DETENTION_PASS", "This player does not have a Civic Release Pass.");
  player.detentionPasses -= 1;
  player.status = "active";
  player.detentionTurns = 0;
  addEvent(state, "released", player.id, `${player.name} uses a Civic Release Pass.`, now, context);
};

const executeOfferTrade = (state: GameState, action: Extract<GameAction, { type: "OFFER_TRADE" }>, now: number, context: EngineContext): void => {
  requireActiveGame(state);
  rule(state.phase !== "auction" && (!state.debt || state.debt.playerId === action.playerId), "TRADE_NOT_AVAILABLE", "Only the debtor may offer a trade while a debt is active, and trades are unavailable during auctions.");
  const from = getRequiredPlayer(state, action.playerId);
  const to = getRequiredPlayer(state, action.toPlayerId);
  rule(from.id !== to.id, "INVALID_TRADE", "A player cannot trade with themselves.");
  rule((from.status === "active" || from.status === "detained") && (to.status === "active" || to.status === "detained"), "PLAYER_INACTIVE", "Trades require two active players.");
  const offeredCash = action.offeredCash ?? 0;
  const requestedCash = action.requestedCash ?? 0;
  rule(Number.isInteger(offeredCash) && offeredCash >= 0 && Number.isInteger(requestedCash) && requestedCash >= 0, "INVALID_AMOUNT", "Trade cash values must be non-negative whole numbers.");
  validateTradeAssets(state, from.id, action.offeredPropertyIds);
  validateTradeAssets(state, to.id, action.requestedPropertyIds);
  rule(from.cash >= offeredCash && to.cash >= requestedCash, "INSUFFICIENT_CASH", "A trade offer cannot promise unavailable cash.");
  rule(action.offeredPropertyIds.length + action.requestedPropertyIds.length + offeredCash + requestedCash > 0, "EMPTY_TRADE", "A trade offer must include cash or property.");
  const id = action.tradeId ?? context.createId?.("trade") ?? `${state.id}:trade:${state.version + 1}:${state.trades.length + 1}`;
  rule(!state.trades.some((trade) => trade.id === id), "DUPLICATE_TRADE", "This trade id is already in use.");
  state.trades.push({
    id,
    fromPlayerId: from.id,
    toPlayerId: to.id,
    offeredPropertyIds: [...action.offeredPropertyIds],
    requestedPropertyIds: [...action.requestedPropertyIds],
    offeredCash,
    requestedCash,
    status: "open",
    createdAt: now,
  });
  addEvent(state, "tradeOffered", from.id, `${from.name} offers a trade to ${to.name}.`, now, context, { tradeId: id });
};

const executeRespondTrade = (state: GameState, action: Extract<GameAction, { type: "RESPOND_TRADE" }>, now: number, context: EngineContext): void => {
  requireActiveGame(state);
  const trade = state.trades.find((candidate) => candidate.id === action.tradeId);
  rule(trade, "UNKNOWN_TRADE", "This trade offer does not exist.");
  rule(trade.status === "open", "TRADE_CLOSED", "This trade offer is no longer open.");
  rule(trade.toPlayerId === action.playerId, "NOT_TRADE_RECIPIENT", "Only the recipient may respond to this offer.");
  if (action.accept) {
    finaliseTrade(state, trade, now, context);
  } else {
    trade.status = "declined";
    addEvent(state, "tradeDeclined", action.playerId, `${getRequiredPlayer(state, action.playerId).name} declines a trade offer.`, now, context, { tradeId: trade.id });
  }
};

const executeCancelTrade = (state: GameState, action: Extract<GameAction, { type: "CANCEL_TRADE" }>, now: number, context: EngineContext): void => {
  requireActiveGame(state);
  const trade = state.trades.find((candidate) => candidate.id === action.tradeId);
  rule(trade, "UNKNOWN_TRADE", "This trade offer does not exist.");
  rule(trade.status === "open", "TRADE_CLOSED", "This trade offer is no longer open.");
  rule(trade.fromPlayerId === action.playerId, "NOT_TRADE_OFFERER", "Only the offering player may cancel this trade.");
  trade.status = "cancelled";
  addEvent(state, "tradeDeclined", action.playerId, `${getRequiredPlayer(state, action.playerId).name} cancels a trade offer.`, now, context, { tradeId: trade.id });
};

const executePause = (state: GameState, action: Extract<GameAction, { type: "PAUSE_GAME" }>, now: number, context: EngineContext): void => {
  rule(state.status === "active" && state.phase !== "paused", "CANNOT_PAUSE", "Only an active game can be paused.");
  rule(state.hostId === action.playerId, "HOST_ONLY", "Only the host may pause the game.");
  state.phaseBeforePause = state.phase;
  state.phase = "paused";
  state.status = "paused";
  state.turnEndsAt = null;
  addEvent(state, "paused", action.playerId, "The host pauses the game.", now, context);
};

const executeResume = (state: GameState, action: Extract<GameAction, { type: "RESUME_GAME" }>, now: number, context: EngineContext): void => {
  rule(state.status === "paused" && state.phase === "paused", "NOT_PAUSED", "The game is not paused.");
  rule(state.hostId === action.playerId, "HOST_ONLY", "Only the host may resume the game.");
  state.status = "active";
  state.phase = state.phaseBeforePause ?? "awaitingRoll";
  state.phaseBeforePause = null;
  setTurnDeadline(state, now);
  addEvent(state, "resumed", action.playerId, "The host resumes the game.", now, context);
};

const executeEndGame = (state: GameState, action: Extract<GameAction, { type: "END_GAME" }>, now: number, context: EngineContext): void => {
  rule(state.hostId === action.playerId, "HOST_ONLY", "Only the host may end the game.");
  rule(state.status !== "complete", "GAME_COMPLETE", "The game has already finished.");
  const winner = getSortedPlayersByNetWorth(state).find((player) => player.status !== "bankrupt");
  state.status = "complete";
  state.phase = "complete";
  state.winnerId = winner?.id ?? null;
  state.currentPlayerId = null;
  state.turnEndsAt = null;
  addEvent(state, "message", action.playerId, winner ? `${winner.name} wins the ended game by net worth.` : "The host ends the game.", now, context);
};

/**
 * Authoritative pure reducer.  The caller must enforce optimistic version
 * locking and provide `context.rollDice` in production.  It never mutates the
 * supplied state, and invalid actions throw `GameRuleError` with a stable code.
 */
export const reduceGame = (state: GameState, action: GameAction, context: EngineContext = {}): GameState => {
  const draft = cloneState(state);
  const now = nowFrom(action, context);

  switch (action.type) {
    case "START_GAME":
      executeStartGame(draft, action, now, context);
      break;
    case "ROLL":
      executeRoll(draft, action, now, context);
      break;
    case "BUY_PROPERTY":
      executeBuy(draft, action, now, context);
      break;
    case "DECLINE_PROPERTY":
      executeDecline(draft, action, now, context);
      break;
    case "PLACE_BID":
      executeBid(draft, action, now, context);
      break;
    case "PASS_BID":
      executePassBid(draft, action, now, context);
      break;
    case "EXPIRE_AUCTION":
      executeExpireAuction(draft, action, now, context);
      break;
    case "END_TURN":
      executeEndTurn(draft, action, now, context);
      break;
    case "BUILD":
      executeBuild(draft, action, now, context);
      break;
    case "SELL_BUILDING":
      executeSellBuilding(draft, action, now, context);
      break;
    case "MORTGAGE":
      executeMortgage(draft, action, now, context);
      break;
    case "UNMORTGAGE":
      executeUnmortgage(draft, action, now, context);
      break;
    case "PAY_DEBT":
      executePayDebt(draft, action, now, context);
      break;
    case "DECLARE_BANKRUPTCY":
      executeBankruptcy(draft, action, now, context);
      break;
    case "PAY_DETENTION_FEE":
      executePayDetentionFee(draft, action, now, context);
      break;
    case "USE_DETENTION_PASS":
      executeUseDetentionPass(draft, action, now, context);
      break;
    case "OFFER_TRADE":
      executeOfferTrade(draft, action, now, context);
      break;
    case "RESPOND_TRADE":
      executeRespondTrade(draft, action, now, context);
      break;
    case "CANCEL_TRADE":
      executeCancelTrade(draft, action, now, context);
      break;
    case "PAUSE_GAME":
      executePause(draft, action, now, context);
      break;
    case "RESUME_GAME":
      executeResume(draft, action, now, context);
      break;
    case "END_GAME":
      executeEndGame(draft, action, now, context);
      break;
    default: {
      const unhandled: never = action;
      throw new GameRuleError("UNKNOWN_ACTION", `Unknown action ${(unhandled as { type?: string }).type ?? ""}.`);
    }
  }

  draft.version = state.version + 1;
  return draft;
};

/** A compact helper for UI action affordances; server validation remains final. */
export const getAllowedActions = (state: GameState, playerId: PlayerId): GameAction["type"][] => {
  const player = getPlayer(state, playerId);
  if (!player) return [];
  if (state.status === "waiting") return player.id === state.hostId ? ["START_GAME"] : [];
  if (state.status === "paused") return player.id === state.hostId ? ["RESUME_GAME"] : [];
  if (state.status !== "active") return [];

  const common = player.status === "active" || player.status === "detained" ? ["OFFER_TRADE"] as GameAction["type"][] : [];
  if (state.phase === "auction") {
    if (state.auction?.eligiblePlayerIds.includes(playerId) && !state.auction.passedPlayerIds.includes(playerId)) return [...common, "PLACE_BID", "PASS_BID"];
    return common;
  }
  if (state.phase === "awaitingDebt" && state.debt?.playerId === playerId) return ["PAY_DEBT", "DECLARE_BANKRUPTCY"];
  if (state.currentPlayerId !== playerId) return common;
  if (state.phase === "awaitingPurchase") return ["BUY_PROPERTY", "DECLINE_PROPERTY", ...common];
  if (state.phase === "awaitingRoll") {
    const detentionActions = player.status === "detained" ? ["PAY_DETENTION_FEE", "USE_DETENTION_PASS"] as GameAction["type"][] : [];
    return ["ROLL", "BUILD", "SELL_BUILDING", "MORTGAGE", "UNMORTGAGE", ...detentionActions, ...common];
  }
  if (state.phase === "awaitingEndTurn") return ["END_TURN", "BUILD", "SELL_BUILDING", "MORTGAGE", "UNMORTGAGE", ...common];
  return common;
};
