import type { OwnableTileKind, Tile, TileId } from "./types";

const district = (
  index: number,
  id: string,
  name: string,
  group: string,
  color: string,
  price: number,
  buildCost: number,
  rent: readonly number[],
): Tile => ({
  index,
  id,
  name,
  kind: "district",
  group,
  color,
  price,
  buildCost,
  rent,
  description: `A ${group.replace(/-/g, " ")} district parcel.`,
});

const transit = (index: number, id: string, name: string): Tile => ({
  index,
  id,
  name,
  kind: "transit",
  color: "#334155",
  price: 220,
  rent: [30, 60, 120, 240],
  description: "A civic transit route. Rent rises as routes are connected.",
});

const utility = (index: number, id: string, name: string, color: string): Tile => ({
  index,
  id,
  name,
  kind: "utility",
  color,
  price: 180,
  rent: [4, 10],
  description: "A municipal works contract; rent is based on the dice total.",
});

const card = (index: number, id: string, kind: "event" | "civic", name: string, color: string): Tile => ({
  index,
  id,
  name,
  kind,
  color,
  description: kind === "event" ? "Draw an Event card." : "Draw a Civic card.",
});

/**
 * The original 52-space Civic Fortune board.  It is intentionally data driven:
 * rendering, validation and rent calculations all use this one definition.
 */
export const BOARD: readonly Tile[] = Object.freeze([
  { id: "founders-plaza", index: 0, name: "Founders' Plaza", kind: "start", color: "#f8fafc", description: "Collect a civic dividend when you pass." },
  district(1, "cedar-quay", "Cedar Quay", "harbor", "#38bdf8", 60, 50, [4, 20, 60, 180, 320, 500]),
  card(2, "civic-assembly", "civic", "Civic Assembly", "#818cf8"),
  district(3, "marina-row", "Marina Row", "harbor", "#38bdf8", 80, 50, [6, 30, 90, 270, 400, 550]),
  { id: "infrastructure-levy", index: 4, name: "Infrastructure Levy", kind: "levy", color: "#f97316", levy: 120, description: "Contribute 120 credits to infrastructure." },
  district(5, "brass-lane", "Brass Lane", "copper", "#f59e0b", 100, 50, [8, 40, 100, 300, 450, 600]),
  transit(6, "north-loop", "North Loop"),
  district(7, "foundry-court", "Foundry Court", "copper", "#f59e0b", 120, 50, [10, 50, 150, 450, 625, 750]),
  card(8, "market-event", "event", "Market Event", "#ec4899"),
  district(9, "ember-square", "Ember Square", "copper", "#f59e0b", 140, 50, [12, 60, 180, 500, 700, 850]),
  district(10, "orchard-gate", "Orchard Gate", "orchard", "#22c55e", 160, 100, [14, 70, 200, 550, 750, 900]),
  utility(11, "waterworks", "Waterworks", "#06b6d4"),
  district(12, "grove-terrace", "Grove Terrace", "orchard", "#22c55e", 180, 100, [16, 80, 220, 600, 800, 950]),
  { id: "civic-hold", index: 13, name: "Civic Hold", kind: "detention", color: "#64748b", description: "Visit, or wait out a civic hold." },
  district(14, "appleton-rise", "Appleton Rise", "orchard", "#22c55e", 200, 100, [18, 90, 250, 700, 875, 1050]),
  card(15, "civic-grant", "civic", "Civic Grant", "#818cf8"),
  district(16, "willow-passage", "Willow Passage", "willow", "#14b8a6", 220, 100, [20, 100, 300, 750, 925, 1100]),
  district(17, "canal-view", "Canal View", "willow", "#14b8a6", 240, 100, [22, 110, 330, 800, 975, 1150]),
  transit(18, "east-spur", "East Spur"),
  district(19, "heron-walk", "Heron Walk", "willow", "#14b8a6", 260, 100, [24, 120, 360, 850, 1025, 1200]),
  card(20, "harbor-event", "event", "Harbor Event", "#ec4899"),
  district(21, "market-street", "Market Street", "market", "#a855f7", 280, 150, [26, 130, 390, 900, 1100, 1275]),
  district(22, "guild-alley", "Guild Alley", "market", "#a855f7", 300, 150, [28, 150, 450, 1000, 1200, 1400]),
  utility(23, "gridworks", "Gridworks", "#eab308"),
  district(24, "traders-close", "Traders' Close", "market", "#a855f7", 320, 150, [30, 170, 500, 1100, 1300, 1500]),
  district(25, "ledger-lane", "Ledger Lane", "market", "#a855f7", 340, 150, [32, 190, 550, 1200, 1400, 1600]),
  { id: "commons-festival", index: 26, name: "Commons Festival", kind: "festival", color: "#facc15", description: "Take a breather at the city commons." },
  district(27, "indigo-pier", "Indigo Pier", "indigo", "#6366f1", 360, 150, [34, 200, 600, 1300, 1500, 1750]),
  district(28, "observatory-way", "Observatory Way", "indigo", "#6366f1", 380, 150, [36, 220, 660, 1400, 1650, 1900]),
  card(29, "night-event", "event", "Night Market Event", "#ec4899"),
  district(30, "meridian-avenue", "Meridian Avenue", "indigo", "#6366f1", 400, 150, [38, 240, 720, 1500, 1750, 2000]),
  transit(31, "south-express", "South Express"),
  district(32, "rosewood-place", "Rosewood Place", "rose", "#f43f5e", 420, 200, [40, 260, 780, 1600, 1850, 2150]),
  card(33, "civic-forum", "civic", "Civic Forum", "#818cf8"),
  district(34, "gallery-row", "Gallery Row", "rose", "#f43f5e", 440, 200, [42, 280, 840, 1700, 1950, 2250]),
  district(35, "theatre-district", "Theatre District", "rose", "#f43f5e", 460, 200, [44, 300, 900, 1800, 2050, 2400]),
  district(36, "lantern-hill", "Lantern Hill", "rose", "#f43f5e", 480, 200, [46, 320, 960, 1900, 2150, 2550]),
  { id: "public-works-levy", index: 37, name: "Public Works Levy", kind: "levy", color: "#f97316", levy: 180, description: "Contribute 180 credits to public works." },
  district(38, "summit-terrace", "Summit Terrace", "summit", "#0ea5e9", 500, 200, [48, 340, 1020, 2000, 2250, 2700]),
  { id: "return-to-hold", index: 39, name: "Return to Civic Hold", kind: "goToDetention", color: "#64748b", description: "Proceed directly to Civic Hold." },
  district(40, "atlas-square", "Atlas Square", "summit", "#0ea5e9", 520, 200, [50, 360, 1080, 2100, 2350, 2850]),
  transit(41, "west-connector", "West Connector"),
  district(42, "skyline-drive", "Skyline Drive", "summit", "#0ea5e9", 540, 200, [52, 380, 1140, 2200, 2450, 3000]),
  card(43, "civic-endowment", "civic", "Civic Endowment", "#818cf8"),
  district(44, "crown-vista", "Crown Vista", "summit", "#0ea5e9", 560, 200, [54, 400, 1200, 2300, 2550, 3150]),
  card(45, "festival-event", "event", "Festival Event", "#ec4899"),
  district(46, "aurora-arch", "Aurora Arch", "crown", "#e879f9", 580, 250, [56, 420, 1260, 2400, 2650, 3300]),
  district(47, "founders-heights", "Founders' Heights", "crown", "#e879f9", 600, 250, [58, 440, 1320, 2500, 2750, 3450]),
  district(48, "solstice-row", "Solstice Row", "crown", "#e879f9", 620, 250, [60, 460, 1380, 2600, 2850, 3600]),
  district(49, "garden-crescent", "Garden Crescent", "crown", "#e879f9", 640, 250, [62, 480, 1440, 2700, 2950, 3750]),
  district(50, "citadel-way", "Citadel Way", "crown", "#e879f9", 660, 250, [64, 500, 1500, 2800, 3050, 3900]),
  district(51, "prosperity-point", "Prosperity Point", "crown", "#e879f9", 700, 250, [68, 540, 1620, 3000, 3300, 4200]),
]);

export const BOARD_SIZE = BOARD.length;

export const BOARD_BY_ID: Readonly<Record<TileId, Tile>> = Object.freeze(
  Object.fromEntries(BOARD.map((tile) => [tile.id, tile])) as Record<TileId, Tile>,
);

export const OWNABLE_KINDS: readonly OwnableTileKind[] = Object.freeze([
  "district",
  "transit",
  "utility",
]);

export const isOwnableTile = (tile: Tile): tile is Tile & { kind: OwnableTileKind; price: number } =>
  OWNABLE_KINDS.includes(tile.kind as OwnableTileKind) && typeof tile.price === "number";

export const isDistrictTile = (tile: Tile): tile is Tile & { kind: "district"; group: string; buildCost: number; price: number } =>
  tile.kind === "district" && typeof tile.group === "string" && typeof tile.buildCost === "number" && typeof tile.price === "number";

export const getTileById = (tileId: TileId): Tile | undefined => BOARD_BY_ID[tileId];

export const getTileAt = (position: number): Tile => BOARD[((position % BOARD_SIZE) + BOARD_SIZE) % BOARD_SIZE];

export const getGroupTiles = (group: string): Tile[] => BOARD.filter((tile) => tile.kind === "district" && tile.group === group);

export const getOwnableTiles = (): Tile[] => BOARD.filter(isOwnableTile);
