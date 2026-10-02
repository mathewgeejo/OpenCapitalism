/**
 * Authoritative copy of the frontend's 40-space World Tour board.
 * IDs, indexes, names, and district economics deliberately match
 * `src/game/board.ts`; server-only kinds map frontend transit/utility values to
 * route/works so the rules engine stays independent of renderer terminology.
 */

export type TileKind = "corner" | "district" | "route" | "works" | "event" | "civic" | "levy";
export type AssetKind = "district" | "route" | "works";

export interface TileBase { id: string; index: number; name: string; kind: TileKind; }
export interface DistrictTile extends TileBase {
  kind: "district";
  district: string;
  color: string;
  price: number;
  mortgageValue: number;
  buildCost: number;
  /** bare rent, 1–4 supply kits, then landmark */
  rents: readonly [number, number, number, number, number, number];
}
export interface RouteTile extends TileBase { kind: "route"; price: number; mortgageValue: number; }
export interface WorksTile extends TileBase { kind: "works"; price: number; mortgageValue: number; }
export interface LevyTile extends TileBase { kind: "levy"; amount: number; }
export interface CornerTile extends TileBase { kind: "corner"; effect: "start" | "commons" | "detention" | "audit"; }
export type BoardTile = DistrictTile | RouteTile | WorksTile | LevyTile | CornerTile | (TileBase & { kind: "event" | "civic" });

const district = (
  index: number, id: string, name: string, districtName: string, color: string, price: number, buildCost: number,
  rents: readonly [number, number, number, number, number, number],
): DistrictTile => ({ index, id, name, kind: "district", district: districtName, color, price, mortgageValue: Math.floor(price / 2), buildCost, rents });
const route = (index: number, id: string, name: string): RouteTile => ({ index, id, name, kind: "route", price: 220, mortgageValue: 110 });
const works = (index: number, id: string, name: string): WorksTile => ({ index, id, name, kind: "works", price: 180, mortgageValue: 90 });
const levy = (index: number, id: string, name: string, amount: number): LevyTile => ({ index, id, name, kind: "levy", amount });
const corner = (index: number, id: string, name: string, effect: CornerTile["effect"]): CornerTile => ({ index, id, name, kind: "corner", effect });
const card = (index: number, id: string, name: string, kind: "event" | "civic"): BoardTile => ({ index, id, name, kind });

export const BOARD: readonly BoardTile[] = [
  corner(0, "founders-plaza", "GO", "start"),
  district(1, "cedar-quay", "Egypt", "harbor", "#38bdf8", 60, 50, [4, 20, 60, 180, 320, 500]),
  card(2, "civic-assembly", "Community", "civic"),
  district(3, "marina-row", "Morocco", "harbor", "#38bdf8", 80, 50, [6, 30, 90, 270, 400, 550]),
  levy(4, "infrastructure-levy", "Travel Tax", 120),
  route(5, "north-loop", "North Express"),
  district(6, "brass-lane", "Spain", "copper", "#f59e0b", 100, 50, [8, 40, 100, 300, 450, 600]),
  card(7, "market-event", "Chance", "event"),
  district(8, "foundry-court", "Portugal", "copper", "#f59e0b", 120, 50, [10, 50, 150, 450, 625, 750]),
  district(9, "ember-square", "Italy", "copper", "#f59e0b", 140, 50, [12, 60, 180, 500, 700, 850]),
  corner(10, "civic-hold", "Jail / Visiting", "detention"),
  district(11, "willow-passage", "India", "willow", "#14b8a6", 160, 100, [14, 70, 210, 490, 630, 770]),
  works(12, "waterworks", "Water Works"),
  district(13, "canal-view", "Sri Lanka", "willow", "#14b8a6", 180, 100, [16, 80, 240, 560, 720, 880]),
  district(14, "heron-walk", "Nepal", "willow", "#14b8a6", 200, 100, [18, 90, 270, 630, 810, 990]),
  route(15, "east-spur", "East Express"),
  district(16, "market-street", "Thailand", "market", "#a855f7", 220, 150, [20, 100, 300, 700, 900, 1100]),
  card(17, "civic-grant", "Community", "civic"),
  district(18, "guild-alley", "Vietnam", "market", "#a855f7", 240, 150, [22, 110, 330, 770, 990, 1210]),
  district(19, "traders-close", "Indonesia", "market", "#a855f7", 260, 150, [24, 120, 360, 840, 1080, 1320]),
  corner(20, "commons-festival", "Free Parking", "commons"),
  district(21, "indigo-pier", "Sweden", "indigo", "#6366f1", 260, 150, [24, 120, 360, 840, 1080, 1320]),
  card(22, "night-event", "Chance", "event"),
  district(23, "observatory-way", "Norway", "indigo", "#6366f1", 280, 150, [26, 130, 390, 910, 1170, 1430]),
  district(24, "meridian-avenue", "Finland", "indigo", "#6366f1", 300, 150, [28, 140, 420, 980, 1260, 1540]),
  route(25, "south-express", "South Express"),
  district(26, "gallery-row", "France", "rose", "#f43f5e", 300, 150, [28, 140, 420, 980, 1260, 1540]),
  district(27, "theatre-district", "Germany", "rose", "#f43f5e", 320, 200, [30, 150, 450, 1050, 1350, 1650]),
  works(28, "gridworks", "Power Station"),
  district(29, "lantern-hill", "Netherlands", "rose", "#f43f5e", 340, 200, [32, 160, 480, 1120, 1440, 1760]),
  corner(30, "return-to-hold", "Go to Jail", "audit"),
  district(31, "summit-terrace", "Australia", "summit", "#0ea5e9", 320, 200, [30, 150, 450, 1050, 1350, 1650]),
  district(32, "atlas-square", "New Zealand", "summit", "#0ea5e9", 340, 200, [32, 160, 480, 1120, 1440, 1760]),
  card(33, "civic-forum", "Community", "civic"),
  district(34, "skyline-drive", "Japan", "summit", "#0ea5e9", 360, 200, [34, 170, 510, 1190, 1530, 1870]),
  route(35, "west-connector", "West Express"),
  card(36, "festival-event", "Chance", "event"),
  district(37, "aurora-arch", "United Kingdom", "crown", "#e879f9", 380, 200, [36, 180, 540, 1260, 1620, 1980]),
  levy(38, "public-works-levy", "Luxury Tax", 180),
  district(39, "prosperity-point", "United States", "crown", "#e879f9", 400, 200, [38, 190, 570, 1330, 1710, 2090]),
] as const;

if (BOARD.length !== 40) throw new Error("Civic Fortune board must have exactly 40 spaces");

export const BOARD_BY_ID = new Map(BOARD.map((tile) => [tile.id, tile]));
export const ASSET_TILES = BOARD.filter((tile): tile is DistrictTile | RouteTile | WorksTile => tile.kind === "district" || tile.kind === "route" || tile.kind === "works");
export const DISTRICTS = [...new Set(BOARD.filter((tile): tile is DistrictTile => tile.kind === "district").map((tile) => tile.district))];
export const DETENTION_INDEX = 10;

export function tileAt(position: number): BoardTile { return BOARD[((position % BOARD.length) + BOARD.length) % BOARD.length]; }
export function isAsset(tile: BoardTile): tile is DistrictTile | RouteTile | WorksTile { return tile.kind === "district" || tile.kind === "route" || tile.kind === "works"; }
export function districtTiles(districtName: string): DistrictTile[] { return BOARD.filter((tile): tile is DistrictTile => tile.kind === "district" && tile.district === districtName); }
