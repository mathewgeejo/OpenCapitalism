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
  rent: [25, 50, 100, 200],
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
 * The 40-space World Tour board.  It is intentionally data driven:
 * rendering, validation and rent calculations all use this one definition.
 */
export const BOARD: readonly Tile[] = Object.freeze([
  { id: "founders-plaza", index: 0, name: "GO", kind: "start", color: "#f8fafc", description: "Collect a civic dividend when you pass." },
  district(1, "cedar-quay", "Egypt", "harbor", "#38bdf8", 60, 50, [4, 20, 60, 180, 320, 500]),
  card(2, "civic-assembly", "civic", "Community", "#818cf8"),
  district(3, "marina-row", "Morocco", "harbor", "#38bdf8", 80, 50, [6, 30, 90, 270, 400, 550]),
  { id: "infrastructure-levy", index: 4, name: "Travel Tax", kind: "levy", color: "#f97316", levy: 120, description: "Contribute 120 credits to infrastructure." },
  transit(5, "north-loop", "North Express"),
  district(6, "brass-lane", "Spain", "copper", "#f59e0b", 100, 50, [8, 40, 100, 300, 450, 600]),
  card(7, "market-event", "event", "Chance", "#ec4899"),
  district(8, "foundry-court", "Portugal", "copper", "#f59e0b", 120, 50, [10, 50, 150, 450, 625, 750]),
  district(9, "ember-square", "Italy", "copper", "#f59e0b", 140, 50, [12, 60, 180, 500, 700, 850]),
  { id: "civic-hold", index: 10, name: "Jail / Visiting", kind: "detention", color: "#64748b", description: "Visit, or wait out a civic hold." },
  district(11, "willow-passage", "India", "willow", "#14b8a6", 160, 100, [14, 70, 210, 490, 630, 770]),
  utility(12, "waterworks", "Water Works", "#06b6d4"),
  district(13, "canal-view", "Sri Lanka", "willow", "#14b8a6", 180, 100, [16, 80, 240, 560, 720, 880]),
  district(14, "heron-walk", "Nepal", "willow", "#14b8a6", 200, 100, [18, 90, 270, 630, 810, 990]),
  transit(15, "east-spur", "East Express"),
  district(16, "market-street", "Thailand", "market", "#a855f7", 220, 150, [20, 100, 300, 700, 900, 1100]),
  card(17, "civic-grant", "civic", "Community", "#818cf8"),
  district(18, "guild-alley", "Vietnam", "market", "#a855f7", 240, 150, [22, 110, 330, 770, 990, 1210]),
  district(19, "traders-close", "Indonesia", "market", "#a855f7", 260, 150, [24, 120, 360, 840, 1080, 1320]),
  { id: "commons-festival", index: 20, name: "Free Parking", kind: "festival", color: "#facc15", description: "Take a breather at the city commons." },
  district(21, "indigo-pier", "Sweden", "indigo", "#6366f1", 260, 150, [24, 120, 360, 840, 1080, 1320]),
  card(22, "night-event", "event", "Chance", "#ec4899"),
  district(23, "observatory-way", "Norway", "indigo", "#6366f1", 280, 150, [26, 130, 390, 910, 1170, 1430]),
  district(24, "meridian-avenue", "Finland", "indigo", "#6366f1", 300, 150, [28, 140, 420, 980, 1260, 1540]),
  transit(25, "south-express", "South Express"),
  district(26, "gallery-row", "France", "rose", "#f43f5e", 300, 150, [28, 140, 420, 980, 1260, 1540]),
  district(27, "theatre-district", "Germany", "rose", "#f43f5e", 320, 200, [30, 150, 450, 1050, 1350, 1650]),
  utility(28, "gridworks", "Power Station", "#eab308"),
  district(29, "lantern-hill", "Netherlands", "rose", "#f43f5e", 340, 200, [32, 160, 480, 1120, 1440, 1760]),
  { id: "return-to-hold", index: 30, name: "Go to Jail", kind: "goToDetention", color: "#64748b", description: "Proceed directly to Civic Hold." },
  district(31, "summit-terrace", "Australia", "summit", "#0ea5e9", 320, 200, [30, 150, 450, 1050, 1350, 1650]),
  district(32, "atlas-square", "New Zealand", "summit", "#0ea5e9", 340, 200, [32, 160, 480, 1120, 1440, 1760]),
  card(33, "civic-forum", "civic", "Community", "#818cf8"),
  district(34, "skyline-drive", "Japan", "summit", "#0ea5e9", 360, 200, [34, 170, 510, 1190, 1530, 1870]),
  transit(35, "west-connector", "West Express"),
  card(36, "festival-event", "event", "Chance", "#ec4899"),
  district(37, "aurora-arch", "United Kingdom", "crown", "#e879f9", 380, 200, [36, 180, 540, 1260, 1620, 1980]),
  { id: "public-works-levy", index: 38, name: "Luxury Tax", kind: "levy", color: "#f97316", levy: 180, description: "Contribute 180 credits to public works." },
  district(39, "prosperity-point", "United States", "crown", "#e879f9", 400, 200, [38, 190, 570, 1330, 1710, 2090]),
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
