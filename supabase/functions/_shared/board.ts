/**
 * Authoritative copy of the frontend's original 52-space Civic Fortune board.
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
  corner(0, "founders-plaza", "Founders' Plaza", "start"),
  district(1, "cedar-quay", "Cedar Quay", "harbor", "#38bdf8", 60, 50, [4, 20, 60, 180, 320, 500]),
  card(2, "civic-assembly", "Civic Assembly", "civic"),
  district(3, "marina-row", "Marina Row", "harbor", "#38bdf8", 80, 50, [6, 30, 90, 270, 400, 550]),
  levy(4, "infrastructure-levy", "Infrastructure Levy", 120),
  district(5, "brass-lane", "Brass Lane", "copper", "#f59e0b", 100, 50, [8, 40, 100, 300, 450, 600]),
  route(6, "north-loop", "North Loop"),
  district(7, "foundry-court", "Foundry Court", "copper", "#f59e0b", 120, 50, [10, 50, 150, 450, 625, 750]),
  card(8, "market-event", "Market Event", "event"),
  district(9, "ember-square", "Ember Square", "copper", "#f59e0b", 140, 50, [12, 60, 180, 500, 700, 850]),
  district(10, "orchard-gate", "Orchard Gate", "orchard", "#22c55e", 160, 100, [14, 70, 200, 550, 750, 900]),
  works(11, "waterworks", "Waterworks"),
  district(12, "grove-terrace", "Grove Terrace", "orchard", "#22c55e", 180, 100, [16, 80, 220, 600, 800, 950]),
  corner(13, "civic-hold", "Civic Hold", "detention"),
  district(14, "appleton-rise", "Appleton Rise", "orchard", "#22c55e", 200, 100, [18, 90, 250, 700, 875, 1050]),
  card(15, "civic-grant", "Civic Grant", "civic"),
  district(16, "willow-passage", "Willow Passage", "willow", "#14b8a6", 220, 100, [20, 100, 300, 750, 925, 1100]),
  district(17, "canal-view", "Canal View", "willow", "#14b8a6", 240, 100, [22, 110, 330, 800, 975, 1150]),
  route(18, "east-spur", "East Spur"),
  district(19, "heron-walk", "Heron Walk", "willow", "#14b8a6", 260, 100, [24, 120, 360, 850, 1025, 1200]),
  card(20, "harbor-event", "Harbor Event", "event"),
  district(21, "market-street", "Market Street", "market", "#a855f7", 280, 150, [26, 130, 390, 900, 1100, 1275]),
  district(22, "guild-alley", "Guild Alley", "market", "#a855f7", 300, 150, [28, 150, 450, 1000, 1200, 1400]),
  works(23, "gridworks", "Gridworks"),
  district(24, "traders-close", "Traders' Close", "market", "#a855f7", 320, 150, [30, 170, 500, 1100, 1300, 1500]),
  district(25, "ledger-lane", "Ledger Lane", "market", "#a855f7", 340, 150, [32, 190, 550, 1200, 1400, 1600]),
  corner(26, "commons-festival", "Commons Festival", "commons"),
  district(27, "indigo-pier", "Indigo Pier", "indigo", "#6366f1", 360, 150, [34, 200, 600, 1300, 1500, 1750]),
  district(28, "observatory-way", "Observatory Way", "indigo", "#6366f1", 380, 150, [36, 220, 660, 1400, 1650, 1900]),
  card(29, "night-event", "Night Market Event", "event"),
  district(30, "meridian-avenue", "Meridian Avenue", "indigo", "#6366f1", 400, 150, [38, 240, 720, 1500, 1750, 2000]),
  route(31, "south-express", "South Express"),
  district(32, "rosewood-place", "Rosewood Place", "rose", "#f43f5e", 420, 200, [40, 260, 780, 1600, 1850, 2150]),
  card(33, "civic-forum", "Civic Forum", "civic"),
  district(34, "gallery-row", "Gallery Row", "rose", "#f43f5e", 440, 200, [42, 280, 840, 1700, 1950, 2250]),
  district(35, "theatre-district", "Theatre District", "rose", "#f43f5e", 460, 200, [44, 300, 900, 1800, 2050, 2400]),
  district(36, "lantern-hill", "Lantern Hill", "rose", "#f43f5e", 480, 200, [46, 320, 960, 1900, 2150, 2550]),
  levy(37, "public-works-levy", "Public Works Levy", 180),
  district(38, "summit-terrace", "Summit Terrace", "summit", "#0ea5e9", 500, 200, [48, 340, 1020, 2000, 2250, 2700]),
  corner(39, "return-to-hold", "Return to Civic Hold", "audit"),
  district(40, "atlas-square", "Atlas Square", "summit", "#0ea5e9", 520, 200, [50, 360, 1080, 2100, 2350, 2850]),
  route(41, "west-connector", "West Connector"),
  district(42, "skyline-drive", "Skyline Drive", "summit", "#0ea5e9", 540, 200, [52, 380, 1140, 2200, 2450, 3000]),
  card(43, "civic-endowment", "Civic Endowment", "civic"),
  district(44, "crown-vista", "Crown Vista", "summit", "#0ea5e9", 560, 200, [54, 400, 1200, 2300, 2550, 3150]),
  card(45, "festival-event", "Festival Event", "event"),
  district(46, "aurora-arch", "Aurora Arch", "crown", "#e879f9", 580, 250, [56, 420, 1260, 2400, 2650, 3300]),
  district(47, "founders-heights", "Founders' Heights", "crown", "#e879f9", 600, 250, [58, 440, 1320, 2500, 2750, 3450]),
  district(48, "solstice-row", "Solstice Row", "crown", "#e879f9", 620, 250, [60, 460, 1380, 2600, 2850, 3600]),
  district(49, "garden-crescent", "Garden Crescent", "crown", "#e879f9", 640, 250, [62, 480, 1440, 2700, 2950, 3750]),
  district(50, "citadel-way", "Citadel Way", "crown", "#e879f9", 660, 250, [64, 500, 1500, 2800, 3050, 3900]),
  district(51, "prosperity-point", "Prosperity Point", "crown", "#e879f9", 700, 250, [68, 540, 1620, 3000, 3300, 4200]),
] as const;

if (BOARD.length !== 52) throw new Error("Civic Fortune board must have exactly 52 spaces");

export const BOARD_BY_ID = new Map(BOARD.map((tile) => [tile.id, tile]));
export const ASSET_TILES = BOARD.filter((tile): tile is DistrictTile | RouteTile | WorksTile => tile.kind === "district" || tile.kind === "route" || tile.kind === "works");
export const DISTRICTS = [...new Set(BOARD.filter((tile): tile is DistrictTile => tile.kind === "district").map((tile) => tile.district))];
export const DETENTION_INDEX = 13;

export function tileAt(position: number): BoardTile { return BOARD[((position % BOARD.length) + BOARD.length) % BOARD.length]; }
export function isAsset(tile: BoardTile): tile is DistrictTile | RouteTile | WorksTile { return tile.kind === "district" || tile.kind === "route" || tile.kind === "works"; }
export function districtTiles(districtName: string): DistrictTile[] { return BOARD.filter((tile): tile is DistrictTile => tile.kind === "district" && tile.district === districtName); }
