import { memo, useCallback, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import type { GameState, PublicGameState } from '../../game/types';
import { BOARD, BOARD_SIZE as GAME_BOARD_SIZE } from '../../game/board';

type UnknownRecord = Record<string, unknown>;
type BoardGameState = GameState | PublicGameState;

type VisualPlayer = {
  id: string;
  name: string;
  cash: number;
  position: number;
  color: string;
  isBankrupt: boolean;
  propertyIds: string[];
};

type VisualSpace = {
  id: string;
  index: number;
  label: string;
  kind: string;
  color?: string;
  price?: number;
};

type VisualSlot = {
  /** Index in the intentionally compact, rendered board ring. */
  index: number;
  /** One or two real game spaces represented by this display tile. */
  spaces: VisualSpace[];
};

type PropertyVisualState = {
  ownerId?: string;
  buildings: number;
  mortgaged: boolean;
};

type BoardTableProps = {
  spaces: VisualSlot[];
  players: VisualPlayer[];
  properties: Map<string, PropertyVisualState>;
  selectedSpaceId: string | null;
  activeId?: string;
  onSelectSpace: (spaceId: string) => void;
  reducedMotion: boolean;
};

export interface Board3DProps {
  /** The public authoritative snapshot. No hidden deck or server state is read. */
  game: BoardGameState;
  /** Controls the selected-tile glow; Board3D can also manage it internally. */
  selectedSpaceId?: string | null;
  /** Called whenever a player chooses a board tile. */
  onSelectSpace?: (spaceId: string) => void;
  /** Stops non-essential visual motion. */
  reducedMotion?: boolean;
  /** Optional inline container styles, for placement in a room shell. */
  style?: CSSProperties;
}

/**
 * The game still has its original 52 authoritative spaces.  The visual board
 * deliberately renders eleven positions per side (including both corners),
 * so players get forty large, readable tile slots rather than 52 tiny ones.
 */
const VISUAL_EDGE_SPACES = 11;
const VISUAL_EDGE_STEPS = VISUAL_EDGE_SPACES - 1;
const VISUAL_RING_SPACES = VISUAL_EDGE_STEPS * 4;
const LOGICAL_EDGE_STEPS = GAME_BOARD_SIZE / 4;
const LOGICAL_INTERIOR_PER_EDGE = LOGICAL_EDGE_STEPS - 1;
const VISUAL_INTERIOR_PER_EDGE = VISUAL_EDGE_SPACES - 2;
const DEFAULT_ZOOM = 0.92;
const MIN_ZOOM = 0.78;
const MAX_ZOOM = 1.08;

const PLAYER_COLORS = [
  '#ff6b65', '#4cc9f0', '#ffd166', '#80ed99', '#c77dff', '#f9844a', '#5eead4', '#fb7185', '#a3e635', '#60a5fa',
  '#f9a8d4', '#facc15', '#67e8f9', '#c4b5fd', '#fdba74', '#86efac', '#fda4af', '#93c5fd', '#d8b4fe', '#bef264',
];

const SPACE_COLORS: Record<string, string> = {
  district: '#60c7d9', property: '#60c7d9', parcel: '#60c7d9', transit: '#4cbcae', route: '#4cbcae',
  works: '#59a8e7', utility: '#59a8e7', event: '#ef7098', civic: '#8d79ea', levy: '#f19055',
  tax: '#f19055', corner: '#55c884', start: '#55c884', detention: '#7c8da4', festival: '#f5c955',
  rest: '#f5c955', jackpot: '#f5a54e', gotodetention: '#7c8da4',
};

function clampZoom(zoom: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

function asRecord(value: unknown): UnknownRecord | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function booleanValue(value: unknown): boolean {
  return value === true;
}

function recordValues(value: unknown): UnknownRecord[] {
  if (Array.isArray(value)) return value.map(asRecord).filter((item): item is UnknownRecord => Boolean(item));
  const record = asRecord(value);
  return record
    ? Object.entries(record).map(([id, item]) => ({ id, ...(asRecord(item) ?? {}) }))
    : [];
}

function normaliseBoard(): VisualSpace[] {
  const source = BOARD as unknown;
  const sourceRecord = asRecord(source);
  const rawSpaces = Array.isArray(source)
    ? source
    : asArray(sourceRecord?.spaces ?? sourceRecord?.tiles ?? sourceRecord?.board);

  return rawSpaces.slice(0, GAME_BOARD_SIZE).map((value, position) => {
    const space = asRecord(value) ?? {};
    return {
      id: stringValue(space.id ?? space.spaceId ?? space.key, `space-${position}`),
      index: numberValue(space.index ?? space.position, position),
      label: stringValue(space.name ?? space.label ?? space.title, `District ${position + 1}`),
      kind: stringValue(space.kind ?? space.type ?? space.category, 'district').toLowerCase(),
      color: typeof space.color === 'string' ? space.color : undefined,
      price: typeof space.price === 'number' ? space.price : undefined,
    };
  });
}

function normalisePlayers(game: BoardGameState): VisualPlayer[] {
  const snapshot = asRecord(game) ?? {};
  const rawPlayers = recordValues(snapshot.players ?? snapshot.members ?? snapshot.gameMembers);

  return rawPlayers.map((player, index) => ({
    id: stringValue(player.id ?? player.playerId ?? player.userId, `player-${index}`),
    name: stringValue(player.displayName ?? player.name ?? player.username, `Player ${index + 1}`),
    cash: numberValue(player.cash ?? player.money ?? player.balance),
    position: Math.max(0, numberValue(player.position ?? player.boardPosition ?? player.location)),
    color: stringValue(player.color, PLAYER_COLORS[index % PLAYER_COLORS.length]),
    isBankrupt: booleanValue(player.isBankrupt ?? player.bankrupt ?? player.eliminated) || player.status === 'bankrupt',
    propertyIds: asArray(player.propertyIds ?? player.ownedPropertyIds ?? player.properties).map((id) => String(id)),
  }));
}

function normaliseProperties(game: BoardGameState, players: VisualPlayer[]): Map<string, PropertyVisualState> {
  const snapshot = asRecord(game) ?? {};
  const result = new Map<string, PropertyVisualState>();
  const sources = [snapshot.properties, snapshot.propertyStates, snapshot.assets, snapshot.ownership];

  for (const source of sources) {
    const record = asRecord(source);
    if (!record) continue;
    for (const [key, rawValue] of Object.entries(record)) {
      if (typeof rawValue === 'string') {
        result.set(key, { ownerId: rawValue, buildings: 0, mortgaged: false });
        continue;
      }
      const value = asRecord(rawValue);
      if (!value) continue;
      result.set(key, {
        ownerId: stringValue(value.ownerId ?? value.owner ?? value.playerId) || undefined,
        buildings: Math.max(0, Math.min(5, numberValue(value.buildings ?? value.houses ?? value.development ?? value.level))),
        mortgaged: booleanValue(value.mortgaged ?? value.isMortgaged),
      });
    }
  }

  for (const player of players) {
    for (const propertyId of player.propertyIds) {
      const existing = result.get(propertyId);
      result.set(propertyId, { ownerId: player.id, buildings: existing?.buildings ?? 0, mortgaged: existing?.mortgaged ?? false });
    }
  }

  return result;
}

function activePlayerId(game: BoardGameState): string | undefined {
  const snapshot = asRecord(game) ?? {};
  const turn = asRecord(snapshot.turn);
  return stringValue(snapshot.activePlayerId ?? snapshot.currentPlayerId ?? turn?.playerId) || undefined;
}

function normaliseIndex(index: number): number {
  return ((index % GAME_BOARD_SIZE) + GAME_BOARD_SIZE) % GAME_BOARD_SIZE;
}

/**
 * Maps each of the thirteen logical positions on a directional edge to ten
 * visual ring slots. The corner remains exact and the three smallest groups
 * are merged into neighbouring visual tiles. Every logical position has one
 * stable display slot, so pawns, ownership and selection remain visible.
 */
function visualIndexForLogicalIndex(index: number): number {
  const logicalIndex = normaliseIndex(index);
  const side = Math.floor(logicalIndex / LOGICAL_EDGE_STEPS);
  const positionOnSide = logicalIndex % LOGICAL_EDGE_STEPS;

  if (positionOnSide === 0) return side * VISUAL_EDGE_STEPS;

  const compactPosition = Math.ceil(positionOnSide * VISUAL_INTERIOR_PER_EDGE / LOGICAL_INTERIOR_PER_EDGE);
  return side * VISUAL_EDGE_STEPS + compactPosition;
}

function visualSlots(spaces: VisualSpace[]): VisualSlot[] {
  const slots = Array.from({ length: VISUAL_RING_SPACES }, (_, index): VisualSlot => ({ index, spaces: [] }));

  for (const space of spaces) {
    slots[visualIndexForLogicalIndex(space.index)].spaces.push(space);
  }

  return slots;
}

function tileColor(space: VisualSpace): string {
  return space.color ?? SPACE_COLORS[space.kind] ?? '#334155';
}

function tablePlacement(index: number): { gridColumn: number; gridRow: number } {
  const position = ((index % VISUAL_RING_SPACES) + VISUAL_RING_SPACES) % VISUAL_RING_SPACES;
  if (position === 0) return { gridColumn: VISUAL_EDGE_SPACES, gridRow: VISUAL_EDGE_SPACES };
  if (position <= VISUAL_EDGE_STEPS) return { gridColumn: VISUAL_EDGE_SPACES - position, gridRow: VISUAL_EDGE_SPACES };
  if (position <= VISUAL_EDGE_STEPS * 2) return { gridColumn: 1, gridRow: VISUAL_EDGE_SPACES - (position - VISUAL_EDGE_STEPS) };
  if (position <= VISUAL_EDGE_STEPS * 3) return { gridColumn: position - (VISUAL_EDGE_STEPS * 2) + 1, gridRow: 1 };
  return { gridColumn: VISUAL_EDGE_SPACES, gridRow: position - (VISUAL_EDGE_STEPS * 3) + 1 };
}

function spaceCaption(space: VisualSpace): string {
  if (typeof space.price === 'number') return `$${space.price.toLocaleString('en-US')}`;
  if (space.kind === 'event') return 'EVENT';
  if (space.kind === 'civic') return 'CIVIC';
  if (space.kind === 'levy' || space.kind === 'tax') return 'LEVY';
  if (space.kind === 'transit' || space.kind === 'route') return 'ROUTE';
  if (space.kind === 'utility' || space.kind === 'works') return 'WORKS';
  if (space.kind === 'start') return 'DIVIDEND';
  if (space.kind === 'detention' || space.kind === 'gotodetention') return 'CIVIC HOLD';
  if (space.kind === 'festival' || space.kind === 'rest') return 'COMMONS';
  return space.kind.toUpperCase();
}

function tableSpaceIcon(space: VisualSpace): string {
  if (space.kind === 'district' || space.kind === 'property' || space.kind === 'parcel') return '\u2302';
  if (space.kind === 'event') return '?';
  if (space.kind === 'civic') return '\u2726';
  if (space.kind === 'transit' || space.kind === 'route') return '\u279c';
  if (space.kind === 'utility' || space.kind === 'works') return '\u26a1';
  if (space.kind === 'levy' || space.kind === 'tax') return '\u00a2';
  if (space.kind === 'start') return 'GO';
  if (space.kind === 'detention' || space.kind === 'gotodetention') return '!';
  if (space.kind === 'festival' || space.kind === 'rest') return '\u2600';
  return '\u2726';
}

function TableBuildings({ count }: { count: number }) {
  if (count <= 0) return null;
  if (count >= 5) {
    return <span className="board-tile__buildings board-tile__buildings--hotel" aria-label="Hotel"><span className="board-hotel"><i /><i /><i /></span></span>;
  }

  return (
    <span className="board-tile__buildings" aria-label={`${count} ${count === 1 ? 'house' : 'houses'}`}>
      {Array.from({ length: count }, (_, index) => <span className="board-house" key={index}><i /></span>)}
    </span>
  );
}

function TablePawn({ player, active }: { player: VisualPlayer; active: boolean }) {
  return (
    <span className={`board-pawn${active ? ' board-pawn--active' : ''}`} style={{ '--pawn-color': player.color } as CSSProperties} title={player.name}>
      <i className="board-pawn__head" />
      <i className="board-pawn__body" />
    </span>
  );
}

function propertyForSpace(space: VisualSpace, properties: Map<string, PropertyVisualState>): PropertyVisualState | undefined {
  return properties.get(space.id) ?? properties.get(String(space.index));
}

function propertyForSlot(slot: VisualSlot, selectedSpaceId: string | null, properties: Map<string, PropertyVisualState>): PropertyVisualState | undefined {
  const selectedSpace = slot.spaces.find((space) => space.id === selectedSpaceId);
  if (selectedSpace) return propertyForSpace(selectedSpace, properties);

  return slot.spaces.reduce<PropertyVisualState | undefined>((mostDeveloped, space) => {
    const candidate = propertyForSpace(space, properties);
    if (!candidate) return mostDeveloped;
    if (!mostDeveloped || candidate.buildings > mostDeveloped.buildings || (candidate.ownerId && !mostDeveloped.ownerId)) return candidate;
    return mostDeveloped;
  }, undefined);
}

function BoardTable({ spaces, players, properties, selectedSpaceId, activeId, onSelectSpace, reducedMotion }: BoardTableProps) {
  const playerById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);
  const tokensByIndex = useMemo(() => {
    const map = new Map<number, VisualPlayer[]>();
    players.filter((player) => !player.isBankrupt).forEach((player) => {
      const index = visualIndexForLogicalIndex(player.position);
      map.set(index, [...(map.get(index) ?? []), player]);
    });
    return map;
  }, [players]);

  return (
    <div aria-label="Civic Fortune isometric board" className={`play-board play-board--isometric${reducedMotion ? ' play-board--reduced-motion' : ''}`}>
      <div aria-hidden="true" className="play-board__center">
        <span className="play-board__sun" />
        <span className="play-board__cloud play-board__cloud--one" />
        <span className="play-board__cloud play-board__cloud--two" />
        <span className="play-board__road" />
        <span className="play-board__park play-board__park--one" />
        <span className="play-board__park play-board__park--two" />
        <span className="play-board__fountain"><i /><i /><i /></span>
        <div className="play-board__title">
          <span>ROLL / TRADE / BUILD</span>
          <strong>CIVIC<br /><b>FORTUNE</b></strong>
          <small>THE FRIENDLIEST CITY ON THE BOARD</small>
        </div>
      </div>
      {spaces.map((slot) => {
        const selectedMemberIndex = slot.spaces.findIndex((space) => space.id === selectedSpaceId);
        const space = slot.spaces[selectedMemberIndex] ?? slot.spaces[0];
        if (!space) return null;
        const property = propertyForSlot(slot, selectedSpaceId, properties);
        const owner = property?.ownerId ? playerById.get(property.ownerId) : undefined;
        const tokens = tokensByIndex.get(slot.index) ?? [];
        const placement = tablePlacement(slot.index);
        const selected = selectedMemberIndex >= 0;
        const special = placement.gridColumn === 1 || placement.gridColumn === VISUAL_EDGE_SPACES || placement.gridRow === 1 || placement.gridRow === VISUAL_EDGE_SPACES;
        const nextSpace = slot.spaces[(selectedMemberIndex + 1 + slot.spaces.length) % slot.spaces.length] ?? space;
        const groupedNames = slot.spaces.length > 1
          ? `, shares this display tile with ${slot.spaces.filter((member) => member.id !== space.id).map((member) => member.label).join(', ')}`
          : '';
        return (
          <button
            key={slot.index}
            type="button"
            onClick={() => onSelectSpace(nextSpace.id)}
            aria-pressed={selected}
            aria-label={`${space.label}${groupedNames}${owner ? `, owned by ${owner.name}` : ''}${tokens.length ? `, ${tokens.length} player token${tokens.length === 1 ? '' : 's'}` : ''}`}
            className={`board-tile board-tile--${space.kind}${special ? ' board-tile--edge' : ''}${selected ? ' board-tile--selected' : ''}${owner ? ' board-tile--owned' : ''}`}
            style={{ gridColumn: placement.gridColumn, gridRow: placement.gridRow, '--tile-color': tileColor(space), '--owner-color': owner?.color ?? 'transparent' } as CSSProperties}
          >
            <span className="board-tile__stripe" />
            {slot.spaces.length > 1 && <span className="board-tile__group-count" aria-hidden="true">+{slot.spaces.length - 1}</span>}
            <span className="board-tile__icon" aria-hidden="true">{tableSpaceIcon(space)}</span>
            <span className="board-tile__name">{space.label}</span>
            <span className="board-tile__caption">{spaceCaption(space)}</span>
            {owner && <span className="board-tile__owner" aria-label={`Owned by ${owner.name}`} />}
            <TableBuildings count={property?.buildings ?? 0} />
            <span className="board-tile__pawns" aria-hidden="true">
              {tokens.slice(0, 4).map((player) => <TablePawn key={player.id} player={player} active={player.id === activeId} />)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * The board uses CSS 3D rather than a WebGL canvas: the fixed isometric camera
 * is always available, while every tile remains a normal accessible button.
 */
export const Board3D = memo(function Board3D({ game, selectedSpaceId: selectedSpaceIdProp, onSelectSpace, reducedMotion = false, style }: Board3DProps) {
  const [localSelectedSpaceId, setLocalSelectedSpaceId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const pinchPoints = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<{ distance: number; zoom: number } | null>(null);
  const spaces = useMemo(normaliseBoard, []);
  const compactSpaces = useMemo(() => visualSlots(spaces), [spaces]);
  const players = useMemo(() => normalisePlayers(game), [game]);
  const properties = useMemo(() => normaliseProperties(game, players), [game, players]);
  const activeId = useMemo(() => activePlayerId(game), [game]);
  const selectedSpaceId = selectedSpaceIdProp === undefined ? localSelectedSpaceId : selectedSpaceIdProp;
  const selectedSpace = spaces.find((space) => space.id === selectedSpaceId);

  const selectSpace = useCallback((spaceId: string) => {
    if (selectedSpaceIdProp === undefined) setLocalSelectedSpaceId(spaceId);
    onSelectSpace?.(spaceId);
  }, [onSelectSpace, selectedSpaceIdProp]);

  const updatePinch = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'touch' || !pinchPoints.current.has(event.pointerId)) return;
    pinchPoints.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinchPoints.current.size !== 2) return;
    const [first, second] = [...pinchPoints.current.values()];
    const distance = Math.hypot(first.x - second.x, first.y - second.y);
    if (!pinchStart.current) {
      pinchStart.current = { distance, zoom };
      return;
    }
    if (pinchStart.current.distance > 0) setZoom(clampZoom(pinchStart.current.zoom * distance / pinchStart.current.distance));
  }, [zoom]);

  const startPinch = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'touch') return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointer events are not always capturable; the pinch maths
      // still works while the pointers remain over the board.
    }
    pinchPoints.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinchPoints.current.size === 2) {
      const [first, second] = [...pinchPoints.current.values()];
      pinchStart.current = { distance: Math.hypot(first.x - second.x, first.y - second.y), zoom };
    }
  }, [zoom]);

  const endPinch = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    pinchPoints.current.delete(event.pointerId);
    if (pinchPoints.current.size < 2) pinchStart.current = null;
  }, []);

  return (
    <section
      className="board-table-shell board-table-shell--isometric"
      aria-label="Interactive Civic Fortune isometric board"
      onWheel={(event) => {
        event.preventDefault();
        setZoom((current) => clampZoom(current + (event.deltaY > 0 ? -0.07 : 0.07)));
      }}
      onPointerDown={startPinch}
      onPointerMove={updatePinch}
      onPointerUp={endPinch}
      onPointerCancel={endPinch}
      style={{ '--board-zoom': zoom, ...style } as CSSProperties}
    >
      <BoardTable spaces={compactSpaces} players={players} properties={properties} selectedSpaceId={selectedSpaceId} activeId={activeId} onSelectSpace={selectSpace} reducedMotion={reducedMotion} />
      <div className="board-zoom-controls" role="group" aria-label="Board zoom controls">
        <button type="button" aria-label="Zoom out" onClick={() => setZoom((current) => clampZoom(current - 0.1))}>-</button>
        <button type="button" aria-label="Reset zoom" onClick={() => setZoom(DEFAULT_ZOOM)}>{Math.round(zoom * 100)}%</button>
        <button type="button" aria-label="Zoom in" onClick={() => setZoom((current) => clampZoom(current + 0.1))}>+</button>
      </div>
      <span className="board-zoom-hint" aria-hidden="true">SCROLL / PINCH TO ZOOM</span>
      <BoardStatusAnnouncer selectedSpace={selectedSpace} />
    </section>
  );
});

function BoardStatusAnnouncer({ selectedSpace }: { selectedSpace?: VisualSpace }) {
  return (
    <span
      aria-live="polite"
      style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 }}
    >
      {selectedSpace ? `${selectedSpace.label} selected` : 'No board tile selected'}
    </span>
  );
}

export default Board3D;
