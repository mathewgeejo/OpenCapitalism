import { BOARD_BY_ID } from "./board";
import type { TileId } from "./types";

/**
 * Display-only place-name packs. Game state continues to use the stable board
 * ids, so changing a pack never affects ownership, saves, movement, or rules.
 */
export type PlaceSetId = "civic" | "india" | "united-kingdom" | "united-states";

export interface PlaceSetMeta {
  id: PlaceSetId;
  label: string;
  shortLabel: string;
  locale: string;
  description: string;
  accent: string;
}

export interface PlaceSet extends PlaceSetMeta {
  /** A complete display-name mapping for the 52 stable Civic Fortune tile ids. */
  names: Readonly<Record<string, string>>;
}

const civicNames = {
  "founders-plaza": "Founders' Plaza",
  "cedar-quay": "Cedar Quay",
  "civic-assembly": "Civic Assembly",
  "marina-row": "Marina Row",
  "infrastructure-levy": "Infrastructure Levy",
  "brass-lane": "Brass Lane",
  "north-loop": "North Loop",
  "foundry-court": "Foundry Court",
  "market-event": "Market Event",
  "ember-square": "Ember Square",
  "orchard-gate": "Orchard Gate",
  waterworks: "Waterworks",
  "grove-terrace": "Grove Terrace",
  "civic-hold": "Civic Hold",
  "appleton-rise": "Appleton Rise",
  "civic-grant": "Civic Grant",
  "willow-passage": "Willow Passage",
  "canal-view": "Canal View",
  "east-spur": "East Spur",
  "heron-walk": "Heron Walk",
  "harbor-event": "Harbor Event",
  "market-street": "Market Street",
  "guild-alley": "Guild Alley",
  gridworks: "Gridworks",
  "traders-close": "Traders' Close",
  "ledger-lane": "Ledger Lane",
  "commons-festival": "Commons Festival",
  "indigo-pier": "Indigo Pier",
  "observatory-way": "Observatory Way",
  "night-event": "Night Market Event",
  "meridian-avenue": "Meridian Avenue",
  "south-express": "South Express",
  "rosewood-place": "Rosewood Place",
  "civic-forum": "Civic Forum",
  "gallery-row": "Gallery Row",
  "theatre-district": "Theatre District",
  "lantern-hill": "Lantern Hill",
  "public-works-levy": "Public Works Levy",
  "summit-terrace": "Summit Terrace",
  "return-to-hold": "Return to Civic Hold",
  "atlas-square": "Atlas Square",
  "west-connector": "West Connector",
  "skyline-drive": "Skyline Drive",
  "civic-endowment": "Civic Endowment",
  "crown-vista": "Crown Vista",
  "festival-event": "Festival Event",
  "aurora-arch": "Aurora Arch",
  "founders-heights": "Founders' Heights",
  "solstice-row": "Solstice Row",
  "garden-crescent": "Garden Crescent",
  "citadel-way": "Citadel Way",
  "prosperity-point": "Prosperity Point",
} as const;

const indiaNames = {
  "founders-plaza": "Nayi Disha Chowk",
  "cedar-quay": "Cedar Ghat",
  "civic-assembly": "Nagar Sabha",
  "marina-row": "Marina Bazaar",
  "infrastructure-levy": "Nagar Nirmaan Levy",
  "brass-lane": "Peetal Marg",
  "north-loop": "Uttar Metro Loop",
  "foundry-court": "Karigar Chowk",
  "market-event": "Bazaar Event",
  "ember-square": "Angaar Square",
  "orchard-gate": "Bagh Darwaza",
  waterworks: "Jal Works",
  "grove-terrace": "Amrai Terrace",
  "civic-hold": "Nagar Hold",
  "appleton-rise": "Seb Udaan",
  "civic-grant": "Jan Seva Grant",
  "willow-passage": "Bans Path",
  "canal-view": "Nahar Vista",
  "east-spur": "Purab Metro Spur",
  "heron-walk": "Bagula Walk",
  "harbor-event": "Bandar Event",
  "market-street": "Vyapar Marg",
  "guild-alley": "Karigar Gali",
  gridworks: "Bijli Grid",
  "traders-close": "Saudagar Close",
  "ledger-lane": "Hisaab Lane",
  "commons-festival": "Maidan Utsav",
  "indigo-pier": "Neel Ghat",
  "observatory-way": "Vedhshala Way",
  "night-event": "Raat Bazaar Event",
  "meridian-avenue": "Madhya Rekha Avenue",
  "south-express": "Dakshin Express",
  "rosewood-place": "Gulabwood Place",
  "civic-forum": "Nagar Forum",
  "gallery-row": "Kala Gallery Row",
  "theatre-district": "Rangmanch District",
  "lantern-hill": "Diya Hill",
  "public-works-levy": "Lok Works Levy",
  "summit-terrace": "Shikhar Terrace",
  "return-to-hold": "Return to Nagar Hold",
  "atlas-square": "Disha Square",
  "west-connector": "Pashchim Connector",
  "skyline-drive": "Aasmaan Drive",
  "civic-endowment": "Nagar Endowment",
  "crown-vista": "Mukut Vista",
  "festival-event": "Rang Utsav Event",
  "aurora-arch": "Usha Arch",
  "founders-heights": "Nayi Disha Heights",
  "solstice-row": "Ayan Row",
  "garden-crescent": "Bagh Crescent",
  "citadel-way": "Qila Way",
  "prosperity-point": "Samriddhi Point",
} as const;

const unitedKingdomNames = {
  "founders-plaza": "Charter Square",
  "cedar-quay": "Cedar Quay",
  "civic-assembly": "Town Assembly",
  "marina-row": "Marina Row",
  "infrastructure-levy": "Civic Works Levy",
  "brass-lane": "Brass Lane",
  "north-loop": "Northern Loop",
  "foundry-court": "Foundry Court",
  "market-event": "Market Day Event",
  "ember-square": "Ember Square",
  "orchard-gate": "Orchard Gate",
  waterworks: "Water Board",
  "grove-terrace": "Grove Terrace",
  "civic-hold": "Civic Hold",
  "appleton-rise": "Appleton Rise",
  "civic-grant": "Community Grant",
  "willow-passage": "Willow Passage",
  "canal-view": "Canal View",
  "east-spur": "Eastern Spur",
  "heron-walk": "Heron Walk",
  "harbor-event": "Harbour Event",
  "market-street": "Market Street",
  "guild-alley": "Guild Alley",
  gridworks: "National Grid Works",
  "traders-close": "Traders' Close",
  "ledger-lane": "Ledger Lane",
  "commons-festival": "Village Green Fete",
  "indigo-pier": "Indigo Pier",
  "observatory-way": "Observatory Way",
  "night-event": "Twilight Market Event",
  "meridian-avenue": "Meridian Avenue",
  "south-express": "Southern Express",
  "rosewood-place": "Rosewood Place",
  "civic-forum": "Civic Forum",
  "gallery-row": "Gallery Row",
  "theatre-district": "Playhouse Quarter",
  "lantern-hill": "Lantern Hill",
  "public-works-levy": "Public Works Levy",
  "summit-terrace": "Summit Terrace",
  "return-to-hold": "Return to Civic Hold",
  "atlas-square": "Atlas Square",
  "west-connector": "Western Connector",
  "skyline-drive": "Skyline Drive",
  "civic-endowment": "Civic Endowment",
  "crown-vista": "Crown Vista",
  "festival-event": "Summer Fete Event",
  "aurora-arch": "Aurora Arch",
  "founders-heights": "Charter Heights",
  "solstice-row": "Solstice Row",
  "garden-crescent": "Garden Crescent",
  "citadel-way": "Citadel Way",
  "prosperity-point": "Prosperity Point",
} as const;

const unitedStatesNames = {
  "founders-plaza": "Liberty Plaza",
  "cedar-quay": "Cedar Landing",
  "civic-assembly": "City Hall Assembly",
  "marina-row": "Marina Row",
  "infrastructure-levy": "Infrastructure Assessment",
  "brass-lane": "Brass Avenue",
  "north-loop": "North Line",
  "foundry-court": "Foundry Court",
  "market-event": "Market Event",
  "ember-square": "Ember Square",
  "orchard-gate": "Orchard Gate",
  waterworks: "City Waterworks",
  "grove-terrace": "Grove Terrace",
  "civic-hold": "Civic Hold",
  "appleton-rise": "Appleton Rise",
  "civic-grant": "Community Grant",
  "willow-passage": "Willow Passage",
  "canal-view": "Canal View",
  "east-spur": "East Line Spur",
  "heron-walk": "Heron Walk",
  "harbor-event": "Harbor Event",
  "market-street": "Market Street",
  "guild-alley": "Guild Alley",
  gridworks: "Power Grid Works",
  "traders-close": "Traders' Court",
  "ledger-lane": "Ledger Lane",
  "commons-festival": "Commons Festival",
  "indigo-pier": "Indigo Landing",
  "observatory-way": "Observatory Way",
  "night-event": "Night Market Event",
  "meridian-avenue": "Meridian Avenue",
  "south-express": "South Expressway",
  "rosewood-place": "Rosewood Place",
  "civic-forum": "Civic Forum",
  "gallery-row": "Gallery Row",
  "theatre-district": "Theater District",
  "lantern-hill": "Lantern Hill",
  "public-works-levy": "Public Works Assessment",
  "summit-terrace": "Summit Terrace",
  "return-to-hold": "Return to Civic Hold",
  "atlas-square": "Atlas Square",
  "west-connector": "West Connector",
  "skyline-drive": "Skyline Drive",
  "civic-endowment": "Civic Endowment",
  "crown-vista": "Crown Vista",
  "festival-event": "Block Party Event",
  "aurora-arch": "Aurora Arch",
  "founders-heights": "Liberty Heights",
  "solstice-row": "Solstice Row",
  "garden-crescent": "Garden Crescent",
  "citadel-way": "Citadel Way",
  "prosperity-point": "Prosperity Point",
} as const;

const placeSets: readonly PlaceSet[] = [
  {
    id: "civic",
    label: "Civic Fortune",
    shortLabel: "Civic",
    locale: "Original setting",
    description: "The default miniature-capital map.",
    accent: "#7dd3fc",
    names: civicNames,
  },
  {
    id: "india",
    label: "India-inspired",
    shortLabel: "India",
    locale: "India-inspired setting",
    description: "Plazas, bazaars, ghats, and metro routes in an original setting.",
    accent: "#fb923c",
    names: indiaNames,
  },
  {
    id: "united-kingdom",
    label: "United Kingdom-inspired",
    shortLabel: "UK",
    locale: "United Kingdom-inspired setting",
    description: "Quays, commons, lanes, and rail routes in an original setting.",
    accent: "#818cf8",
    names: unitedKingdomNames,
  },
  {
    id: "united-states",
    label: "United States-inspired",
    shortLabel: "US",
    locale: "United States-inspired setting",
    description: "Plazas, avenues, landings, and light rail in an original setting.",
    accent: "#34d399",
    names: unitedStatesNames,
  },
] as const;

/** Metadata and complete name maps suitable for a room/lobby theme picker. */
export const PLACE_SETS: readonly PlaceSet[] = Object.freeze(placeSets);
export const DEFAULT_PLACE_SET_ID: PlaceSetId = "civic";

export const isPlaceSetId = (value: string | null | undefined): value is PlaceSetId =>
  PLACE_SETS.some((set) => set.id === value);

/** Returns the requested pack, falling back to the default for stale saved ids. */
export const getPlaceSet = (id: string | null | undefined = DEFAULT_PLACE_SET_ID): PlaceSet =>
  PLACE_SETS.find((set) => set.id === id) ?? PLACE_SETS[0];

/**
 * Resolve a safe display label. Unknown ids deliberately fall back to the
 * canonical board label so old replays and future board additions stay legible.
 */
export const getTileDisplayName = (
  tileId: TileId,
  placeSetId: string | null | undefined = DEFAULT_PLACE_SET_ID,
): string => getPlaceSet(placeSetId).names[tileId] ?? BOARD_BY_ID[tileId]?.name ?? tileId;

/** Alias for UI components that already have a resolved PlaceSet object. */
export const getTileDisplayNameFromSet = (tileId: TileId, placeSet: PlaceSet): string =>
  placeSet.names[tileId] ?? BOARD_BY_ID[tileId]?.name ?? tileId;

