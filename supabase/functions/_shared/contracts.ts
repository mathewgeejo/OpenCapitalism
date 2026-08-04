import type { AssetKind } from "./board.ts";

export type GameStatus = "lobby" | "active" | "paused" | "finished" | "abandoned";
export type GamePhase =
  | "await_roll"
  | "await_purchase"
  | "await_auction"
  | "await_end_turn"
  | "await_debt"
  | "paused"
  | "finished";

export interface GameSettings {
  turnSeconds: number;
  auctionSeconds: number;
  fastAnimation: boolean;
  jackpotEnabled: boolean;
  startBonus: number;
}

export const DEFAULT_SETTINGS: GameSettings = {
  turnSeconds: 30,
  auctionSeconds: 20,
  fastAnimation: false,
  jackpotEnabled: false,
  startBonus: 200,
};

export interface PlayerMeta {
  id: string;
  displayName: string;
  avatarColor: string;
  seat: number;
  memberStatus: "joined" | "left" | "eliminated";
}

export interface PrivatePlayer {
  cash: number;
  position: number;
  isDetained: boolean;
  detentionAttempts: number;
  hasReleasePermit: boolean;
  doublesThisTurn: number;
  bankrupt: boolean;
}

export interface AssetState {
  ownerId: string | null;
  buildings: number; // 0–4 supply kits, 5 is a landmark
  mortgaged: boolean;
}

export interface PendingPurchase {
  tileId: string;
  cost: number;
}

export interface PendingDebt {
  playerId: string;
  amount: number;
  creditorId: string | null;
  reason: string;
  afterPhase: "await_roll" | "await_end_turn";
  addToJackpot: boolean;
}

export interface AuctionState {
  tileId: string;
  highestBid: number;
  highestBidderId: string | null;
  passedPlayerIds: string[];
  endsAt: string;
}

export interface TradeOffer {
  id: string;
  fromUserId: string;
  toUserId: string;
  offerCash: number;
  requestCash: number;
  offerTileIds: string[];
  requestTileIds: string[];
  expiresAt: string;
}

export interface PrivateGameState {
  schemaVersion: 1;
  status: GameStatus;
  phase: GamePhase;
  settings: GameSettings;
  currentPlayerId: string | null;
  turnDeadlineAt: string | null;
  round: number;
  turnOrder: string[];
  players: Record<string, PrivatePlayer>;
  assets: Record<string, AssetState>;
  pendingPurchase: PendingPurchase | null;
  pendingDebt: PendingDebt | null;
  auction: AuctionState | null;
  trades: TradeOffer[];
  jackpot: number;
  lastRoll: { playerId: string; dice: [number, number] } | null;
  eventDeck: string[];
  civicDeck: string[];
  eventCursor: number;
  civicCursor: number;
  canRollAgain: boolean;
  phaseBeforePause: GamePhase | null;
  /** Remaining current turn/auction time captured when a host pauses play. */
  pausedDeadlineRemainingMs: number | null;
}

export interface PublicPlayerState {
  id: string;
  displayName: string;
  avatarColor: string;
  seat: number;
  memberStatus: "joined" | "left" | "eliminated";
  cash: number;
  netWorth: number;
  position: number;
  isDetained: boolean;
  bankrupt: boolean;
  assetCount: number;
}

export interface PublicAssetState {
  tileId: string;
  kind: AssetKind;
  ownerId: string | null;
  buildings: number;
  mortgaged: boolean;
}

export interface PublicGameSnapshot {
  schemaVersion: 1;
  status: GameStatus;
  phase: GamePhase;
  currentPlayerId: string | null;
  turnDeadlineAt: string | null;
  round: number;
  players: PublicPlayerState[];
  assets: PublicAssetState[];
  pendingPurchase: { tileId: string; cost: number } | null;
  /** Owed amount is public; deck order and private trade terms are not. */
  debt: { playerId: string; amount: number; reason: string } | null;
  auction: {
    tileId: string;
    highestBid: number;
    highestBidderId: string | null;
    endsAt: string;
    passedPlayerIds: string[];
  } | null;
  trades: Array<{ id: string; fromUserId: string; toUserId: string; expiresAt: string }>;
  jackpot: number;
  lastRoll: { playerId: string; dice: [number, number] } | null;
}

/**
 * Terms are deliberately absent from the durable/public snapshot. An Edge
 * Function adds these only when the snapshot is being returned to one of the
 * two parties to an open trade.
 */
export interface ViewerTradeDetails {
  id: string;
  fromUserId: string;
  toUserId: string;
  offerCash: number;
  requestCash: number;
  offerTileIds: string[];
  requestTileIds: string[];
  expiresAt: string;
}

/** Response-only extension; never persist this object in game_public_snapshots. */
export interface ViewerGameSnapshot extends PublicGameSnapshot {
  tradeDetails: ViewerTradeDetails[];
  /** Lobby/reconnect roster, including joined players not yet in turnOrder. */
  members?: PlayerMeta[];
}

export interface PublicGameEvent {
  kind: string;
  actorId?: string | null;
  message: string;
  data?: Record<string, unknown>;
}

export interface EngineResult {
  state: PrivateGameState;
  events: PublicGameEvent[];
  memberStatusChanges: Array<{ userId: string; status: "joined" | "left" | "eliminated" }>;
}

export type GameAction =
  | { type: "roll" }
  | { type: "buy_asset" }
  | { type: "decline_asset" }
  | { type: "place_bid"; amount: number }
  | { type: "pass_bid" }
  | { type: "end_turn" }
  | { type: "pay_detention" }
  | { type: "use_release_permit" }
  | { type: "build"; tileId: string }
  | { type: "sell_building"; tileId: string }
  | { type: "mortgage"; tileId: string }
  | { type: "unmortgage"; tileId: string }
  | {
      type: "offer_trade";
      toUserId: string;
      offerCash: number;
      requestCash: number;
      offerTileIds: string[];
      requestTileIds: string[];
    }
  | { type: "respond_trade"; tradeId: string; accept: boolean }
  | { type: "cancel_trade"; tradeId: string }
  | { type: "pay_debt" }
  | { type: "declare_bankruptcy" }
  | { type: "resolve_deadline" }
  | { type: "pause_game" }
  | { type: "resume_game" }
  | { type: "end_game" };

export interface EngineContext {
  actorId: string;
  now: Date;
  isHost: boolean;
  rollDice: () => [number, number];
  makeId: () => string;
}

export class GameRuleError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "GameRuleError";
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asString = (value: unknown, field: string): string => {
  if (typeof value !== "string" || value.length === 0) throw new GameRuleError("INVALID_ACTION", `${field} is required`);
  return value;
};

const asMoney = (value: unknown, field: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new GameRuleError("INVALID_ACTION", `${field} must be a non-negative integer`);
  }
  return value as number;
};

const asIds = (value: unknown, field: string): string[] => {
  if (!Array.isArray(value) || value.length > 16 || value.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new GameRuleError("INVALID_ACTION", `${field} must be an array of asset ids`);
  }
  return [...new Set(value as string[])];
};

/** Validates the untrusted JSON action crossing the browser/Edge boundary. */
export function parseGameAction(value: unknown): GameAction {
  if (!isRecord(value)) throw new GameRuleError("INVALID_ACTION", "action must be an object");
  const type = asString(value.type, "action.type");
  switch (type) {
    case "roll": case "buy_asset": case "decline_asset": case "pass_bid": case "end_turn":
    case "pay_detention": case "use_release_permit": case "pay_debt": case "declare_bankruptcy":
    case "resolve_deadline": case "pause_game": case "resume_game": case "end_game":
      return { type };
    case "place_bid": return { type, amount: asMoney(value.amount, "amount") };
    case "build": case "sell_building": case "mortgage": case "unmortgage":
      return { type, tileId: asString(value.tileId, "tileId") };
    case "cancel_trade": return { type, tradeId: asString(value.tradeId, "tradeId") };
    case "respond_trade": {
      if (typeof value.accept !== "boolean") throw new GameRuleError("INVALID_ACTION", "accept must be boolean");
      return { type, tradeId: asString(value.tradeId, "tradeId"), accept: value.accept };
    }
    case "offer_trade":
      return {
        type,
        toUserId: asString(value.toUserId, "toUserId"),
        offerCash: asMoney(value.offerCash, "offerCash"),
        requestCash: asMoney(value.requestCash, "requestCash"),
        offerTileIds: asIds(value.offerTileIds, "offerTileIds"),
        requestTileIds: asIds(value.requestTileIds, "requestTileIds"),
      };
    default:
      throw new GameRuleError("INVALID_ACTION", "Unknown action type");
  }
}

export function normalizeSettings(raw: unknown): GameSettings {
  const settings = isRecord(raw) ? raw : {};
  const boundedInt = (key: keyof GameSettings, fallback: number, min: number, max: number): number => {
    const value = settings[key];
    return Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max ? value as number : fallback;
  };
  return {
    turnSeconds: boundedInt("turnSeconds", DEFAULT_SETTINGS.turnSeconds, 15, 120),
    auctionSeconds: boundedInt("auctionSeconds", DEFAULT_SETTINGS.auctionSeconds, 10, 90),
    fastAnimation: typeof settings.fastAnimation === "boolean" ? settings.fastAnimation : DEFAULT_SETTINGS.fastAnimation,
    jackpotEnabled: typeof settings.jackpotEnabled === "boolean" ? settings.jackpotEnabled : DEFAULT_SETTINGS.jackpotEnabled,
    startBonus: boundedInt("startBonus", DEFAULT_SETTINGS.startBonus, 100, 500),
  };
}
