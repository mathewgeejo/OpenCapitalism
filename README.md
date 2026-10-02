# OpenCapitalism

A multiplayer property game with a lightweight, isometric city table.

## Local development

- `npm install`
- `npm run dev`
- `npm test` runs the game engine and remote-state adapter tests.
- `npx tsc --noEmit -p tsconfig.app.json` checks frontend types without a build.

The default route opens an interactive practice table with three automated opponents. Use **Leave** to access account and lobby screens, or open `?signin` directly. Remote rooms use the existing Supabase integration; see [backend setup](supabase/README.md).

## Table interface

- A 40-space country board (11 spaces per edge including corners). Every space has its own keyboard-accessible selection target.
- The board uses SVG orthographic projection for solid buildings with windows and roofs, country flags, trains, cars, and Ferris wheels. There are no cast shadows or UI shadows, with no continuous rendering loop or external image assets.
- The camera has a fixed angle and center. Scroll or pinch to zoom; Fit board restores the full-board framing. The space picker also exposes every property on small screens.
- Rolling 3D dice and the authoritative turn number sit in the center. Dice settle before numbered pawns walk around the board. Controls wait for movement to finish.
- Country labels, movement lanes, buildings, and the dice area have reserved space. Only actual development produces country buildings.
- Chance and Community cards explain their effects in an accessible dialog. Local opponents wait until the card is dismissed.
- Roll, purchase, auction, trade, and manage properties through the existing game engine.
- Rules shows the current table settings. In practice, starting balance, passing-Start bonus, turn timer, and jackpot can be changed by restarting the practice table.
- Reduced-motion support follows the device preference and can be toggled in Rules.

The practice table starts with example ownership and development. Economy balance, production multiplayer load, and performance on physical low-end devices still require dedicated validation. Browser viewport checks are not a substitute for hardware testing.

World Tour uses a new 40-space layout on both client and server. Deploy the updated Supabase functions together with the frontend and create new rooms; legacy 52-space rooms are rejected rather than reinterpreted with different destinations.
