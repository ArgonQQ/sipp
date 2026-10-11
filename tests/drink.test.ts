import { expect, mock, test } from 'claude-code/testing'

import { plan, settingsFrom } from '../hooks/hydration'

const settings = settingsFrom({ dailyGoalMl: 2000, sipMl: 250, dayStartHour: 8, dayEndHour: 21 })
const at = (hour: number, minute = 0) => Date.UTC(2026, 9, 11, hour, minute)

const BAND = {
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 9 },
    view: {},
  },
} as const

test('the first glass is due when the day starts', () => {
  const { view, shouldNag } = plan(undefined, settings, at(8), 0)
  expect(view.isDue).toBe(true)
  expect(shouldNag).toBe(true)
})

test('the goal is spread evenly over the rest of the day', () => {
  const ledger = { day: '2026-10-11', drankMl: 250, lastDrinkAt: at(8), snoozeUntil: 0, lastNagAt: 0, nags: 0 }
  const { view } = plan(ledger, settings, at(8, 1), 0)
  expect(view.isDue).toBe(false)
  expect(view.nextInMin).toBe(111)
})

test('nobody is nagged before the day starts or once the goal is met', () => {
  expect(plan(undefined, settings, at(6), 0).view.isOffDuty).toBe(true)
  const done = { day: '2026-10-11', drankMl: 2000, lastDrinkAt: at(15), snoozeUntil: 0, lastNagAt: 0, nags: 0 }
  expect(plan(done, settings, at(16), 0).shouldNag).toBe(false)
})

test('a new day starts from zero', () => {
  const yesterday = { day: '2026-10-10', drankMl: 1500, lastDrinkAt: at(-5), snoozeUntil: 0, lastNagAt: 0, nags: 2 }
  expect(plan(yesterday, settings, at(12), 0).ledger.drankMl).toBe(0)
})

test('pressing the glass button logs a glass', async ($, on) => {
  mock.clock(on, { now: at(12) })
  mock.store(on)
  const toasts: string[] = []
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  await $.command.run({
    command: 'drink',
    args: '500',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 120 },
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'drink-with-me', surface, ...BAND })
    await ui.press({ key: 'drink' })
    await ui.unmount()
  }
  const ui = await $.ui.mount({ plugin: 'drink-with-me', surface: 'terminal', ...BAND })
  expect((await ui.find({ type: 'Text', text: /ml/ }))?.text).toContain('1000/2000 ml')
  expect(toasts.length).toBe(3)
})
