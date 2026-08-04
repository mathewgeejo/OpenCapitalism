/**
 * Shared, framework-free domain types for Civic Fortune.  The game engine is
 * deliberately independent of React and Supabase so it can run unchanged in
 * an Edge Function, a test, or a local demo.
 */

export type PlayerId = string;
export type TileId = string;
export type GameId = string;
export type TradeId = string;
export type CardDeck = "event" | "civic";

export type TileKind =
  | "start"
  | "district"
  | "transit"
  | "utility"
  | "event"
  | "civic"
  | "levy"
  | "detention"
  | "festival"
  | "goToDetention";

export type OwnableTileKind = "district" | "transit" | "utility";

export type BuildingCount = 0 | 1 | 2 | 3 | 4 | 5;

/** 5 represents the district's signature tower. */
export type BuildingLabel = "none" | "house" | "tower";

export interface Tile {
  /** Stable identifier used by the persistent game state. */
  id: TileId;
  /** 0-based movement position around the 52-space board. */
  index: number;
  name: string;
  kind: TileKind;
  /** CSS-safe colour used by the HUD and the 3D board ownership strip. */
  color: string;
  description: string;
  /** District colour/set identifier. Present only on buildable districts. */
  group?: string;
  /** Purchase price for district, transit, and utility spaces. */
  price?: number;
  /** Base rent followed by 1–4 houses and a tower for districts. */
  rent?: readonly number[];
  /** Cost of one house/tower upgrade on a district. */
  buildCost?: number;
  /** Fixed charge on a levy space. */
  levy?: number;
}

export interface PropertyState {
  tileId: TileId;
  ownerId: PlayerId | null;
  buildings: BuildingCount;
  mortgaged: boolean;
}

export type PlayerStatus = "active" | "detained" | "bankrupt" | "left";

export interface Player {
  id: PlayerId;
  name: string;
  color: string;
  cash: number;
  /** Board index, not tile id, for direct use by the 3D token renderer. */
  position: number;
  status: PlayerStatus;
  detentionTurns: number;
  detentionPasses: number;
  doublesRolled: number;
  /** Denormalized convenience field; the engine keeps it aligned with properties. */
  propertyIds: TileId[];
  joinedAt: number;
}

export type GamePhase =
  | "lobby"
  | "awaitingRoll"
  | "awaitingPurchase"
  | "auction"
  | "awaitingEndTurn"
  | "awaitingDebt"
  | "paused"
  | "complete";

export interface GameRules {
  maxPlayers: number;
  startingCash: number;
  startBonus: number;
  turnTimerSeconds: number;
  auctionSeconds: number;
  detentionFee: number;
  jackpotEnabled: boolean;
  fastAnimations: boolean;
}

export interface PendingPurchase {
  playerId: PlayerId;
  tileId: TileId;
  price: number;
}

export interface AuctionState {
  tileId: TileId;
  startedByPlayerId: PlayerId;
  highestBid: number;
  highestBidderId: PlayerId | null;
  /** Active, non-bankrupt seats eligible to bid. */
  eligiblePlayerIds: PlayerId[];
  /** A passed bidder cannot re-enter the same auction. */
  passedPlayerIds: PlayerId[];
  endsAt: number | null;
}

export interface DebtState {
  playerId: PlayerId;
  amount: number;
  creditorPlayerId: PlayerId | null;
  reason: string;
}

export interface TradeOffer {
  id: TradeId;
  fromPlayerId: PlayerId;
  toPlayerId: PlayerId;
  offeredPropertyIds: TileId[];
  requestedPropertyIds: TileId[];
  offeredCash: number;
  requestedCash: number;
  status: "open" | "accepted" | "declined" | "cancelled";
  createdAt: number;
}

export type CardEffect =
  | { type: "cash"; amount: number }
  | { type: "moveTo"; tileIndex: number }
  | { type: "moveRelative"; spaces: number }
  | { type: "detention" }
  | { type: "collectFromEach"; amount: number }
  | { type: "payEach"; amount: number }
  | { type: "repair"; perHouse: number; perTower: number }
  | { type: "detentionPass" };

export interface Card {
  id: string;
  deck: CardDeck;
  title: string;
  text: string;
  effect: CardEffect;
}

export interface CardDeckState {
  event: Card[];
  civic: Card[];
}

export type GameEventType =
  | "gameStarted"
  | "roll"
  | "moved"
  | "bought"
  | "declined"
  | "auctionStarted"
  | "bid"
  | "auctionWon"
  | "auctionExpired"
  | "rent"
  | "levy"
  | "card"
  | "built"
  | "soldBuilding"
  | "mortgaged"
  | "unmortgaged"
  | "debt"
  | "debtPaid"
  | "bankrupt"
  | "detained"
  | "released"
  | "turnEnded"
  | "tradeOffered"
  | "tradeAccepted"
  | "tradeDeclined"
  | "paused"
  | "resumed"
  | "message";

export interface GameEvent {
  id: string;
  sequence: number;
  type: GameEventType;
  actorId: PlayerId | null;
  message: string;
  createdAt: number;
  /** Kept deliberately small so this can be broadcast as a public event. */
  data?: Record<string, string | number | boolean | null>;
}

export interface GameState {
  id: GameId;
  version: number;
  status: "waiting" | "active" | "paused" | "complete";
  phase: GamePhase;
  hostId: PlayerId;
  players: Player[];
  currentPlayerId: PlayerId | null;
  currentTurn: number;
  turnEndsAt: number | null;
  rules: GameRules;
  /** Indexed by tile id for fast property lookups and easy persistence. */
  properties: Record<TileId, PropertyState>;
  pendingPurchase: PendingPurchase | null;
  auction: AuctionState | null;
  debt: DebtState | null;
  trades: TradeOffer[];
  lastRoll: [number, number] | null;
  jackpot: number;
  decks: CardDeckState;
  events: GameEvent[];
  winnerId: PlayerId | null;
  /** A paused game returns to this phase on RESUME_GAME. */
  phaseBeforePause: GamePhase | null;
}

export interface PublicGameState extends Omit<GameState, "decks"> {
  /** Card counts are safe to send to clients, unlike deck order/effects. */
  deckCounts: Record<CardDeck, number>;
}

export interface PlayerInput {
  id: PlayerId;
  name: string;
  color: string;
}

export type GameAction =
  | { type: "START_GAME"; playerId: PlayerId; now?: number }
  | { type: "ROLL"; playerId: PlayerId; now?: number; dice?: [number, number] }
  | { type: "BUY_PROPERTY"; playerId: PlayerId; now?: number }
  | { type: "DECLINE_PROPERTY"; playerId: PlayerId; now?: number }
  | { type: "PLACE_BID"; playerId: PlayerId; amount: number; now?: number }
  | { type: "PASS_BID"; playerId: PlayerId; now?: number }
  | { type: "EXPIRE_AUCTION"; playerId?: PlayerId; now?: number }
  | { type: "END_TURN"; playerId: PlayerId; now?: number }
  | { type: "BUILD"; playerId: PlayerId; tileId: TileId; now?: number }
  | { type: "SELL_BUILDING"; playerId: PlayerId; tileId: TileId; now?: number }
  | { type: "MORTGAGE"; playerId: PlayerId; tileId: TileId; now?: number }
  | { type: "UNMORTGAGE"; playerId: PlayerId; tileId: TileId; now?: number }
  | { type: "PAY_DEBT"; playerId: PlayerId; amount?: number; now?: number }
  | { type: "DECLARE_BANKRUPTCY"; playerId: PlayerId; now?: number }
  | { type: "PAY_DETENTION_FEE"; playerId: PlayerId; now?: number }
  | { type: "USE_DETENTION_PASS"; playerId: PlayerId; now?: number }
  | {
      type: "OFFER_TRADE";
      playerId: PlayerId;
      toPlayerId: PlayerId;
      offeredPropertyIds: TileId[];
      requestedPropertyIds: TileId[];
      offeredCash?: number;
      requestedCash?: number;
      tradeId?: TradeId;
      now?: number;
    }
  | { type: "RESPOND_TRADE"; playerId: PlayerId; tradeId: TradeId; accept: boolean; now?: number }
  | { type: "CANCEL_TRADE"; playerId: PlayerId; tradeId: TradeId; now?: number }
  | { type: "PAUSE_GAME"; playerId: PlayerId; now?: number }
  | { type: "RESUME_GAME"; playerId: PlayerId; now?: number }
  | { type: "END_GAME"; playerId: PlayerId; now?: number };

/** Dependency injection points used by the authoritative server adapter. */
export interface EngineContext {
  /** Server-only source of dice. A ROLL action's dice is useful for tests only. */
  rollDice?: () => [number, number];
  /** Server-only clock. Each action can also provide a deterministic now for tests. */
  now?: () => number;
  /** Optional deterministic ID source for events and trade offers. */
  createId?: (prefix: string) => string;
}

export class GameRuleError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "GameRuleError";
    this.code = code;
  }
}
