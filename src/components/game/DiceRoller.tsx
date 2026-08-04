import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

/** A resolved pair of standard six-sided dice. */
export type DiceResult = readonly [number, number]

export type DiceRollerProps = {
  /**
   * The authoritative dice result. Values outside 1–6 are safely clamped so
   * an incomplete realtime update never produces a broken die.
   */
  result?: DiceResult | null
  /**
   * Change this only when a new roll has been committed (an event id or game
   * version works well). A changed trigger begins a short visual roll.
   */
  trigger?: string | number | null
  /** Disables the rolling motion and immediately presents the final faces. */
  reducedMotion?: boolean
  /** Optional visual label; the accessible result is announced separately. */
  label?: string
  className?: string
}

type DieFace = 1 | 2 | 3 | 4 | 5 | 6

type DieStyle = CSSProperties & {
  '--dice-settle-x'?: string
  '--dice-settle-y'?: string
  '--dice-settle-z'?: string
  '--dice-roll-delay'?: string
  '--dice-roll-seed'?: string
}

const DEFAULT_RESULT: DiceResult = [1, 1]
const ROLL_DURATION_MS = 1_060
const SCRAMBLE_INTERVAL_MS = 92

/*
 * Each face is a real face of the same cube. CSS can use the settle variables
 * to rotate its .dice__cube toward the reported value instead of swapping
 * artwork at the end of a roll.
 */
const SETTLE_ROTATIONS: Record<DieFace, { x: string; y: string; z: string }> = {
  1: { x: '0deg', y: '0deg', z: '0deg' },
  2: { x: '-90deg', y: '0deg', z: '0deg' },
  3: { x: '0deg', y: '-90deg', z: '0deg' },
  4: { x: '0deg', y: '90deg', z: '0deg' },
  5: { x: '90deg', y: '0deg', z: '0deg' },
  6: { x: '0deg', y: '180deg', z: '0deg' },
}

const FACE_LAYOUT: ReadonlyArray<{ side: string; value: DieFace }> = [
  { side: 'front', value: 1 },
  { side: 'back', value: 6 },
  { side: 'right', value: 3 },
  { side: 'left', value: 4 },
  { side: 'top', value: 2 },
  { side: 'bottom', value: 5 },
]

const PIP_POSITIONS: Record<DieFace, readonly string[]> = {
  1: ['center'],
  2: ['top-left', 'bottom-right'],
  3: ['top-left', 'center', 'bottom-right'],
  4: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
  5: ['top-left', 'top-right', 'center', 'bottom-left', 'bottom-right'],
  6: ['top-left', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-right'],
}

function asFace(value: unknown): DieFace {
  const number = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 1
  return Math.min(6, Math.max(1, number)) as DieFace
}

function normaliseResult(result?: DiceResult | null): DiceResult {
  return [asFace(result?.[0]), asFace(result?.[1])]
}

function triggerSeed(trigger: DiceRollerProps['trigger']): number {
  if (typeof trigger === 'number' && Number.isFinite(trigger)) return Math.abs(Math.trunc(trigger)) || 1
  if (typeof trigger !== 'string') return 1

  let hash = 2_166_136_261
  for (let index = 0; index < trigger.length; index += 1) {
    hash ^= trigger.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return Math.abs(hash) || 1
}

function scrambledFaces(seed: number): DiceResult {
  // A deterministic scramble keeps both dice feeling lively without turning a
  // rerender into another random visual result.
  const first = ((seed * 1_103_515_245 + 12_345) >>> 0) % 6
  const second = ((seed * 214_013 + 2_531_011) >>> 0) % 6
  return [(first + 1) as DieFace, (second + 1) as DieFace]
}

function Die({ value, index, rolling, reducedMotion, seed }: {
  value: DieFace
  index: number
  rolling: boolean
  reducedMotion: boolean
  seed: number
}) {
  const rotation = SETTLE_ROTATIONS[value]
  const style: DieStyle = {
    '--dice-settle-x': rotation.x,
    '--dice-settle-y': rotation.y,
    '--dice-settle-z': rotation.z,
    '--dice-roll-delay': `${index * 74}ms`,
    '--dice-roll-seed': String(seed + index * 17),
  }

  return (
    <div
      className={`dice dice--${index + 1}${rolling ? ' dice--rolling' : ''}${reducedMotion ? ' dice--reduced-motion' : ''}`}
      data-face={value}
      style={style}
    >
      <div className="dice__cube">
        {FACE_LAYOUT.map((face) => (
          <div className={`dice__face dice__face--${face.side}`} data-value={face.value} key={face.side}>
            {PIP_POSITIONS[face.value].map((position) => (
              <span className={`dice__pip dice__pip--${position}`} key={position} />
            ))}
          </div>
        ))}
      </div>
      <span className="dice__shadow" />
    </div>
  )
}

/**
 * Presentational two-die renderer. It does not roll or choose dice values:
 * those continue to come from the authoritative game action on the server.
 *
 * Required styling hooks:
 * `.dice-roller`, `.dice-roller__stage`, `.dice`, `.dice__cube`,
 * `.dice__face--front|back|right|left|top|bottom`, `.dice__pip`, and
 * `.dice__shadow`. The cube exposes `--dice-settle-x/y/z`,
 * `--dice-roll-delay`, and `--dice-roll-seed` for smooth CSS animation.
 */
export function DiceRoller({
  result,
  trigger,
  reducedMotion = false,
  label = 'City dice',
  className = '',
}: DiceRollerProps) {
  const resultKey = `${result?.[0] ?? 1}:${result?.[1] ?? 1}`
  const resolvedResult = useMemo(() => normaliseResult(result ?? DEFAULT_RESULT), [resultKey])
  const [visibleResult, setVisibleResult] = useState<DiceResult>(resolvedResult)
  const [rolling, setRolling] = useState(false)
  const latestResultRef = useRef<DiceResult>(resolvedResult)
  const rollingRef = useRef(false)
  const didMountRef = useRef(false)
  const lastTriggerRef = useRef<DiceRollerProps['trigger']>(trigger)
  const seedRef = useRef(triggerSeed(trigger))

  useEffect(() => {
    latestResultRef.current = resolvedResult
    if (!rollingRef.current) setVisibleResult(resolvedResult)
  }, [resolvedResult])

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true
      lastTriggerRef.current = trigger
      return
    }

    const changed = !Object.is(lastTriggerRef.current, trigger)
    if (!changed) {
      // If a user enables reduced motion in the middle of a roll, settle at
      // once instead of leaving a cancelled animation on screen.
      if (reducedMotion && rollingRef.current) {
        rollingRef.current = false
        setRolling(false)
        setVisibleResult(latestResultRef.current)
      }
      return
    }

    lastTriggerRef.current = trigger
    seedRef.current = triggerSeed(trigger)

    if (reducedMotion) {
      rollingRef.current = false
      setRolling(false)
      setVisibleResult(latestResultRef.current)
      return
    }

    rollingRef.current = true
    setRolling(true)
    let tick = 0
    setVisibleResult(scrambledFaces(seedRef.current))

    const interval = window.setInterval(() => {
      tick += 1
      setVisibleResult(scrambledFaces(seedRef.current + tick * 101))
    }, SCRAMBLE_INTERVAL_MS)

    const settle = window.setTimeout(() => {
      rollingRef.current = false
      setRolling(false)
      setVisibleResult(latestResultRef.current)
    }, ROLL_DURATION_MS)

    return () => {
      window.clearInterval(interval)
      window.clearTimeout(settle)
    }
  }, [trigger, reducedMotion])

  const total = visibleResult[0] + visibleResult[1]
  const rootClassName = `dice-roller${rolling ? ' dice-roller--rolling' : ''}${reducedMotion ? ' dice-roller--reduced-motion' : ''}${className ? ` ${className}` : ''}`
  const announcement = rolling
    ? `${label}: rolling two dice.`
    : `${label}: ${visibleResult[0]} and ${visibleResult[1]}, total ${total}.`

  return (
    <div className={rootClassName} role="status" aria-live="polite" aria-atomic="true">
      <span className="dice-roller__label" aria-hidden="true">{label}</span>
      <div className="dice-roller__stage" aria-hidden="true">
        <Die value={visibleResult[0] as DieFace} index={0} rolling={rolling} reducedMotion={reducedMotion} seed={seedRef.current} />
        <Die value={visibleResult[1] as DieFace} index={1} rolling={rolling} reducedMotion={reducedMotion} seed={seedRef.current} />
      </div>
      <span className="sr-only">{announcement}</span>
    </div>
  )
}
