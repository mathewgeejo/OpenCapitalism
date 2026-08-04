import { Billboard, OrbitControls, RoundedBox, Text } from '@react-three/drei';
import { Canvas, type ThreeEvent, useFrame } from '@react-three/fiber';
import { memo, useCallback, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Group } from 'three';
import type { GameState, PublicGameState } from '../../game/types';
import { BOARD } from '../../game/board';

/**
 * The renderer deliberately consumes the public portion of GameState only.  The
 * small adapters below accept a few equivalent public field names so that an old
 * snapshot can still be displayed while a realtime client is catching up.
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
  /** Stops token bobbing and keeps the camera static without sacrificing context. */
  reducedMotion?: boolean;
  /** Enables expensive canvas shadows on capable devices. */
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

const PLAYER_COLORS = [
  '#ff6b65',
  '#4cc9f0',
  '#ffd166',
  '#80ed99',
  '#c77dff',
  '#f9844a',
  '#5eead4',
  '#fb7185',
  '#a3e635',
  '#60a5fa',
  '#f9a8d4',
  '#facc15',
  '#67e8f9',
  '#c4b5fd',
  '#fdba74',
  '#86efac',
  '#fda4af',
  '#93c5fd',
  '#d8b4fe',
  '#bef264',
];

const SPACE_COLORS: Record<string, string> = {
  district: '#334155',
  property: '#334155',
  parcel: '#334155',
  transit: '#0f766e',
  route: '#0f766e',
  works: '#2563eb',
  utility: '#2563eb',
  event: '#7c3aed',
  civic: '#ea580c',
  levy: '#be123c',
  tax: '#be123c',
  corner: '#0369a1',
  start: '#0369a1',
  detention: '#7f1d1d',
  rest: '#15803d',
  jackpot: '#b45309',
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

  return rawSpaces.slice(0, 52).map((value, position) => {
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
  const sources = [
    snapshot.properties,
    snapshot.propertyStates,
    snapshot.assets,
    snapshot.ownership,
  ];

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

function layoutForSpace(index: number): BoardLayout {
  const position = ((index % 52) + 52) % 52;
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
  return [
    (col - (columns - 1) / 2) * spreadX,
    (row - 1) * spreadZ,
  ];
}

function tablePlacement(index: number): { gridColumn: number; gridRow: number } {
  const position = ((index % 52) + 52) % 52;
  if (position === 0) return { gridColumn: 14, gridRow: 14 };
  if (position <= 12) return { gridColumn: 14 - position, gridRow: 14 };
  if (position === 13) return { gridColumn: 1, gridRow: 14 };
  if (position <= 25) return { gridColumn: 1, gridRow: 14 - (position - 13) };
  if (position === 26) return { gridColumn: 1, gridRow: 1 };
  if (position <= 38) return { gridColumn: position - 25, gridRow: 1 };
  if (position === 39) return { gridColumn: 14, gridRow: 1 };
  return { gridColumn: 14, gridRow: position - 38 };
}

function BuildingCluster({ count, tint }: { count: number; tint: string }) {
  if (count <= 0) return null;
  if (count >= 5) {
    return (
      <group position={[0, 0.31, -0.22]}>
        <mesh castShadow>
          <boxGeometry args={[0.34, 0.62, 0.34]} />
          <meshStandardMaterial color={tint} roughness={0.42} metalness={0.15} />
        </mesh>
        <mesh position={[0, 0.38, 0]} castShadow>
          <coneGeometry args={[0.28, 0.22, 4]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.38} />
        </mesh>
      </group>
    );
  }

  const positions: [number, number][] = [
    [-0.18, -0.12],
    [0.18, -0.12],
    [-0.18, 0.18],
    [0.18, 0.18],
  ];

  return (
    <group position={[0, 0.28, -0.22]}>
      {positions.slice(0, count).map(([x, z], index) => (
        <mesh key={index} position={[x, 0, z]} castShadow>
          <boxGeometry args={[0.17, 0.2, 0.16]} />
          <meshStandardMaterial color={tint} roughness={0.55} />
        </mesh>
      ))}
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

  useFrame(({ clock }) => {
    if (!token.current || reducedMotion) return;
    token.current.position.y = 0.42 + Math.sin(clock.elapsedTime * 2.2 + x * 3 + z) * 0.045 + (active ? 0.035 : 0);
    token.current.rotation.y = Math.sin(clock.elapsedTime * 0.85 + x) * 0.1;
  });

  return (
    <group ref={token} position={[x, 0.42 + (active ? 0.035 : 0), z]}>
      {active && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.34, 0]}>
          <ringGeometry args={[0.19, 0.28, 24]} />
          <meshBasicMaterial color="#fef08a" transparent opacity={0.95} />
        </mesh>
      )}
      <mesh castShadow>
        <cylinderGeometry args={[0.16, 0.21, 0.16, 20]} />
        <meshStandardMaterial color={player.color} roughness={0.28} metalness={0.25} emissive={active ? player.color : '#000000'} emissiveIntensity={active ? 0.25 : 0} />
      </mesh>
      <mesh position={[0, 0.14, 0]} castShadow>
        <sphereGeometry args={[0.14, 20, 16]} />
        <meshStandardMaterial color={player.color} roughness={0.25} metalness={0.16} />
      </mesh>
    </group>
  );
}

function BoardTile({
  space,
  selected,
  owner,
  ownerColor,
  buildings,
  mortgaged,
  onSelect,
}: {
  space: VisualSpace;
  selected: boolean;
  owner?: VisualPlayer;
  ownerColor?: string;
  buildings: number;
  mortgaged: boolean;
  onSelect: (event: ThreeEvent<MouseEvent>) => void;
}) {
  const layout = layoutForSpace(space.index);
  const tint = tileColor(space);
  const fontSize = layout.corner ? 0.24 : 0.17;
  const subtitle = space.price ? `¤${space.price}` : space.kind.replace(/(^|[-_ ])\w/g, (letter) => letter.toUpperCase());

  return (
    <group position={[layout.x, 0.05, layout.z]} rotation={[0, layout.rotation, 0]}>
      <RoundedBox
        args={[layout.width * 0.94, 0.22, layout.depth * 0.92]}
        radius={0.075}
        smoothness={4}
        castShadow
        receiveShadow
        onClick={onSelect}
        onPointerOver={(event) => {
          event.stopPropagation();
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          document.body.style.cursor = 'default';
        }}
      >
        <meshStandardMaterial color={tint} roughness={0.48} metalness={0.12} emissive={selected ? tint : '#000000'} emissiveIntensity={selected ? 0.48 : 0} />
      </RoundedBox>

      {selected && (
        <mesh position={[0, 0.145, 0]}>
          <boxGeometry args={[layout.width * 0.98, 0.028, layout.depth * 0.97]} />
          <meshBasicMaterial color="#fef08a" transparent opacity={0.48} />
        </mesh>
      )}

      {owner && ownerColor && (
        <mesh position={[0, 0.18, layout.depth * 0.33]}>
          <boxGeometry args={[layout.width * 0.78, 0.08, 0.11]} />
          <meshStandardMaterial color={ownerColor} emissive={ownerColor} emissiveIntensity={0.12} />
        </mesh>
      )}

      {mortgaged && (
        <mesh position={[0, 0.19, -layout.depth * 0.32]}>
          <boxGeometry args={[layout.width * 0.76, 0.055, 0.1]} />
          <meshStandardMaterial color="#fef3c7" emissive="#f59e0b" emissiveIntensity={0.34} />
        </mesh>
      )}

      <Text
        position={[0, 0.175, layout.corner ? -0.1 : 0.02]}
        rotation={[-Math.PI / 2, 0, 0]}
        anchorX="center"
        anchorY="middle"
        color="#f8fafc"
        fontSize={fontSize}
        maxWidth={Math.max(0.72, layout.width * 0.78)}
        lineHeight={0.92}
        textAlign="center"
        outlineWidth={0.008}
        outlineColor="#0f172a"
      >
        {space.label}
      </Text>
      {!layout.corner && (
        <Text
          position={[0, 0.178, -layout.depth * 0.26]}
          rotation={[-Math.PI / 2, 0, 0]}
          anchorX="center"
          anchorY="middle"
          color="rgba(255,255,255,0.78)"
          fontSize={0.105}
          maxWidth={layout.width * 0.7}
        >
          {subtitle}
        </Text>
      )}
      <BuildingCluster count={buildings} tint={ownerColor ?? '#e2e8f0'} />
    </group>
  );
}

function MiniatureCity() {
  return (
    <group>
      <RoundedBox args={[14.2, 0.18, 14.2]} radius={0.24} smoothness={4} position={[0, -0.05, 0]} receiveShadow>
        <meshStandardMaterial color="#182335" roughness={0.72} />
      </RoundedBox>

      <mesh position={[0, 0.055, 0]} receiveShadow>
        <planeGeometry args={[11.4, 11.4]} />
        <meshStandardMaterial color="#24344c" roughness={0.88} />
      </mesh>
      <mesh position={[0, 0.063, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
        <planeGeometry args={[6.1, 6.1]} />
        <meshStandardMaterial color="#164e63" roughness={0.64} metalness={0.08} />
      </mesh>

      {CITY_BLOCKS.map(([x, z, width, depth, color], index) => (
        <group key={index} position={[x, 0.08, z]}>
          <mesh receiveShadow>
            <boxGeometry args={[width, 0.08, depth]} />
            <meshStandardMaterial color="#0f172a" roughness={0.8} />
          </mesh>
          <mesh position={[width * 0.16, 0.23 + (index % 3) * 0.06, depth * -0.08]} castShadow>
            <boxGeometry args={[Math.min(0.45, width * 0.34), 0.32 + (index % 3) * 0.12, Math.min(0.42, depth * 0.34)]} />
            <meshStandardMaterial color={color} roughness={0.5} metalness={0.16} />
          </mesh>
          <mesh position={[width * -0.18, 0.17, depth * 0.14]} castShadow>
            <boxGeometry args={[Math.min(0.36, width * 0.28), 0.22, Math.min(0.34, depth * 0.28)]} />
            <meshStandardMaterial color="#e2e8f0" roughness={0.58} />
          </mesh>
        </group>
      ))}

      <Billboard position={[0, 0.12, 0]} follow lockX={false} lockY={false} lockZ={false}>
        <Text color="#e0f2fe" fontSize={0.74} anchorX="center" anchorY="middle" outlineWidth={0.016} outlineColor="#0f172a">
          CIVIC FORTUNE
        </Text>
        <Text position={[0, -0.48, 0]} color="#94a3b8" fontSize={0.18} anchorX="center" anchorY="middle">
          A CITY OF CHOICES
        </Text>
      </Billboard>
    </group>
  );
}

function BoardScene({
  spaces,
  players,
  properties,
  selectedSpaceId,
  activeId,
  onSelectSpace,
  reducedMotion,
}: {
  spaces: VisualSpace[];
  players: VisualPlayer[];
  properties: Map<string, PropertyVisualState>;
  selectedSpaceId: string | null;
  activeId?: string;
  onSelectSpace: (spaceId: string) => void;
  reducedMotion: boolean;
}) {
  const playersBySpace = useMemo(() => {
    const map = new Map<number, VisualPlayer[]>();
    players.filter((player) => !player.isBankrupt).forEach((player) => {
      const position = ((player.position % 52) + 52) % 52;
      map.set(position, [...(map.get(position) ?? []), player]);
    });
    return map;
  }, [players]);

  const playerById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);

  const handleSpaceClick = useCallback((spaceId: string, event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelectSpace(spaceId);
  }, [onSelectSpace]);

  return (
    <>
      <color attach="background" args={['#07101f']} />
      <fog attach="fog" args={['#07101f', 20, 40]} />
      <hemisphereLight args={['#dbeafe', '#091323', 1.45]} />
      <directionalLight position={[8, 14, 7]} intensity={2.15} color="#fff7ed" castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
      <pointLight position={[-8, 5, -4]} color="#38bdf8" intensity={16} distance={17} />
      <pointLight position={[8, 4, 8]} color="#f59e0b" intensity={9} distance={13} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.18, 0]} receiveShadow>
        <planeGeometry args={[44, 44]} />
        <meshStandardMaterial color="#050b16" roughness={0.97} />
      </mesh>

      <MiniatureCity />

      {spaces.map((space) => {
        const property = properties.get(space.id) ?? properties.get(String(space.index));
        const owner = property?.ownerId ? playerById.get(property.ownerId) : undefined;
        return (
          <BoardTile
            key={space.id}
            space={space}
            selected={space.id === selectedSpaceId}
            owner={owner}
            ownerColor={owner?.color}
            buildings={property?.buildings ?? 0}
            mortgaged={property?.mortgaged ?? false}
            onSelect={(event) => handleSpaceClick(space.id, event)}
          />
        );
      })}

      {spaces.map((space) => {
        const layout = layoutForSpace(space.index);
        return (playersBySpace.get(((space.index % 52) + 52) % 52) ?? []).map((player, slot) => {
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
        minDistance={18}
        maxDistance={30}
        minPolarAngle={0.48}
        maxPolarAngle={1.22}
        minAzimuthAngle={-0.82}
        maxAzimuthAngle={0.82}
        enablePan={false}
        enableDamping={!reducedMotion}
        dampingFactor={0.08}
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
}: Omit<Parameters<typeof BoardScene>[0], 'reducedMotion'>) {
  const playerById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);
  const tokensByIndex = useMemo(() => {
    const map = new Map<number, VisualPlayer[]>();
    players.filter((player) => !player.isBankrupt).forEach((player) => {
      const index = ((player.position % 52) + 52) % 52;
      map.set(index, [...(map.get(index) ?? []), player]);
    });
    return map;
  }, [players]);

  return (
    <div
      aria-label="Civic Fortune board in table view"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(14, minmax(0, 1fr))',
        gridTemplateRows: 'repeat(14, minmax(0, 1fr))',
        gap: 2,
        width: '100%',
        minHeight: 480,
        padding: 10,
        borderRadius: 18,
        boxSizing: 'border-box',
        background: 'linear-gradient(145deg, #0e1a2d, #07101f)',
        boxShadow: 'inset 0 0 0 1px rgba(148, 163, 184, 0.2), 0 22px 60px rgba(2, 6, 23, 0.45)',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          gridColumn: '2 / 14',
          gridRow: '2 / 14',
          display: 'grid',
          placeItems: 'center',
          borderRadius: 12,
          background: 'radial-gradient(circle at 50% 45%, #1d4ed8 0%, #164e63 30%, #172554 70%)',
          color: '#e0f2fe',
          fontSize: 'clamp(0.9rem, 2vw, 1.7rem)',
          fontWeight: 800,
          letterSpacing: '0.16em',
          textAlign: 'center',
          pointerEvents: 'none',
        }}
      >
        CIVIC FORTUNE
      </div>
      {spaces.map((space) => {
        const property = properties.get(space.id) ?? properties.get(String(space.index));
        const owner = property?.ownerId ? playerById.get(property.ownerId) : undefined;
        const tokens = tokensByIndex.get(((space.index % 52) + 52) % 52) ?? [];
        const placement = tablePlacement(space.index);
        const selected = space.id === selectedSpaceId;
        return (
          <button
            key={space.id}
            type="button"
            onClick={() => onSelectSpace(space.id)}
            aria-pressed={selected}
            aria-label={`${space.label}${owner ? `, owned by ${owner.name}` : ''}${tokens.length ? `, ${tokens.length} player token${tokens.length === 1 ? '' : 's'}` : ''}`}
            style={{
              gridColumn: placement.gridColumn,
              gridRow: placement.gridRow,
              minWidth: 0,
              minHeight: 0,
              padding: 2,
              overflow: 'hidden',
              border: selected ? '2px solid #fef08a' : '1px solid rgba(255,255,255,0.18)',
              borderRadius: 5,
              color: '#f8fafc',
              background: tileColor(space),
              fontSize: 'clamp(0.36rem, 0.66vw, 0.67rem)',
              lineHeight: 1.05,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: owner ? `inset 0 -4px 0 ${owner.color}` : undefined,
            }}
          >
            <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>{space.label}</span>
            {property && property.buildings > 0 && <span aria-hidden="true" style={{ color: '#fef08a' }}>{property.buildings >= 5 ? '▰' : '▪'.repeat(property.buildings)}</span>}
            <span aria-hidden="true" style={{ display: 'flex', justifyContent: 'center', gap: 1, marginTop: 1 }}>
              {tokens.slice(0, 4).map((player) => (
                <i key={player.id} style={{ width: 5, height: 5, borderRadius: 99, display: 'block', background: player.color, boxShadow: player.id === activeId ? '0 0 0 1px #fef08a' : undefined }} />
              ))}
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
  view = '3d',
  reducedMotion = false,
  shadows = true,
  style,
}: Board3DProps) {
  const [localSelectedSpaceId, setLocalSelectedSpaceId] = useState<string | null>(null);
  const spaces = useMemo(normaliseBoard, []);
  const players = useMemo(() => normalisePlayers(game), [game]);
  const properties = useMemo(() => normaliseProperties(game, players), [game, players]);
  const activeId = useMemo(() => activePlayerId(game), [game]);
  const selectedSpaceId = selectedSpaceIdProp === undefined ? localSelectedSpaceId : selectedSpaceIdProp;

  const selectSpace = useCallback((spaceId: string) => {
    if (selectedSpaceIdProp === undefined) setLocalSelectedSpaceId(spaceId);
    onSelectSpace?.(spaceId);
  }, [onSelectSpace, selectedSpaceIdProp]);

  const selectedSpace = spaces.find((space) => space.id === selectedSpaceId);

  if (view === 'table') {
    return (
      <section style={{ width: '100%', ...style }}>
        <BoardTable
          spaces={spaces}
          players={players}
          properties={properties}
          selectedSpaceId={selectedSpaceId}
          activeId={activeId}
          onSelectSpace={selectSpace}
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
        minHeight: 520,
        overflow: 'hidden',
        borderRadius: 18,
        background: '#07101f',
        boxShadow: '0 22px 60px rgba(2, 6, 23, 0.45)',
        ...style,
      }}
    >
      <Canvas
        shadows={shadows}
        dpr={[1, 1.75]}
        camera={{ position: [0, 20.5, 20.5], fov: 42, near: 0.1, far: 100 }}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        frameloop={reducedMotion ? 'demand' : 'always'}
        onPointerMissed={() => {
          if (selectedSpaceIdProp === undefined) setLocalSelectedSpaceId(null);
        }}
        style={{ display: 'block', width: '100%', height: '100%', minHeight: 520, touchAction: 'none' }}
      >
        <BoardScene
          spaces={spaces}
          players={players}
          properties={properties}
          selectedSpaceId={selectedSpaceId}
          activeId={activeId}
          onSelectSpace={selectSpace}
          reducedMotion={reducedMotion}
        />
      </Canvas>
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 14,
          top: 13,
          padding: '6px 9px',
          borderRadius: 999,
          color: '#cbd5e1',
          background: 'rgba(7, 16, 31, 0.72)',
          border: '1px solid rgba(148,163,184,0.26)',
          backdropFilter: 'blur(8px)',
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: '0.09em',
        }}
      >
        {players.length}/20 SEATS
      </div>
      <BoardStatusAnnouncer selectedSpace={selectedSpace} />
    </section>
  );
});

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
