import type { Hydration } from '../types'

export type Settings = {
  goalMl: number
  sipMl: number
  startHour: number
  endHour: number
}

export type Ledger = {
  day: string
  drankMl: number
  lastDrinkAt: number
  snoozeUntil: number
  lastNagAt: number
  nags: number
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const MIN_GAP = 20 * MINUTE
export const NAG_EVERY = 15 * MINUTE
export const SNOOZE = 15 * MINUTE

const NAGS = [
  [
    "Hydration o'clock. Your cells have filed a formal complaint.",
    "You're ~60% water. Currently trending toward beef jerky.",
    'Water. The clear stuff. No, coffee does not count, nice try.',
    'Your brain is 75% water and, judging by that last commit, running low.',
  ],
  [
    'Still nothing? Bold strategy for a sack of mostly water.',
    'I asked nicely. I am now asking slightly less nicely.',
    'The glass is right there. It has no legs. You have two.',
  ],
  [
    "I've seen houseplants with better self-care routines.",
    'Your kidneys just opened a support group. You are the topic.',
    'Shipping features while slowly turning into a raisin. Iconic.',
  ],
  [
    "At this point I'm just narrating your decline.",
    "Fine. Don't drink. I'll tell the cactus it won.",
    'Dehydration speedrun, any%. New personal best, congrats.',
  ],
]

const CHEERS = [
  'Wow. A glass of water. Someone alert the press.',
  'Your kidneys send their lukewarm regards.',
  'Look at you, doing the bare minimum biology requires.',
  'One small sip for you, one giant leap for your urine color.',
  'Gold star. Not a real one. Stars are not hydrating.',
]

const DONE = [
  "Goal reached. Don't let it go to your head. Or your bladder.",
  'Daily quota met. You may now return to ignoring your posture.',
  'Fully hydrated. Your organs are as shocked as I am.',
]

const OFF_DUTY = [
  "Off duty. Even I don't nag at this hour. I have boundaries.",
  'Reminders are asleep. Maybe consider copying them.',
]

const WAITING = [
  'Enjoy the silence while it lasts.',
  "I'm watching. Quietly. Judgingly.",
  "You're fine. For now.",
]

const BEHIND = [
  'You are behind schedule. Shocking absolutely no one.',
  'Behind schedule. The desert called, it wants its vibe back.',
]

export const pick = (list: readonly string[], seed: number) =>
  list[Math.abs(Math.floor(seed)) % list.length] ?? ''

export const nagLine = (nags: number, seed: number) =>
  pick(NAGS[Math.min(nags, NAGS.length - 1)] ?? [], seed)

export const cheerLine = (seed: number) => pick(CHEERS, seed)

export const settingsFrom = (options: Readonly<Record<string, unknown>>): Settings => {
  const num = (key: string, fallback: number) => {
    const value = Number(options[key])
    return Number.isFinite(value) ? value : fallback
  }
  const startHour = Math.min(23, Math.max(0, Math.floor(num('dayStartHour', 8))))
  const endHour = Math.min(24, Math.max(startHour + 1, Math.floor(num('dayEndHour', 21))))

  return {
    goalMl: Math.max(100, num('dailyGoalMl', 2000)),
    sipMl: Math.max(50, num('sipMl', 250)),
    startHour,
    endHour,
  }
}

const localDay = (now: number, offsetMin: number) => {
  const local = new Date(now + offsetMin * MINUTE)
  const midnight =
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - offsetMin * MINUTE

  return { day: local.toISOString().slice(0, 10), midnight }
}

export const emptyLedger = (day: string): Ledger => ({
  day,
  drankMl: 0,
  lastDrinkAt: 0,
  snoozeUntil: 0,
  lastNagAt: 0,
  nags: 0,
})

export const forToday = (ledger: Ledger | undefined, now: number, offsetMin: number): Ledger => {
  const { day } = localDay(now, offsetMin)
  return ledger?.day === day ? ledger : emptyLedger(day)
}

/**
 * Spreads what is left of the goal evenly over what is left of the day, so a
 * slow morning shortens the gaps instead of piling it all into the evening.
 */
export const plan = (
  stored: Ledger | undefined,
  settings: Settings,
  now: number,
  offsetMin: number,
): { ledger: Ledger; view: Hydration; shouldNag: boolean } => {
  const ledger = forToday(stored, now, offsetMin)
  const { midnight } = localDay(now, offsetMin)
  const windowStart = midnight + settings.startHour * HOUR
  const windowEnd = midnight + settings.endHour * HOUR
  const seed = now / MINUTE
  const dayProgress = Math.min(1, Math.max(0, (now - windowStart) / (windowEnd - windowStart)))
  const expectedMl = Math.round(settings.goalMl * dayProgress)
  const base = {
    drankMl: ledger.drankMl,
    goalMl: settings.goalMl,
    sipMl: settings.sipMl,
    expectedMl,
    nextInMin: 0,
    isDue: false,
    isOffDuty: false,
  }
  const remaining = settings.goalMl - ledger.drankMl

  if (remaining <= 0) {
    return { ledger, view: { ...base, line: pick(DONE, ledger.day.length + ledger.drankMl) }, shouldNag: false }
  }
  if (now < windowStart || now >= windowEnd) {
    return { ledger, view: { ...base, isOffDuty: true, line: pick(OFF_DUTY, seed / 60) }, shouldNag: false }
  }

  const sipsLeft = Math.ceil(remaining / settings.sipMl)
  const dueAt =
    ledger.lastDrinkAt < windowStart
      ? Math.max(windowStart, ledger.snoozeUntil)
      : Math.max(
          ledger.lastDrinkAt + Math.max(MIN_GAP, (windowEnd - ledger.lastDrinkAt) / sipsLeft),
          ledger.snoozeUntil,
        )
  const isDue = now >= dueAt
  const isBehind = ledger.drankMl + settings.sipMl < expectedMl
  const line = isDue
    ? nagLine(ledger.nags, seed)
    : isBehind
      ? pick(BEHIND, seed)
      : pick(WAITING, seed / 10)

  return {
    ledger,
    view: { ...base, isDue, nextInMin: isDue ? 0 : Math.ceil((dueAt - now) / MINUTE), line },
    shouldNag: isDue && now - ledger.lastNagAt >= NAG_EVERY,
  }
}
