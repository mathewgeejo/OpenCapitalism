import type { Card, CardDeckState } from "./types";

/**
 * These are original Civic Fortune cards.  Deck order is intentionally kept in
 * server-only game state; `toPublicGameState` exposes counts only.
 */
export const EVENT_CARDS: readonly Card[] = Object.freeze([
  {
    id: "event-market-surge",
    deck: "event",
    title: "Market Surge",
    text: "Your pop-up market draws a crowd. Collect 150 credits.",
    effect: { type: "cash", amount: 150 },
  },
  {
    id: "event-street-repairs",
    deck: "event",
    title: "Street Repairs",
    text: "Contribute 40 credits per house and 115 per tower.",
    effect: { type: "repair", perHouse: 40, perTower: 115 },
  },
  {
    id: "event-river-detour",
    deck: "event",
    title: "River Detour",
    text: "A bridge closure sends you back three spaces.",
    effect: { type: "moveRelative", spaces: -3 },
  },
  {
    id: "event-city-inspection",
    deck: "event",
    title: "City Inspection",
    text: "Report to Civic Hold.",
    effect: { type: "detention" },
  },
  {
    id: "event-founders-parade",
    deck: "event",
    title: "Founders' Parade",
    text: "Advance to Founders' Plaza and collect the civic dividend.",
    effect: { type: "moveTo", tileIndex: 0 },
  },
  {
    id: "event-grant-match",
    deck: "event",
    title: "Grant Match",
    text: "Your neighbourhood grant is matched. Collect 100 credits.",
    effect: { type: "cash", amount: 100 },
  },
]);

export const CIVIC_CARDS: readonly Card[] = Object.freeze([
  {
    id: "civic-release-pass",
    deck: "civic",
    title: "Civic Release Pass",
    text: "Keep this pass; it releases you from Civic Hold.",
    effect: { type: "detentionPass" },
  },
  {
    id: "civic-dividend",
    deck: "civic",
    title: "Community Dividend",
    text: "The co-op returns a dividend. Collect 75 credits.",
    effect: { type: "cash", amount: 75 },
  },
  {
    id: "civic-park-stewardship",
    deck: "civic",
    title: "Park Stewardship",
    text: "Fund a local park. Pay 60 credits.",
    effect: { type: "cash", amount: -60 },
  },
  {
    id: "civic-commons-visit",
    deck: "civic",
    title: "Commons Visit",
    text: "Advance to the Commons Festival.",
    effect: { type: "moveTo", tileIndex: 26 },
  },
  {
    id: "civic-neighbourhood-fund",
    deck: "civic",
    title: "Neighbourhood Fund",
    text: "Every active resident contributes 25 credits to your project.",
    effect: { type: "collectFromEach", amount: 25 },
  },
  {
    id: "civic-hearing",
    deck: "civic",
    title: "Civic Hearing",
    text: "Attend a hearing at Civic Hold.",
    effect: { type: "detention" },
  },
]);

export const createDecks = (): CardDeckState => ({
  event: EVENT_CARDS.map((card) => ({ ...card })),
  civic: CIVIC_CARDS.map((card) => ({ ...card })),
});
