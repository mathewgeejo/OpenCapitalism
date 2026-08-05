import { OrbitControls, RoundedBox, Text } from '@react-three/drei';
import { Canvas, type ThreeEvent, useFrame } from '@react-three/fiber';
import {
  memo,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { Color, Matrix4, type Group, type InstancedMesh } from 'three';
import type { GameState, PublicGameState } from '../../game/types';
import { BOARD } from '../../game/board';

/**
 * The renderer deliberately consumes the public portion of GameState only. The
 * small adapters below accept a few equivalent public field names so an older
 * snapshot can remain visible while a realtime client catches up.
 */
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

type PropertyVisualState = {
  ownerId?: string;
  buildings: number;
  mortgaged: boolean;
};

type BoardLayout = {
  x: number;
  z: number;
  width: number;
  depth: number;
  rotation: number;
  corner: boolean;
};

type CityBox = {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  color: string;
};

export type BoardView = '3d' | 'table';

export interface Board3DProps {
  /** The public authoritative snapshot. No hidden deck or server state is read. */
  game: BoardGameState;
  /** Controls the selected-tile glow; Board3D can also manage it internally. */
  selectedSpaceId?: string | null;
  /** Called whenever a player chooses a tile in either board view. */
  onSelectSpace?: (spaceId: string) => void;
  /** Use the accessible flat board if WebGL is unavailable or a player prefers it. */
  view?: BoardView;
  /** Stops token travel/bobbing and keeps the camera static without sacrificing context. */
  reducedMotion?: boolean;
  /** Enables canvas shadows on capable devices. */
  shadows?: boolean;
  /** Optional inline container styles, for placement in a room shell. */
  style?: CSSProperties;
}

const BOARD_HALF = 10.6;
const CORNER_SIZE = 2.6;
const EDGE_DEPTH = 2.4;
const EDGE_PITCH = (BOARD_HALF * 2 - CORNER_SIZE * 2) / 12;
const CORNER_CENTER = BOARD_HALF - CORNER_SIZE / 2;
const EDGE_CENTER = BOARD_HALF - EDGE_DEPTH / 2;
const BOARD_SIZE = 52;

const PLAYER_COLORS = [
  '#ff6b65', '#4cc9f0', '#ffd166', '#80ed99', '#c77dff', '#f9844a', '#5eead4', '#fb7185', '#a3e635', '#60a5fa',
  '#f9a8d4', '#facc15', '#67e8f9', '#c4b5fd', '#fdba74', '#86efac', '#fda4af', '#93c5fd', '#d8b4fe', '#bef264',
];

const SPACE_COLORS: Record<string, string> = {
  district: '#60c7d9',
  property: '#60c7d9',
  parcel: '#60c7d9',
  transit: '#4cbcae',
  route: '#4cbcae',
  works: '#59a8e7',
  utility: '#59a8e7',
  event: '#ef7098',
  civic: '#8d79ea',
  levy: '#f19055',
  tax: '#f19055',
  corner: '#55c884',
  start: '#55c884',
  detention: '#7c8da4',
  festival: '#f5c955',
  rest: '#f5c955',
  jackpot: '#f5a54e',
  gotodetention: '#7c8da4',
};

const CITY_BLOCKS = [
  [-3.65, -3.55, 2.3, 1.15, '#0f766e'],
  [-0.9, -3.55, 2.7, 1.15, '#155e75'],
  [2.25, -3.55, 2.45, 1.15, '#1d4ed8'],
  [-3.8, -1.65, 1.05, 1.65, '#15803d'],
  [-2.15, -1.65, 1.9, 1.65, '#334155'],
  [0.25, -1.65, 2.4, 1.65, '#0f766e'],
  [3.2, -1.65, 1.35, 1.65, '#155e75'],
  [-3.65, 0.75, 2.25, 2.2, '#1d4ed8'],
  [-0.9, 0.75, 2.7, 2.2, '#15803d'],
  [2.3, 0.75, 2.35, 2.2, '#334155'],
  [-3.6, 3.55, 2.35, 1.15, '#155e75'],
  [-0.9, 3.55, 2.7, 1.15, '#0f766e'],
  [2.35, 3.55, 2.3, 1.15, '#1d4ed8'],
] as const;

const CITY_FOUNDATIONS: readonly CityBox[] = CITY_BLOCKS.map(([x, z, width, depth]) => ({
  x,
  y: 0.12,
  z,
  width,
  height: 0.08,
  depth,
  color: '#0b1627',
}));

const CITY_BUILDINGS: readonly CityBox[] = CITY_BLOCKS.flatMap(([x, z, width, depth, color], index): CityBox[] => [
  {
    x: x + width * 0.16,
    y: 0.3 + (index % 3) * 0.07,
    z: z - depth * 0.08,
    width: Math.min(0.52, width * 0.34),
    height: 0.38 + (index % 3) * 0.14,
    depth: Math.min(0.48, depth * 0.36),
    color,
  },
  {
    x: x - width * 0.19,
    y: 0.22 + ((index + 1) % 2) * 0.05,
    z: z + depth * 0.16,
    width: Math.min(0.42, width * 0.29),
    height: 0.25 + ((index + 1) % 2) * 0.1,
    depth: Math.min(0.38, depth * 0.3),
    color: index % 2 === 0 ? '#dbeafe' : '#f8fafc',
  },
]);

const CITY_ROADS: readonly CityBox[] = [
  { x: 0, y: 0.142, z: -2.7, width: 9.1, height: 0.025, depth: 0.16, color: '#2b3b52' },
  { x: 0, y: 0.142, z: 0.05, width: 9.1, height: 0.025, depth: 0.18, color: '#2b3b52' },
  { x: 0, y: 0.142, z: 2.95, width: 9.1, height: 0.025, depth: 0.16, color: '#2b3b52' },
  { x: -2.8, y: 0.143, z: 0.2, width: 0.16, height: 0.026, depth: 8.8, color: '#2b3b52' },
  { x: 1.95, y: 0.143, z: 0.2, width: 0.16, height: 0.026, depth: 8.8, color: '#2b3b52' },
];

const CITY_TREES = [
  [-4.75, -2.25], [-4.75, 1.6], [-2.85, 4.45], [-0.15, 4.45], [2.35, 4.45], [4.75, 2.5], [4.75, -1.9],
  [-4.65, -4.25], [4.6, -4.15], [-4.55, 4.2], [4.55, 4.15], [-1.2, -4.4], [1.45, -4.4],
] as const;

const TREE_TRUNKS: readonly CityBox[] = CITY_TREES.map(([x, z]) => ({ x, y: 0.25, z, width: 0.06, height: 0.32, depth: 0.06, color: '#7c4a2d' }));
const TREE_CROWNS: readonly CityBox[] = CITY_TREES.map(([x, z], index) => ({
  x,
  y: 0.53,
  z,
  width: index % 2 === 0 ? 0.32 : 0.38,
  height: index % 3 === 0 ? 0.38 : 0.32,
  depth: index % 2 === 0 ? 0.32 : 0.38,
  color: index % 2 === 0 ? '#2f855a' : '#3f9d68',
}));

const FRAME_RAILS: readonly CityBox[] = [
  { x: 0, y: 0.17, z: 10.25, width: 20.55, height: 0.05, depth: 0.07, color: '#d6a84a' },
  { x: 0, y: 0.17, z: -10.25, width: 20.55, height: 0.05, depth: 0.07, color: '#d6a84a' },
  { x: 10.25, y: 0.17, z: 0, width: 0.07, height: 0.05, depth: 20.55, color: '#d6a84a' },
  { x: -10.25, y: 0.17, z: 0, width: 0.07, height: 0.05, depth: 20.55, color: '#d6a84a' },
];

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

  return rawSpaces.slice(0, BOARD_SIZE).map((value, position) => {
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
  return ((index % BOARD_SIZE) + BOARD_SIZE) % BOARD_SIZE;
}

function layoutForSpace(index: number): BoardLayout {
  const position = normaliseIndex(index);
  const along = (step: number) => BOARD_HALF - CORNER_SIZE - EDGE_PITCH * (step - 0.5);

  if (position === 0) return { x: CORNER_CENTER, z: CORNER_CENTER, width: CORNER_SIZE, depth: CORNER_SIZE, rotation: 0, corner: true };
  if (position >= 1 && position <= 12) return { x: along(position), z: EDGE_CENTER, width: EDGE_PITCH, depth: EDGE_DEPTH, rotation: 0, corner: false };
  if (position === 13) return { x: -CORNER_CENTER, z: CORNER_CENTER, width: CORNER_SIZE, depth: CORNER_SIZE, rotation: 0, corner: true };
  if (position >= 14 && position <= 25) return { x: -EDGE_CENTER, z: along(position - 13), width: EDGE_PITCH, depth: EDGE_DEPTH, rotation: Math.PI / 2, corner: false };
  if (position === 26) return { x: -CORNER_CENTER, z: -CORNER_CENTER, width: CORNER_SIZE, depth: CORNER_SIZE, rotation: 0, corner: true };
  if (position >= 27 && position <= 38) return { x: -along(position - 26), z: -EDGE_CENTER, width: EDGE_PITCH, depth: EDGE_DEPTH, rotation: 0, corner: false };
  if (position === 39) return { x: CORNER_CENTER, z: -CORNER_CENTER, width: CORNER_SIZE, depth: CORNER_SIZE, rotation: 0, corner: true };
  return { x: EDGE_CENTER, z: -along(position - 39), width: EDGE_PITCH, depth: EDGE_DEPTH, rotation: Math.PI / 2, corner: false };
}

function tileColor(space: VisualSpace): string {
  return space.color ?? SPACE_COLORS[space.kind] ?? '#334155';
}

function playerOffset(slot: number, layout: BoardLayout): [number, number] {
  const columns = layout.corner ? 3 : 2;
  const col = slot % columns;
  const row = Math.floor(slot / columns) % 3;
  const spreadX = layout.corner ? 0.58 : 0.25;
  const spreadZ = layout.corner ? 0.58 : 0.48;
  return [(col - (columns - 1) / 2) * spreadX, (row - 1) * spreadZ];
}

function boardPoint(index: number, offsetX: number, offsetZ: number): [number, number] {
  const layout = layoutForSpace(index);
  return [layout.x + offsetX, layout.z + offsetZ];
}

function tablePlacement(index: number): { gridColumn: number; gridRow: number } {
  const position = normaliseIndex(index);
  if (position === 0) return { gridColumn: 14, gridRow: 14 };
  if (position <= 12) return { gridColumn: 14 - position, gridRow: 14 };
  if (position === 13) return { gridColumn: 1, gridRow: 14 };
  if (position <= 25) return { gridColumn: 1, gridRow: 14 - (position - 13) };
  if (position === 26) return { gridColumn: 1, gridRow: 1 };
  if (position <= 38) return { gridColumn: position - 25, gridRow: 1 };
  if (position === 39) return { gridColumn: 14, gridRow: 1 };
  return { gridColumn: 14, gridRow: position - 38 };
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

function spaceGlyph(space: VisualSpace): string {
  if (typeof space.price === 'number') return '$';
  if (space.kind === 'event') return '?';
  if (space.kind === 'civic') return 'C';
  if (space.kind === 'transit' || space.kind === 'route') return 'R';
  if (space.kind === 'utility' || space.kind === 'works') return 'W';
  if (space.kind === 'levy' || space.kind === 'tax') return '$';
  if (space.kind === 'start') return '+';
  if (space.kind === 'detention' || space.kind === 'gotodetention') return '!';
  return '*';
}

function tableSpaceIcon(space: VisualSpace): string {
  if (space.kind === 'district' || space.kind === 'property' || space.kind === 'parcel') return '⌂';
  if (space.kind === 'event') return '?';
  if (space.kind === 'civic') return '✦';
  if (space.kind === 'transit' || space.kind === 'route') return '➜';
  if (space.kind === 'utility' || space.kind === 'works') return '⚡';
  if (space.kind === 'levy' || space.kind === 'tax') return '¢';
  if (space.kind === 'start') return 'GO';
  if (space.kind === 'detention' || space.kind === 'gotodetention') return '!';
  if (space.kind === 'festival' || space.kind === 'rest') return '☀';
  return '✦';
}

function TableBuildings({ count }: { count: number }) {
  if (count <= 0) return null;
  if (count >= 5) {
    return (
      <span className="board-tile__buildings board-tile__buildings--hotel" aria-label="Hotel">
        <span className="board-hotel"><i /><i /><i /></span>
      </span>
    );
  }

  return (
    <span className="board-tile__buildings" aria-label={`${count} ${count === 1 ? 'house' : 'houses'}`}>
      {Array.from({ length: count }, (_, index) => <span className="board-house" key={index}><i /></span>)}
    </span>
  );
}

function TablePawn({ player, active }: { player: VisualPlayer; active: boolean }) {
  return (
    <span
      className={`board-pawn${active ? ' board-pawn--active' : ''}`}
      style={{ '--pawn-color': player.color } as CSSProperties}
      title={player.name}
    >
      <i className="board-pawn__head" />
      <i className="board-pawn__body" />
    </span>
  );
}

const InstancedBoxes = memo(function InstancedBoxes({
  items,
  roughness = 0.56,
  metalness = 0.08,
  shadows = true,
}: {
  items: readonly CityBox[];
  roughness?: number;
  metalness?: number;
  shadows?: boolean;
}) {
  const mesh = useRef<InstancedMesh>(null);
  const matrix = useMemo(() => new Matrix4(), []);
  const color = useMemo(() => new Color(), []);

  useLayoutEffect(() => {
    const instance = mesh.current;
    if (!instance) return;
    items.forEach((item, index) => {
      matrix.makeScale(item.width, item.height, item.depth);
      matrix.setPosition(item.x, item.y, item.z);
      instance.setMatrixAt(index, matrix);
      instance.setColorAt(index, color.set(item.color));
    });
    instance.instanceMatrix.needsUpdate = true;
    if (instance.instanceColor) instance.instanceColor.needsUpdate = true;
    instance.computeBoundingSphere();
  }, [color, items, matrix]);

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, items.length]} castShadow={shadows} receiveShadow={shadows}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial vertexColors roughness={roughness} metalness={metalness} />
    </instancedMesh>
  );
});

function House({ x, z, tint }: { x: number; z: number; tint: string }) {
  return (
    <group position={[x, 0, z]}>
      <mesh castShadow>
        <boxGeometry args={[0.19, 0.18, 0.17]} />
        <meshStandardMaterial color={tint} roughness={0.4} metalness={0.13} />
      </mesh>
      <mesh position={[0, 0.15, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[0.155, 0.16, 4]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.36} metalness={0.07} />
      </mesh>
      <mesh position={[0, 0.03, 0.091]}>
        <planeGeometry args={[0.055, 0.065]} />
        <meshStandardMaterial color="#fef3c7" emissive="#f59e0b" emissiveIntensity={0.22} />
      </mesh>
    </group>
  );
}

const BuildingCluster = memo(function BuildingCluster({ count, tint }: { count: number; tint: string }) {
  if (count <= 0) return null;

  if (count >= 5) {
    return (
      <group position={[0, 0.31, -0.06]}>
        <mesh castShadow>
          <boxGeometry args={[0.42, 0.67, 0.38]} />
          <meshStandardMaterial color={tint} roughness={0.32} metalness={0.25} />
        </mesh>
        <mesh position={[0, 0.4, 0]} castShadow>
          <coneGeometry args={[0.31, 0.24, 4]} />
          <meshStandardMaterial color="#e7c36a" roughness={0.28} metalness={0.42} />
        </mesh>
        <mesh position={[0, 0.06, 0.196]}>
          <planeGeometry args={[0.23, 0.35]} />
          <meshStandardMaterial color="#fef3c7" emissive="#f59e0b" emissiveIntensity={0.33} />
        </mesh>
      </group>
    );
  }

  const positions: [number, number][] = [
    [-0.21, -0.18], [0.21, -0.18], [-0.21, 0.18], [0.21, 0.18],
  ];

  return (
    <group position={[0, 0.3, -0.02]}>
      {positions.slice(0, count).map(([x, z], index) => <House key={index} x={x} z={z} tint={tint} />)}
    </group>
  );
});

function SelectionGlow({ width, depth, reducedMotion }: { width: number; depth: number; reducedMotion: boolean }) {
  const glow = useRef<Group>(null);

  useFrame(({ clock }) => {
    if (!glow.current || reducedMotion) return;
    const pulse = 1 + Math.sin(clock.elapsedTime * 3.2) * 0.035;
    glow.current.scale.set(pulse, 1, pulse);
  });

  return (
    <group ref={glow} position={[0, 0.19, 0]}>
      <mesh>
        <boxGeometry args={[width * 0.985, 0.018, depth * 0.975]} />
        <meshBasicMaterial color="#f5d66f" transparent opacity={0.37} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.012, 0]}>
        <boxGeometry args={[width * 0.93, 0.008, depth * 0.91]} />
        <meshBasicMaterial color="#fff7c4" transparent opacity={0.14} depthWrite={false} />
      </mesh>
    </group>
  );
}

function Token({
  player,
  x,
  z,
  active,
  reducedMotion,
}: {
  player: VisualPlayer;
  x: number;
  z: number;
  active: boolean;
  reducedMotion: boolean;
}) {
  const token = useRef<Group>(null);
  const previousPosition = useRef(normaliseIndex(player.position));
  const hasMounted = useRef(false);
  const travel = useRef<{ from: number; steps: number; elapsed: number; duration: number } | null>(null);

  useEffect(() => {
    const nextPosition = normaliseIndex(player.position);
    if (!hasMounted.current) {
      hasMounted.current = true;
      previousPosition.current = nextPosition;
      return;
    }

    const previous = previousPosition.current;
    previousPosition.current = nextPosition;
    if (previous === nextPosition || reducedMotion) {
      travel.current = null;
      return;
    }

    const forward = (nextPosition - previous + BOARD_SIZE) % BOARD_SIZE;
    // Dice movement is normally forward; a short backwards card movement stays backwards.
    const steps = forward > 14 ? forward - BOARD_SIZE : forward;
    travel.current = {
      from: previous,
      steps,
      elapsed: 0,
      duration: Math.min(2.05, Math.max(0.34, Math.abs(steps) * 0.135)),
    };
  }, [player.position, reducedMotion]);

  useFrame(({ clock }, delta) => {
    const group = token.current;
    if (!group) return;

    let nextX = x;
    let nextZ = z;
    const journey = travel.current;
    if (!reducedMotion && journey && journey.steps !== 0) {
      journey.elapsed += Math.min(delta, 0.05);
      const progress = Math.min(1, journey.elapsed / journey.duration);
      const eased = 1 - (1 - progress) ** 3;
      const absoluteSteps = Math.abs(journey.steps);
      const travelled = Math.min(absoluteSteps, eased * absoluteSteps);
      const segment = Math.min(absoluteSteps - 1, Math.floor(travelled));
      const segmentProgress = travelled - segment;
      const direction = Math.sign(journey.steps);
      const [fromX, fromZ] = boardPoint(journey.from + direction * segment, 0, 0);
      const [toX, toZ] = boardPoint(journey.from + direction * (segment + 1), 0, 0);
      nextX = fromX + (toX - fromX) * segmentProgress;
      nextZ = fromZ + (toZ - fromZ) * segmentProgress;
      if (progress >= 1) travel.current = null;
    }

    if (reducedMotion) {
      group.position.set(nextX, 0.45 + (active ? 0.035 : 0), nextZ);
      group.rotation.y = 0;
      group.scale.setScalar(1);
      return;
    }

    // A gentle interpolation also handles token-stack reshuffling without a hard snap.
    const follow = Math.min(1, delta * 18);
    group.position.x += (nextX - group.position.x) * follow;
    group.position.z += (nextZ - group.position.z) * follow;
    group.position.y = 0.46 + Math.sin(clock.elapsedTime * 2.3 + x * 2.4 + z) * 0.038 + (active ? 0.052 : 0);
    group.rotation.y = Math.sin(clock.elapsedTime * 0.75 + x) * 0.08;
    group.scale.setScalar(active ? 1.045 + Math.sin(clock.elapsedTime * 2.7) * 0.018 : 1);
  });

  return (
    <group ref={token} position={[x, 0.46 + (active ? 0.052 : 0), z]}>
      {active && (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.34, 0]}>
            <ringGeometry args={[0.22, 0.32, 28]} />
            <meshBasicMaterial color="#f9d86f" transparent opacity={0.94} depthWrite={false} />
          </mesh>
          <pointLight color={player.color} intensity={1.4} distance={2.4} />
        </>
      )}
      <mesh castShadow>
        <cylinderGeometry args={[0.145, 0.22, 0.13, 20]} />
        <meshStandardMaterial color={player.color} roughness={0.2} metalness={0.48} emissive={active ? player.color : '#000000'} emissiveIntensity={active ? 0.22 : 0} />
      </mesh>
      <mesh position={[0, 0.13, 0]} castShadow>
        <sphereGeometry args={[0.135, 20, 16]} />
        <meshStandardMaterial color={player.color} roughness={0.18} metalness={0.36} />
      </mesh>
      <mesh position={[0, 0.22, 0]} castShadow>
        <cylinderGeometry args={[0.058, 0.085, 0.14, 16]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.26} metalness={0.38} />
      </mesh>
    </group>
  );
}

const BoardTile = memo(function BoardTile({
  space,
  selected,
  ownerColor,
  buildings,
  mortgaged,
  onSelectSpace,
  reducedMotion,
}: {
  space: VisualSpace;
  selected: boolean;
  ownerColor?: string;
  buildings: number;
  mortgaged: boolean;
  onSelectSpace: (spaceId: string) => void;
  reducedMotion: boolean;
}) {
  const layout = layoutForSpace(space.index);
  const tint = tileColor(space);
  const special = layout.corner || !space.price;
  const faceColor = special ? tint : '#f4f1e8';
  const labelColor = special ? '#f8fafc' : '#132238';
  const fontSize = layout.corner ? 0.225 : 0.165;
  const handleClick = useCallback((event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelectSpace(space.id);
  }, [onSelectSpace, space.id]);

  return (
    <group position={[layout.x, 0.06, layout.z]} rotation={[0, layout.rotation, 0]}>
      <RoundedBox
        args={[layout.width * 0.97, 0.23, layout.depth * 0.95]}
        radius={0.075}
        smoothness={4}
        castShadow
        receiveShadow
        onClick={handleClick}
        onPointerOver={(event) => {
          event.stopPropagation();
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          document.body.style.cursor = 'default';
        }}
      >
        <meshStandardMaterial color="#42738a" roughness={0.38} metalness={0.2} />
      </RoundedBox>
      <RoundedBox args={[layout.width * 0.91, 0.055, layout.depth * 0.88]} position={[0, 0.14, 0]} radius={0.045} smoothness={3}>
        <meshStandardMaterial color={faceColor} roughness={0.52} metalness={special ? 0.1 : 0.04} />
      </RoundedBox>

      <mesh position={[0, 0.181, layout.depth * 0.29]}>
        <boxGeometry args={[layout.width * 0.77, 0.045, Math.min(0.19, layout.depth * 0.12)]} />
        <meshStandardMaterial color={tint} roughness={0.34} metalness={0.18} emissive={selected ? tint : '#000000'} emissiveIntensity={selected ? 0.2 : 0} />
      </mesh>

      {selected && <SelectionGlow width={layout.width} depth={layout.depth} reducedMotion={reducedMotion} />}

      {ownerColor && (
        <>
          <mesh position={[0, 0.192, -layout.depth * 0.32]}>
            <boxGeometry args={[layout.width * 0.78, 0.062, 0.105]} />
            <meshStandardMaterial color={ownerColor} emissive={ownerColor} emissiveIntensity={0.24} roughness={0.28} metalness={0.2} />
          </mesh>
          <mesh position={[layout.width * 0.34, 0.226, -layout.depth * 0.32]}>
            <sphereGeometry args={[0.045, 12, 10]} />
            <meshStandardMaterial color="#fff7c4" emissive="#f9d86f" emissiveIntensity={0.5} />
          </mesh>
        </>
      )}

      {mortgaged && (
        <group position={[0, 0.2, -layout.depth * 0.1]} rotation={[0, 0, -0.22]}>
          <mesh>
            <boxGeometry args={[layout.width * 0.8, 0.04, 0.09]} />
            <meshStandardMaterial color="#b91c1c" emissive="#ef4444" emissiveIntensity={0.24} roughness={0.38} />
          </mesh>
        </group>
      )}

      <Text
        position={[0, 0.211, layout.corner ? -0.08 : 0.025]}
        rotation={[-Math.PI / 2, 0, 0]}
        anchorX="center"
        anchorY="middle"
        color={labelColor}
        fontSize={fontSize}
        maxWidth={Math.max(0.7, layout.width * 0.76)}
        lineHeight={0.9}
        textAlign="center"
        outlineWidth={special ? 0.008 : 0.004}
        outlineColor={special ? '#0b1324' : '#f8fafc'}
      >
        {space.label}
      </Text>
      {!layout.corner && (
        <Text
          position={[0, 0.213, -layout.depth * 0.175]}
          rotation={[-Math.PI / 2, 0, 0]}
          anchorX="center"
          anchorY="middle"
          color={special ? 'rgba(255,255,255,0.82)' : '#52657d'}
          fontSize={0.098}
          maxWidth={layout.width * 0.7}
          letterSpacing={0.035}
        >
          {spaceCaption(space)}
        </Text>
      )}
      <Text
        position={[layout.width * 0.34, 0.216, layout.depth * 0.3]}
        rotation={[-Math.PI / 2, 0, 0]}
        anchorX="center"
        anchorY="middle"
        color={special ? '#ffffff' : '#f8fafc'}
        fontSize={layout.corner ? 0.23 : 0.115}
        outlineWidth={0.006}
        outlineColor="#0b1324"
      >
        {spaceGlyph(space)}
      </Text>
      <BuildingCluster count={buildings} tint={ownerColor ?? '#94a3b8'} />
    </group>
  );
});

const MiniatureCity = memo(function MiniatureCity({ shadows }: { shadows: boolean }) {
  return (
    <group>
      <RoundedBox args={[22.35, 0.48, 22.35]} radius={0.3} smoothness={5} position={[0, -0.22, 0]} receiveShadow>
        <meshStandardMaterial color="#3f7188" roughness={0.42} metalness={0.2} />
      </RoundedBox>
      <RoundedBox args={[21.82, 0.1, 21.82]} radius={0.22} smoothness={4} position={[0, 0.01, 0]} receiveShadow>
        <meshStandardMaterial color="#7ccfcf" roughness={0.66} metalness={0.08} />
      </RoundedBox>
      <InstancedBoxes items={FRAME_RAILS} roughness={0.25} metalness={0.55} shadows={shadows} />

      <mesh position={[0, 0.075, 0]} receiveShadow>
        <planeGeometry args={[11.55, 11.55]} />
        <meshStandardMaterial color="#a5e5c9" roughness={0.86} metalness={0.04} />
      </mesh>
      <mesh position={[0, 0.081, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
        <planeGeometry args={[6.3, 6.3]} />
        <meshStandardMaterial color="#7bd5e6" roughness={0.68} metalness={0.08} />
      </mesh>
      <mesh position={[0, 0.085, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[4.1, 4.18, 64]} />
        <meshStandardMaterial color="#f5cf61" roughness={0.32} metalness={0.32} />
      </mesh>

      <InstancedBoxes items={CITY_ROADS} roughness={0.78} metalness={0.04} shadows={shadows} />
      <InstancedBoxes items={CITY_FOUNDATIONS} roughness={0.75} metalness={0.06} shadows={shadows} />
      <InstancedBoxes items={CITY_BUILDINGS} roughness={0.38} metalness={0.26} shadows={shadows} />
      <InstancedBoxes items={TREE_TRUNKS} roughness={0.86} metalness={0} shadows={shadows} />
      <InstancedBoxes items={TREE_CROWNS} roughness={0.82} metalness={0.02} shadows={shadows} />

      <group position={[0, 0.13, 0]}>
        <mesh castShadow={shadows} receiveShadow={shadows}>
          <cylinderGeometry args={[0.88, 1.05, 0.3, 32]} />
          <meshStandardMaterial color="#d8e7ef" roughness={0.36} metalness={0.22} />
        </mesh>
        <mesh position={[0, 0.34, 0]} castShadow={shadows}>
          <sphereGeometry args={[0.55, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#1d7e94" roughness={0.3} metalness={0.25} />
        </mesh>
        <mesh position={[0, 0.43, 0]} castShadow={shadows}>
          <cylinderGeometry args={[0.07, 0.07, 0.42, 12]} />
          <meshStandardMaterial color="#e7c36a" roughness={0.25} metalness={0.6} />
        </mesh>
      </group>

      <Text
        position={[0, 0.12, -0.05]}
        rotation={[-Math.PI / 2, 0, 0]}
        color="#fff9da"
        fontSize={0.64}
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.13}
        outlineWidth={0.012}
        outlineColor="#356d7e"
      >
        CIVIC FORTUNE
      </Text>
      <Text
        position={[0, 0.125, -0.57]}
        rotation={[-Math.PI / 2, 0, 0]}
        color="#335e76"
        fontSize={0.15}
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.16}
      >
        A CITY OF CHOICES
      </Text>
    </group>
  );
});

function BoardScene({
  spaces,
  players,
  properties,
  selectedSpaceId,
  activeId,
  onSelectSpace,
  reducedMotion,
  shadows,
}: {
  spaces: VisualSpace[];
  players: VisualPlayer[];
  properties: Map<string, PropertyVisualState>;
  selectedSpaceId: string | null;
  activeId?: string;
  onSelectSpace: (spaceId: string) => void;
  reducedMotion: boolean;
  shadows: boolean;
}) {
  const playersBySpace = useMemo(() => {
    const map = new Map<number, VisualPlayer[]>();
    players.filter((player) => !player.isBankrupt).forEach((player) => {
      const position = normaliseIndex(player.position);
      map.set(position, [...(map.get(position) ?? []), player]);
    });
    return map;
  }, [players]);

  const playerById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);

  return (
    <>
      <color attach="background" args={['#69cfe0']} />
      <fog attach="fog" args={['#69cfe0', 24, 47]} />
      <hemisphereLight args={['#fff9d7', '#357a91', 1.6]} />
      <directionalLight
        position={[8.5, 15, 6]}
        intensity={2.5}
        color="#fff2dd"
        castShadow={shadows}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
        shadow-bias={-0.00015}
      />
      <pointLight position={[-9, 5.5, -6]} color="#58c8e7" intensity={17} distance={20} decay={2} />
      <pointLight position={[8, 5, 8]} color="#ffd05c" intensity={12} distance={17} decay={2} />
      <pointLight position={[0, 7, -9]} color="#ef78ae" intensity={6} distance={14} decay={2} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.48, 0]} receiveShadow>
        <planeGeometry args={[48, 48]} />
        <meshStandardMaterial color="#4693aa" roughness={0.98} />
      </mesh>

      <MiniatureCity shadows={shadows} />

      {spaces.map((space) => {
        const property = properties.get(space.id) ?? properties.get(String(space.index));
        const owner = property?.ownerId ? playerById.get(property.ownerId) : undefined;
        return (
          <BoardTile
            key={space.id}
            space={space}
            selected={space.id === selectedSpaceId}
            ownerColor={owner?.color}
            buildings={property?.buildings ?? 0}
            mortgaged={property?.mortgaged ?? false}
            onSelectSpace={onSelectSpace}
            reducedMotion={reducedMotion}
          />
        );
      })}

      {spaces.map((space) => {
        const layout = layoutForSpace(space.index);
        return (playersBySpace.get(normaliseIndex(space.index)) ?? []).map((player, slot) => {
          const [offsetX, offsetZ] = playerOffset(slot, layout);
          return (
            <Token
              key={player.id}
              player={player}
              x={layout.x + offsetX}
              z={layout.z + offsetZ}
              active={player.id === activeId}
              reducedMotion={reducedMotion}
            />
          );
        });
      })}

      <OrbitControls
        makeDefault
        target={[0, 0, 0]}
        minDistance={17.5}
        maxDistance={35}
        minPolarAngle={0.32}
        maxPolarAngle={1.42}
        enablePan={false}
        enableDamping={!reducedMotion}
        dampingFactor={0.1}
        rotateSpeed={0.68}
        zoomSpeed={0.76}
      />
    </>
  );
}

function BoardTable({
  spaces,
  players,
  properties,
  selectedSpaceId,
  activeId,
  onSelectSpace,
  reducedMotion,
}: Omit<Parameters<typeof BoardScene>[0], 'reducedMotion' | 'shadows'> & { reducedMotion: boolean }) {
  const playerById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);
  const tokensByIndex = useMemo(() => {
    const map = new Map<number, VisualPlayer[]>();
    players.filter((player) => !player.isBankrupt).forEach((player) => {
      const index = normaliseIndex(player.position);
      map.set(index, [...(map.get(index) ?? []), player]);
    });
    return map;
  }, [players]);

  return (
    <div
      aria-label="Civic Fortune board in table view"
      className={`play-board${reducedMotion ? ' play-board--reduced-motion' : ''}`}
    >
      <div
        aria-hidden="true"
        className="play-board__center"
      >
        <span className="play-board__sun" />
        <span className="play-board__cloud play-board__cloud--one" />
        <span className="play-board__cloud play-board__cloud--two" />
        <span className="play-board__road" />
        <span className="play-board__park play-board__park--one" />
        <span className="play-board__park play-board__park--two" />
        <span className="play-board__fountain"><i /><i /><i /></span>
        <div className="play-board__title">
          <span>ROLL · TRADE · BUILD</span>
          <strong>CIVIC<br /><b>FORTUNE</b></strong>
          <small>THE FRIENDLIEST CITY ON THE BOARD</small>
        </div>
      </div>
      {spaces.map((space) => {
        const property = properties.get(space.id) ?? properties.get(String(space.index));
        const owner = property?.ownerId ? playerById.get(property.ownerId) : undefined;
        const tokens = tokensByIndex.get(normaliseIndex(space.index)) ?? [];
        const placement = tablePlacement(space.index);
        const selected = space.id === selectedSpaceId;
        const special = placement.gridColumn === 1 || placement.gridColumn === 14 || placement.gridRow === 1 || placement.gridRow === 14;
        return (
          <button
            key={space.id}
            type="button"
            onClick={() => onSelectSpace(space.id)}
            aria-pressed={selected}
            aria-label={`${space.label}${owner ? `, owned by ${owner.name}` : ''}${tokens.length ? `, ${tokens.length} player token${tokens.length === 1 ? '' : 's'}` : ''}`}
            className={`board-tile board-tile--${space.kind}${special ? ' board-tile--edge' : ''}${selected ? ' board-tile--selected' : ''}${owner ? ' board-tile--owned' : ''}`}
            style={{
              gridColumn: placement.gridColumn,
              gridRow: placement.gridRow,
              '--tile-color': tileColor(space),
              '--owner-color': owner?.color ?? 'transparent',
            } as CSSProperties}
          >
            <span className="board-tile__stripe" />
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
 * A self-contained, purely presentational 3D tabletop. It never dispatches a
 * game action: selecting a tile is the sole outbound interaction.
 */
export const Board3D = memo(function Board3D({
  game,
  selectedSpaceId: selectedSpaceIdProp,
  onSelectSpace,
  view = 'table',
  reducedMotion = false,
  shadows = true,
  style,
}: Board3DProps) {
  const [localSelectedSpaceId, setLocalSelectedSpaceId] = useState<string | null>(null);
  const spaces = useMemo(normaliseBoard, []);
  const players = useMemo(() => normalisePlayers(game), [game]);
  const properties = useMemo(() => normaliseProperties(game, players), [game, players]);
  const activeId = useMemo(() => activePlayerId(game), [game]);
  const hasWebgl = useMemo(() => {
    if (typeof document === 'undefined') return false;
    try {
      const canvas = document.createElement('canvas');
      return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
    } catch {
      return false;
    }
  }, []);
  const selectedSpaceId = selectedSpaceIdProp === undefined ? localSelectedSpaceId : selectedSpaceIdProp;

  const selectSpace = useCallback((spaceId: string) => {
    if (selectedSpaceIdProp === undefined) setLocalSelectedSpaceId(spaceId);
    onSelectSpace?.(spaceId);
  }, [onSelectSpace, selectedSpaceIdProp]);

  const selectedSpace = spaces.find((space) => space.id === selectedSpaceId);

  // A full board is more useful than an empty canvas. WebGL is an enhancement,
  // so unsupported devices automatically stay on the illustrated table.
  if (view === 'table' || !hasWebgl) {
    return (
      <section className="board-table-shell" style={style}>
        <BoardTable
          spaces={spaces}
          players={players}
          properties={properties}
          selectedSpaceId={selectedSpaceId}
          activeId={activeId}
          onSelectSpace={selectSpace}
          reducedMotion={reducedMotion}
        />
        <BoardStatusAnnouncer selectedSpace={selectedSpace} />
      </section>
    );
  }

  return (
    <section
      aria-label="Interactive Civic Fortune 3D board"
      style={{
        position: 'relative',
        width: '100%',
        minHeight: 540,
        overflow: 'hidden',
        borderRadius: 20,
        background: '#69cfe0',
        boxShadow: '0 12px 0 rgba(49,105,126,0.24), 0 26px 55px rgba(33,104,126,0.36), inset 0 0 0 3px rgba(255,250,209,0.72)',
        ...style,
      }}
    >
      <Canvas
        shadows={shadows}
        dpr={[1, 1.5]}
        camera={{ position: [0, 19.5, 22.5], fov: 41, near: 0.1, far: 100 }}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false, stencil: false }}
        frameloop={reducedMotion ? 'demand' : 'always'}
        onPointerMissed={() => {
          if (selectedSpaceIdProp === undefined) setLocalSelectedSpaceId(null);
        }}
        style={{ display: 'block', width: '100%', height: '100%', minHeight: 540, touchAction: 'none' }}
      >
        <Suspense fallback={<BoardCanvasLoadingScene />}>
          <BoardScene
            spaces={spaces}
            players={players}
            properties={properties}
            selectedSpaceId={selectedSpaceId}
            activeId={activeId}
            onSelectSpace={selectSpace}
            reducedMotion={reducedMotion}
            shadows={shadows}
          />
        </Suspense>
      </Canvas>
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 14,
          top: 13,
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          padding: '7px 10px',
          borderRadius: 999,
          color: '#2e566b',
          background: 'rgba(255, 252, 233, 0.84)',
          border: '2px solid rgba(255,255,255,0.74)',
          backdropFilter: 'blur(10px)',
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: '0.09em',
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4dc989', boxShadow: '0 0 12px #4dc989' }} />
        {players.length}/20 SEATS
      </div>
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          right: 14,
          bottom: 13,
          padding: '6px 9px',
          borderRadius: 8,
          color: '#416d80',
          background: 'rgba(255, 253, 238, 0.78)',
          border: '2px solid rgba(255,255,255,0.6)',
          backdropFilter: 'blur(8px)',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.06em',
        }}
      >
        DRAG TO EXPLORE · SCROLL TO ZOOM
      </div>
      <BoardStatusAnnouncer selectedSpace={selectedSpace} />
    </section>
  );
});

function BoardCanvasLoadingScene() {
  return (
    <>
      <color attach="background" args={['#6fd5dd']} />
      <hemisphereLight args={['#fff6c7', '#3196ae', 2.2]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[32, 32]} />
        <meshStandardMaterial color="#9be5cf" roughness={0.92} />
      </mesh>
      <mesh position={[0, 0.18, 0]}>
        <boxGeometry args={[20, 0.28, 20]} />
        <meshStandardMaterial color="#fff4c9" roughness={0.72} />
      </mesh>
    </>
  );
}

function BoardStatusAnnouncer({ selectedSpace }: { selectedSpace?: VisualSpace }) {
  return (
    <span
      aria-live="polite"
      style={{
        position: 'absolute',
        width: 1,
        height: 1,
        padding: 0,
        margin: -1,
        overflow: 'hidden',
        clip: 'rect(0, 0, 0, 0)',
        whiteSpace: 'nowrap',
        border: 0,
      }}
    >
      {selectedSpace ? `${selectedSpace.label} selected` : 'No board tile selected'}
    </span>
  );
}

export default Board3D;
