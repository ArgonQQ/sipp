export type Hydration = {
  drankMl: number
  goalMl: number
  sipMl: number
  expectedMl: number
  nextInMin: number
  isDue: boolean
  isOffDuty: boolean
  line: string
}

declare module 'claude-code' {
  interface PluginState {
    'drink-with-me': { view: Hydration | null }
  }
}
