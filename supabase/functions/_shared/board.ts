/**
 * The Civic Fortune board is intentionally original: the names, order, art
 * direction, and economics below are not derived from any branded board game.
 * Keeping it data-driven lets the client render the same 52 spaces as the
 * authoritative Edge Function without ever treating client state as truth.
 */

export type TileKind =
  | "corner"
  | "district"
  | "route"
  | "works"
  | "event"
  | "civic"
  | "levy";

export type AssetKind = "district" | "route" | "works";

export interface TileBase {
  id: string;
  index: number;
  name: string;
  kind: TileKind;
}

export interface DistrictTile extends TileBase {
  kind: "district";
  district: string;
  color: string;
  price: number;
  mortgageValue: number;
  buildCost: number;
  /** rent for bare, 1–4 supply kits, then a landmark */
  rents: readonly [number, number, number, number, number, number];
}

export interface RouteTile extends TileBase {
  kind: "route";
  price: number;
  mortgageValue: number;
}

export interface WorksTile extends TileBase {
  kind: "works";
  price: number;
  mortgageValue: number;
}

export interface LevyTile extends TileBase {
  kind: "levy";
  amount: number;
}

export interface CornerTile extends TileBase {
  kind: "corner";
  effect: "start" | "commons" | "detention" | "audit";
}

export type BoardTile =
  | DistrictTile
  | RouteTile
  | WorksTile
  | LevyTile
  | CornerTile
  | (TileBase & { kind: "event" | "civic" });

const district = (
  index: number,
  id: string,
  name: string,
  districtName: string,
  color: string,
  price: number,
  buildCost: number,
): DistrictTile => ({
  index,
  id,
  name,
  kind: "district",
  district: districtName,
  color,
  price,
  mortgageValue: Math.floor(price / 2),
  buildCost,
  rents: [Math.max(8, Math.floor(price / 12)), Math.floor(price * 0.42), Math.floor(price * 1.2), Math.floor(price * 3.3), Math.floor(price * 6.5), Math.floor(price * 9.5)],
});

const route = (index: number, id: string, name: string): RouteTile => ({
  index,
  id,
  name,
  kind: "route",
  price: 200,
  mortgageValue: 100,
});

const works = (index: number, id: string, name: string): WorksTile => ({
  index,
  id,
  name,
  kind: "works",
  price: 150,
  mortgageValue: 75,
});

const levy = (index: number, id: string, name: string, amount: number): LevyTile => ({
  index,
  id,
  name,
  kind: "levy",
  amount,
});

const corner = (index: number, id: string, name: string, effect: CornerTile["effect"]): CornerTile => ({
  index,
  id,
  name,
  kind: "corner",
  effect,
});

export const BOARD: readonly BoardTile[] = [
  corner(0, "harbor_gate", "Harbor Gate", "start"),
  district(1, "mariners_row", "Mariner's Row", "Harbor", "#53b9d1", 60, 50),
  { index: 2, id: "civic_archive", name: "Civic Archive", kind: "civic" },
  district(3, "tidewalk", "Tidewalk", "Harbor", "#53b9d1", 80, 50),
  levy(4, "permit_duty", "Permit Duty", 100),
  route(5, "northline", "Northline Route"),
  district(6, "forge_lane", "Forge Lane", "Foundry", "#a37a55", 100, 50),
  { index: 7, id: "city_signal", name: "City Signal", kind: "event" },
  district(8, "kiln_square", "Kiln Square", "Foundry", "#a37a55", 120, 50),
  district(9, "copper_yard", "Copper Yard", "Foundry", "#a37a55", 140, 50),
  levy(10, "streetlight_assessment", "Streetlight Assessment", 120),
  works(11, "grid_works", "Grid Works"),
  district(12, "skyglass_walk", "Skyglass Walk", "Observatory", "#726ee7", 150, 100),
  corner(13, "commons", "The Commons", "commons"),
  district(14, "aurora_close", "Aurora Close", "Observatory", "#726ee7", 160, 100),
  { index: 15, id: "civic_bulletin", name: "Civic Bulletin", kind: "civic" },
  district(16, "zenith_terrace", "Zenith Terrace", "Observatory", "#726ee7", 180, 100),
  levy(17, "archives_levy", "Archives Levy", 140),
  route(18, "eastline", "Eastline Route"),
  district(19, "lockside", "Lockside", "Canal", "#3477bb", 190, 100),
  { index: 20, id: "market_weather", name: "Market Weather", kind: "event" },
  district(21, "basin_road", "Basin Road", "Canal", "#3477bb", 210, 100),
  district(22, "sluice_market", "Sluice Market", "Canal", "#3477bb", 230, 100),
  levy(23, "waterfront_levy", "Waterfront Levy", 150),
  works(24, "water_works", "Water Works"),
  district(25, "orchard_path", "Orchard Path", "Garden", "#4f9d6a", 240, 150),
  corner(26, "civic_holding", "Civic Holding", "detention"),
  district(27, "moss_court", "Moss Court", "Garden", "#4f9d6a", 260, 150),
  { index: 28, id: "civic_grant", name: "Civic Grant", kind: "civic" },
  district(29, "glasshouse_row", "Glasshouse Row", "Garden", "#4f9d6a", 280, 150),
  district(30, "arcade_lane", "Arcade Lane", "Market", "#db8e38", 290, 150),
  route(31, "southline", "Southline Route"),
  { index: 32, id: "night_shift", name: "Night Shift", kind: "event" },
  district(33, "ledger_street", "Ledger Street", "Market", "#db8e38", 310, 150),
  district(34, "pavilion_avenue", "Pavilion Avenue", "Market", "#db8e38", 330, 150),
  district(35, "ridge_path", "Ridge Path", "Ridge", "#c45f84", 340, 200),
  district(36, "lantern_place", "Lantern Place", "Lantern", "#e5c552", 350, 200),
  district(37, "ridge_overlook", "Ridge Overlook", "Ridge", "#c45f84", 360, 200),
  district(38, "signal_hill", "Signal Hill", "Lantern", "#e5c552", 380, 200),
  corner(39, "audit_office", "Audit Office", "audit"),
  district(40, "lamplight_quay", "Lamplight Quay", "Lantern", "#e5c552", 400, 200),
  district(41, "ridge_circle", "Ridge Circle", "Ridge", "#c45f84", 420, 200),
  district(42, "summit_way", "Summit Way", "Summit", "#c94949", 440, 200),
  district(43, "cloudline_drive", "Cloudline Drive", "Summit", "#c94949", 460, 200),
  route(44, "westline", "Westline Route"),
  district(45, "beacon_heights", "Beacon Heights", "Summit", "#c94949", 480, 200),
  district(46, "crown_lane", "Crown Lane", "Crown", "#76634c", 500, 250),
  district(47, "capitol_green", "Capitol Green", "Capitol", "#4d647b", 520, 250),
  district(48, "crown_square", "Crown Square", "Crown", "#76634c", 540, 250),
  district(49, "council_terrace", "Council Terrace", "Capitol", "#4d647b", 560, 250),
  district(50, "crown_spire", "Crown Spire", "Crown", "#76634c", 580, 250),
  district(51, "assembly_hall", "Assembly Hall", "Capitol", "#4d647b", 600, 250),
] as const;

if (BOARD.length !== 52) throw new Error("Civic Fortune board must have exactly 52 spaces");

export const BOARD_BY_ID = new Map(BOARD.map((tile) => [tile.id, tile]));
export const ASSET_TILES = BOARD.filter((tile): tile is DistrictTile | RouteTile | WorksTile =>
  tile.kind === "district" || tile.kind === "route" || tile.kind === "works"
);
export const DISTRICTS = [...new Set(BOARD.filter((tile): tile is DistrictTile => tile.kind === "district").map((tile) => tile.district))];
export const DETENTION_INDEX = 26;

export function tileAt(position: number): BoardTile {
  return BOARD[((position % BOARD.length) + BOARD.length) % BOARD.length];
}

export function isAsset(tile: BoardTile): tile is DistrictTile | RouteTile | WorksTile {
  return tile.kind === "district" || tile.kind === "route" || tile.kind === "works";
}

export function districtTiles(districtName: string): DistrictTile[] {
  return BOARD.filter((tile): tile is DistrictTile => tile.kind === "district" && tile.district === districtName);
}
