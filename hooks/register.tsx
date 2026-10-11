import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Hydration } from '../types'
import {
  SNOOZE,
  cheerLine,
  forToday,
  nagLine,
  plan,
  settingsFrom,
  type Ledger,
  type Settings,
} from './hydration'

const view = atom({ plugin: 'drink-with-me', key: 'view' } as const, null as Hydration | null)
const LEDGER = 'ledger'

let settings: Settings = settingsFrom({})
let notifies = false
let offsetMin = -new Date().getTimezoneOffset()

const parseOffset = (text: string) => {
  const match = /([+-])(\d{2})(\d{2})/.exec(text)
  if (!match) return undefined
  const minutes = Number(match[2]) * 60 + Number(match[3])
  return match[1] === '-' ? -minutes : minutes
}

const bar = (drank: number, goal: number, width = 10) => {
  const filled = Math.min(width, Math.round((drank / goal) * width))
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

async function load($: EngineInterface) {
  return (await $.store.get(LEDGER)) as Ledger | undefined
}

async function refresh($: EngineInterface) {
  const now = await $.clock.now()
  const planned = plan(await load($), settings, now, offsetMin)
  let ledger = planned.ledger

  if (planned.shouldNag) {
    const text = `💧 ${nagLine(ledger.nags, now / 60_000)}`
    ledger = { ...ledger, lastNagAt: now, nags: ledger.nags + 1 }
    $.ui.toast(text, { timeoutMs: 12_000 })
    if (notifies) await $.ui.notify(text, { title: 'Drink with me' }).catch(() => undefined)
  }
  await $.store.set(LEDGER, ledger)
  await update($, view, () => planned.view)
}

async function drink($: EngineInterface, ml: number) {
  const now = await $.clock.now()
  const ledger = forToday(await load($), now, offsetMin)
  await $.store.set(LEDGER, {
    ...ledger,
    drankMl: Math.max(0, ledger.drankMl + ml),
    lastDrinkAt: ml > 0 ? now : ledger.lastDrinkAt,
    snoozeUntil: 0,
    nags: 0,
  })
  if (ml > 0) $.ui.toast(`💧 ${cheerLine(now / 1000)}`)
  await refresh($)
}

async function snooze($: EngineInterface) {
  const now = await $.clock.now()
  const ledger = forToday(await load($), now, offsetMin)
  await $.store.set(LEDGER, { ...ledger, snoozeUntil: now + SNOOZE, lastNagAt: now })
  $.ui.toast('💧 Snoozed 15 min. Procrastinating on breathing next?')
  await refresh($)
}

export const register: Register = (on, options) => {
  settings = settingsFrom(options)
  notifies = options.nativeNotifications === true

  on('session.start', async ($, e, next) => {
    try {
      const date = await $.process.run(['date', '+%z'])
      offsetMin = parseOffset(date.stdout) ?? offsetMin
    } catch {}
    await $.command.register({
      name: 'drink',
      description: 'Log water you drank (default one glass; negative to undo)',
      argumentHint: '[ml]',
      immediate: true,
    })
    await refresh($)
    $.clock.every(60_000, () => refresh($))

    return next(e)
  })

  on('command.run', { command: 'drink' }, async ($, e) => {
    const typed = Number.parseInt(e.args.trim(), 10)
    await drink($, Number.isFinite(typed) ? typed : settings.sipMl)

    return {}
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const state = await read($, view)
    if (e.props.hasSurvey || state === null) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const isDone = state.drankMl >= state.goalMl
    const when = isDone
      ? 'done for today'
      : state.isOffDuty
        ? 'off duty'
        : state.isDue
          ? 'DRINK NOW'
          : `next glass in ${state.nextInMin}m`

    return (
      <Box flexDirection="column">
        <Box gap={1}>
          <Text color={state.isDue ? 'red' : 'cyan'}>
            💧 {bar(state.drankMl, state.goalMl)} {state.drankMl}/{state.goalMl} ml
          </Text>
          <Text bold={state.isDue} dimColor={!state.isDue}>
            · {when}
          </Text>
          <Button
            key="drink"
            hotkey="d"
            variant={state.isDue ? 'primary' : undefined}
            label={`+${state.sipMl} ml`}
            onPress={() => drink($, state.sipMl)}
          />
          {state.isDue && <Button key="snooze" hotkey="s" label="Snooze 15m" onPress={() => snooze($)} />}
        </Box>
        <Text italic dimColor={!state.isDue} wrap="truncate-end">
          {state.line}
        </Text>
      </Box>
    )
  })
}
