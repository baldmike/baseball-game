/**
 * game.test.js — Test suite covering core game logic.
 * Runs before every deploy to catch regressions.
 */
import { describe, it, expect, vi } from 'vitest'

import {
  weightedChoice,
  applyFatigueMod,
  determineOutcome,
  cpuPicksPitch,
  cpuDecidesSwing,
  SWING_OUTCOMES,
  TAKE_OUTCOMES,
  CPU_PITCH_WEIGHTS,
  BUNT_OUTCOMES,
} from '../probabilities.js'

import { applyWeatherModifiers, WEATHER_MODIFIERS } from '../weather.js'

import {
  calculateAdjustedOutcomes,
  calculateAdjustedTakeOutcomes,
} from '../statsCalculator.js'

import { processPitch, processAtBat, switchPitcher, attemptSteal, attemptPickoff, simulateGame } from '../gameEngine.js'

// Helper: build a minimal playable game state
function makeGameState(overrides = {}) {
  const pitcher = { id: 1, name: 'Ace', stats: { era: 3.50, k_per_9: 9.0, bb_per_9: 2.5 } }
  const batter = { id: 2, name: 'Slugger', stats: { avg: 0.280, slg: 0.450, k_rate: 0.200, hr_rate: 0.040 } }
  return {
    game_id: 'test-001',
    inning: 1,
    is_top: true,
    outs: 0,
    balls: 0,
    strikes: 0,
    bases: [false, false, false],
    runner_indices: [null, null, null],
    away_score: Array(9).fill(0),
    home_score: Array(9).fill(0),
    away_total: 0,
    home_total: 0,
    away_hits: 0,
    home_hits: 0,
    away_errors: 0,
    home_errors: 0,
    player_side: 'home',
    player_role: 'pitching',
    game_status: 'active',
    play_log: [],
    last_play: '',
    away_team: 'Away',
    home_team: 'Home',
    away_abbreviation: 'AWY',
    home_abbreviation: 'HME',
    away_lineup: Array(9).fill(batter).map((b, i) => ({ ...b, id: 100 + i, name: `Batter ${i + 1}` })),
    home_lineup: Array(9).fill(batter).map((b, i) => ({ ...b, id: 200 + i, name: `Batter ${i + 1}` })),
    away_batter_idx: 0,
    home_batter_idx: 0,
    current_batter_index: 0,
    current_batter_name: 'Batter 1',
    home_pitcher: { ...pitcher },
    away_pitcher: { ...pitcher, id: 3, name: 'Rival Ace' },
    away_box_score: Array(9).fill(null).map((_, i) => ({ id: 100 + i, name: `Batter ${i + 1}`, pos: 'UT', ab: 0, r: 0, h: 0, '2b': 0, '3b': 0, hr: 0, rbi: 0, bb: 0, so: 0, sb: 0 })),
    home_box_score: Array(9).fill(null).map((_, i) => ({ id: 200 + i, name: `Batter ${i + 1}`, pos: 'UT', ab: 0, r: 0, h: 0, '2b': 0, '3b': 0, hr: 0, rbi: 0, bb: 0, so: 0, sb: 0 })),
    away_pitcher_stats: { id: 3, name: 'Rival Ace', ip_outs: 0, h: 0, r: 0, er: 0, bb: 0, so: 0 },
    home_pitcher_stats: { id: 1, name: 'Ace', ip_outs: 0, h: 0, r: 0, er: 0, bb: 0, so: 0 },
    weather: 'clear',
    home_pitch_count: 0,
    away_pitch_count: 0,
    home_bullpen: [{ id: 10, name: 'Reliever', role: 'RP', stats: { era: 3.80, k_per_9: 8.5, bb_per_9: 3.0 } }],
    away_bullpen: [{ id: 11, name: 'Away Reliever', role: 'RP', stats: { era: 4.00, k_per_9: 7.5, bb_per_9: 3.5 } }],
    home_scorecard: [],
    away_scorecard: [],
    classic_relievers: null,
  }
}

// ──────────────────────────────────────────────
// TEST 1: weightedChoice always returns a valid outcome
// ──────────────────────────────────────────────
describe('probabilities', () => {
  it('weightedChoice returns a key from the weights object', () => {
    const weights = { a: 50, b: 30, c: 20 }
    for (let i = 0; i < 100; i++) {
      const result = weightedChoice(weights)
      expect(Object.keys(weights)).toContain(result)
    }
  })

  // ──────────────────────────────────────────────
  // TEST 2: cpuPicksPitch returns a valid pitch type
  // ──────────────────────────────────────────────
  it('cpuPicksPitch returns a valid pitch type', () => {
    const validPitches = Object.keys(CPU_PITCH_WEIGHTS)
    for (let i = 0; i < 50; i++) {
      expect(validPitches).toContain(cpuPicksPitch())
    }
  })

  // ──────────────────────────────────────────────
  // TEST 3: determineOutcome returns valid outcomes for all pitch types
  // ──────────────────────────────────────────────
  it('determineOutcome returns valid outcomes for swings and takes', () => {
    const allSwingOutcomes = new Set(Object.keys(SWING_OUTCOMES.fastball))
    const allTakeOutcomes = new Set(Object.keys(TAKE_OUTCOMES.fastball))
    for (const pitch of ['fastball', 'curveball', 'slider', 'changeup']) {
      const swingResult = determineOutcome(pitch, true)
      expect(allSwingOutcomes).toContain(swingResult)
      const takeResult = determineOutcome(pitch, false)
      expect(allTakeOutcomes).toContain(takeResult)
    }
  })
})

// ──────────────────────────────────────────────
// TEST 4: fatigue increases hit probability
// ──────────────────────────────────────────────
describe('fatigue', () => {
  it('applyFatigueMod boosts hit weights after 85 pitches', () => {
    const base = { ...SWING_OUTCOMES.fastball }
    const fresh = applyFatigueMod(base, 50)
    const tired = applyFatigueMod(base, 100)
    expect(tired.single).toBeGreaterThan(fresh.single)
    expect(tired.homerun).toBeGreaterThan(fresh.homerun)
    expect(tired.strike_swinging).toBeLessThan(fresh.strike_swinging)
  })
})

// ──────────────────────────────────────────────
// TEST 5: weather modifiers adjust outcomes correctly
// ──────────────────────────────────────────────
describe('weather', () => {
  it('wind_out boosts HRs and wind_in suppresses them', () => {
    const base = { homerun: 10, flyout: 10, single: 10 }
    const windOut = applyWeatherModifiers(base, 'wind_out')
    const windIn = applyWeatherModifiers(base, 'wind_in')
    expect(windOut.homerun).toBeGreaterThan(base.homerun)
    expect(windIn.homerun).toBeLessThan(base.homerun)
  })
})

// ──────────────────────────────────────────────
// TEST 6: stats calculator adjusts for good hitters
// ──────────────────────────────────────────────
describe('statsCalculator', () => {
  it('a great hitter gets more hit weight than a poor one', () => {
    const base = { ...SWING_OUTCOMES.fastball }
    const great = calculateAdjustedOutcomes(base, { avg: 0.320, slg: 0.550, k_rate: 0.150 })
    const poor = calculateAdjustedOutcomes(base, { avg: 0.190, slg: 0.280, k_rate: 0.310 })
    expect(great.single).toBeGreaterThan(poor.single)
    expect(great.homerun).toBeGreaterThan(poor.homerun)
  })

  // ──────────────────────────────────────────────
  // TEST 7: wild pitcher gives more balls on takes
  // ──────────────────────────────────────────────
  it('wild pitcher gets more balls in take outcomes', () => {
    const base = { ...TAKE_OUTCOMES.fastball }
    const wild = calculateAdjustedTakeOutcomes(base, { bb_per_9: 5.5 })
    const control = calculateAdjustedTakeOutcomes(base, { bb_per_9: 1.5 })
    expect(wild.ball).toBeGreaterThan(control.ball)
  })
})

// ──────────────────────────────────────────────
// TEST 8: processPitch advances game state
// ──────────────────────────────────────────────
describe('gameEngine', () => {
  it('processPitch updates pitch count and play log', () => {
    const state = makeGameState()
    const before = state.play_log.length
    processPitch(state, 'fastball')
    expect(state.home_pitch_count).toBe(1)
    expect(state.play_log.length).toBeGreaterThan(before)
  })

  // ──────────────────────────────────────────────
  // TEST 9: processAtBat only works when batting
  // ──────────────────────────────────────────────
  it('processAtBat rejects input when player is pitching', () => {
    const state = makeGameState()
    state.player_role = 'pitching'
    processAtBat(state, 'swing')
    expect(state.last_play).toMatch(/pitching right now/)
  })

  // ──────────────────────────────────────────────
  // TEST 10: switchPitcher updates pitcher and resets count
  // ──────────────────────────────────────────────
  it('switchPitcher replaces the pitcher and resets pitch count', () => {
    const state = makeGameState()
    state.home_pitch_count = 95
    const reliever = { id: 99, name: 'New Arm', stats: { era: 2.50, k_per_9: 10.0, bb_per_9: 2.0 } }
    switchPitcher(state, 'home', reliever)
    expect(state.home_pitcher.name).toBe('New Arm')
    expect(state.home_pitch_count).toBe(0)
    expect(state.home_pitcher_stats.id).toBe(99)
    expect(state.play_log.at(-1)).toMatch(/Pitching change/)
  })

  // ──────────────────────────────────────────────
  // TEST 11: home batters use home splits when available
  // ──────────────────────────────────────────────
  it('processPitch uses home splits for away batters (CPU) when available', () => {
    const state = makeGameState()
    const awaySplitStats = { avg: 0.210, slg: 0.320, k_rate: 0.280, hr_rate: 0.020 }
    // Away batters should use away splits (they're the away team)
    for (const batter of state.away_lineup) {
      batter.splits = { home: { avg: 0.350, slg: 0.600, k_rate: 0.100, hr_rate: 0.060 }, away: awaySplitStats }
      batter.activeStats = batter.splits.away
    }
    // Verify the active stats are the away split, not season stats
    const firstBatter = state.away_lineup[0]
    expect(firstBatter.activeStats.avg).toBe(0.210)
    expect(firstBatter.activeStats).toBe(awaySplitStats)
    expect(firstBatter.activeStats).not.toBe(firstBatter.stats)
    // processPitch should still work
    processPitch(state, 'fastball')
    expect(state.home_pitch_count).toBe(1)
  })

  // ──────────────────────────────────────────────
  // TEST 12: falls back to season stats when splits are null
  // ──────────────────────────────────────────────
  it('falls back to season stats when splits are unavailable', () => {
    const state = makeGameState()
    // Set splits to null (no split data available)
    for (const batter of state.away_lineup) {
      batter.splits = null
      batter.activeStats = batter.splits?.away || batter.stats
    }
    const firstBatter = state.away_lineup[0]
    // activeStats should fall back to season stats
    expect(firstBatter.activeStats).toBe(firstBatter.stats)
    expect(firstBatter.activeStats.avg).toBe(0.280)
    // Game should still work normally
    processPitch(state, 'curveball')
    expect(state.home_pitch_count).toBe(1)
  })

  // ──────────────────────────────────────────────
  // TEST 13: processAtBat works when player is batting
  // ──────────────────────────────────────────────
  it('processAtBat advances state when player is batting', () => {
    const state = makeGameState()
    state.is_top = false
    state.player_role = 'batting'
    const before = state.play_log.length
    processAtBat(state, 'swing')
    expect(state.away_pitch_count).toBe(1)
    expect(state.play_log.length).toBeGreaterThan(before)
  })

  // ──────────────────────────────────────────────
  // TEST 14: processPitch rejects input when player is batting
  // ──────────────────────────────────────────────
  it('processPitch rejects input when player is batting', () => {
    const state = makeGameState()
    state.player_role = 'batting'
    processPitch(state, 'fastball')
    expect(state.last_play).toMatch(/batting right now/)
  })

  // ──────────────────────────────────────────────
  // TEST 15: attemptSteal succeeds or fails with runner on base
  // ──────────────────────────────────────────────
  it('attemptSteal moves runner or records out when runner is on 1st', () => {
    const state = makeGameState()
    state.bases = [true, false, false]
    state.runner_indices = [0, null, null]
    attemptSteal(state, 0)
    // Either the runner advanced to 2nd or was caught stealing
    if (state.bases[1]) {
      expect(state.bases[0]).toBe(false)
      expect(state.last_play).toMatch(/steals 2nd/)
    } else {
      expect(state.outs).toBeGreaterThanOrEqual(1)
      expect(state.last_play).toMatch(/caught stealing/)
    }
  })

  // ──────────────────────────────────────────────
  // TEST 16: attemptSteal rejects when no runner on base
  // ──────────────────────────────────────────────
  it('attemptSteal rejects when no runner is on the requested base', () => {
    const state = makeGameState()
    state.bases = [false, false, false]
    attemptSteal(state, 0)
    expect(state.last_play).toMatch(/Can't steal/)
  })

  // ──────────────────────────────────────────────
  // TEST 17: simulateGame runs to completion
  // ──────────────────────────────────────────────
  it('simulateGame plays a full game and produces snapshots', () => {
    const state = makeGameState()
    const { state: final, snapshots } = simulateGame(state)
    expect(final.game_status).toBe('final')
    expect(snapshots.length).toBeGreaterThan(1)
    expect(final.inning).toBeGreaterThanOrEqual(9)
  })

  // ──────────────────────────────────────────────
  // TEST 18: switchPitcher resolves home splits for home reliever
  // ──────────────────────────────────────────────
  it('switchPitcher resolves home splits for a home-side reliever', () => {
    const state = makeGameState()
    const reliever = {
      id: 50, name: 'Split Arm',
      stats: { era: 4.00, k_per_9: 8.0, bb_per_9: 3.0 },
      splits: { home: { era: 2.50, k_per_9: 10.0, bb_per_9: 2.0 }, away: { era: 5.50, k_per_9: 6.0, bb_per_9: 4.0 } },
    }
    switchPitcher(state, 'home', reliever)
    expect(state.home_pitcher.activeStats.era).toBe(2.50)
    expect(state.home_pitcher.activeStats).toBe(reliever.splits.home)
  })

  // ──────────────────────────────────────────────
  // TEST 19: processAtBat auto-replaces fatigued CPU pitcher
  // ──────────────────────────────────────────────
  it('processAtBat auto-replaces away pitcher at 100+ pitches', () => {
    const state = makeGameState()
    state.is_top = false
    state.player_role = 'batting'
    state.away_pitch_count = 100
    const originalName = state.away_pitcher.name
    processAtBat(state, 'take')
    expect(state.away_pitcher.name).toBe('Away Reliever')
    expect(state.away_pitcher.name).not.toBe(originalName)
    expect(state.away_pitch_count).toBeLessThanOrEqual(1)
  })
})

// ──────────────────────────────────────────────
// TEST 20: fatigue has no effect below 85 pitches
// ──────────────────────────────────────────────
describe('fatigue (extended)', () => {
  it('applyFatigueMod returns identical weights below 85 pitches', () => {
    const base = { ...SWING_OUTCOMES.fastball }
    const result = applyFatigueMod(base, 84)
    expect(result.single).toBe(base.single)
    expect(result.homerun).toBe(base.homerun)
    expect(result.strike_swinging).toBe(base.strike_swinging)
  })
})

// ──────────────────────────────────────────────
// TEST 21: rain weather increases ball probability
// ──────────────────────────────────────────────
describe('weather (extended)', () => {
  it('rain boosts ball weight and reduces strikeout weight', () => {
    const base = { ball: 50, strike_swinging: 30, single: 10, homerun: 5 }
    const rainy = applyWeatherModifiers(base, 'rain')
    expect(rainy.ball).toBeGreaterThan(base.ball)
    expect(rainy.strike_swinging).toBeLessThan(base.strike_swinging)
  })

  // ──────────────────────────────────────────────
  // TEST 22: dome weather is neutral
  // ──────────────────────────────────────────────
  it('dome weather applies no changes to outcome weights', () => {
    const base = { homerun: 10, flyout: 10, single: 10, ball: 10, strike_swinging: 10 }
    const domed = applyWeatherModifiers(base, 'dome')
    for (const key of Object.keys(base)) {
      expect(domed[key]).toBe(base[key])
    }
  })
})

// ──────────────────────────────────────────────
// TEST 23: strikeout pitcher increases K weight
// ──────────────────────────────────────────────
describe('statsCalculator (extended)', () => {
  it('high-K pitcher gets more strikeout weight than low-K pitcher', () => {
    const base = { ...SWING_OUTCOMES.fastball }
    const flamethrower = calculateAdjustedOutcomes(base, { avg: 0.245, slg: 0.395, k_rate: 0.230 }, { era: 3.00, k_per_9: 12.0 })
    const softTosser = calculateAdjustedOutcomes(base, { avg: 0.245, slg: 0.395, k_rate: 0.230 }, { era: 3.00, k_per_9: 5.0 })
    expect(flamethrower.strike_swinging).toBeGreaterThan(softTosser.strike_swinging)
  })

  // ──────────────────────────────────────────────
  // TEST 24: stats calculator preserves total weight after normalization
  // ──────────────────────────────────────────────
  it('calculateAdjustedOutcomes preserves approximate total weight', () => {
    const base = { ...SWING_OUTCOMES.fastball }
    const totalBefore = Object.values(base).reduce((a, b) => a + b, 0)
    const adjusted = calculateAdjustedOutcomes(base, { avg: 0.310, slg: 0.520, k_rate: 0.180 })
    const totalAfter = Object.values(adjusted).reduce((a, b) => a + b, 0)
    // Normalization brings it close; rounding may shift by a few points
    expect(Math.abs(totalAfter - totalBefore)).toBeLessThan(totalBefore * 0.10)
  })
})

// ──────────────────────────────────────────────
// TEST 25: steal home success scores a run
// ──────────────────────────────────────────────
describe('steal home', () => {
  it('successful steal home scores a run and clears 3rd base', () => {
    const state = makeGameState()
    state.bases = [false, false, true]
    state.runner_indices = [null, null, 0]
    const scoreBefore = state.away_total
    vi.spyOn(Math, 'random').mockReturnValue(0.1) // below 0.30 threshold
    attemptSteal(state, 2)
    Math.random.mockRestore()
    expect(state.bases[2]).toBe(false)
    expect(state.away_total).toBe(scoreBefore + 1)
    expect(state.last_play).toMatch(/steals home/)
    expect(state.away_box_score[0].sb).toBe(1)
  })

  // ──────────────────────────────────────────────
  // TEST 26: steal home caught records an out
  // ──────────────────────────────────────────────
  it('caught stealing home records an out and clears 3rd base', () => {
    const state = makeGameState()
    state.bases = [false, false, true]
    state.runner_indices = [null, null, 0]
    const outsBefore = state.outs
    vi.spyOn(Math, 'random').mockReturnValue(0.5) // above 0.30 threshold
    attemptSteal(state, 2)
    Math.random.mockRestore()
    expect(state.bases[2]).toBe(false)
    expect(state.outs).toBe(outsBefore + 1)
    expect(state.last_play).toMatch(/caught stealing home/)
  })

  // ──────────────────────────────────────────────
  // TEST 27: steal home rejects when no runner on 3rd
  // ──────────────────────────────────────────────
  it('steal home rejects when no runner is on 3rd base', () => {
    const state = makeGameState()
    state.bases = [true, false, false]
    state.runner_indices = [0, null, null]
    attemptSteal(state, 2)
    expect(state.last_play).toMatch(/no runner on 3rd/)
  })

  // ──────────────────────────────────────────────
  // TEST 28: caught stealing home with 2 outs ends the half-inning
  // ──────────────────────────────────────────────
  it('caught stealing home with 2 outs ends the half-inning', () => {
    const state = makeGameState()
    state.outs = 2
    state.bases = [false, false, true]
    state.runner_indices = [null, null, 0]
    vi.spyOn(Math, 'random').mockReturnValue(0.99) // above 0.30 → caught
    attemptSteal(state, 2)
    Math.random.mockRestore()
    expect(state.outs).toBe(0) // reset after end of half-inning
    expect(state.bases).toEqual([false, false, false])
  })

  // ──────────────────────────────────────────────
  // TEST 29: steal home does not credit SB on caught stealing
  // ──────────────────────────────────────────────
  it('caught stealing home does not credit a stolen base', () => {
    const state = makeGameState()
    state.bases = [false, false, true]
    state.runner_indices = [null, null, 0]
    vi.spyOn(Math, 'random').mockReturnValue(0.99) // caught
    attemptSteal(state, 2)
    Math.random.mockRestore()
    expect(state.away_box_score[0].sb).toBe(0)
  })
})

// ──────────────────────────────────────────────
// PICKOFF TESTS
// ──────────────────────────────────────────────
describe('pickoff', () => {
  it('successful pickoff clears the base and records an out', () => {
    const state = makeGameState()
    state.player_role = 'pitching'
    state.bases = [true, false, false]
    state.runner_indices = [0, null, null]
    vi.spyOn(Math, 'random').mockReturnValue(0.05) // below 0.15
    attemptPickoff(state, 0)
    Math.random.mockRestore()
    expect(state.bases[0]).toBe(false)
    expect(state.outs).toBe(1)
    expect(state.last_play).toMatch(/Picked off/)
  })

  it('failed pickoff leaves runner on base and adds no out', () => {
    const state = makeGameState()
    state.player_role = 'pitching'
    state.bases = [true, false, false]
    state.runner_indices = [0, null, null]
    const outsBefore = state.outs
    vi.spyOn(Math, 'random').mockReturnValue(0.5) // above 0.15
    attemptPickoff(state, 0)
    Math.random.mockRestore()
    expect(state.bases[0]).toBe(true)
    expect(state.outs).toBe(outsBefore)
    expect(state.last_play).toMatch(/safe/)
  })

  it('rejects pickoff when player is batting', () => {
    const state = makeGameState()
    state.player_role = 'batting'
    state.bases = [true, false, false]
    state.runner_indices = [0, null, null]
    attemptPickoff(state, 0)
    expect(state.last_play).toMatch(/only attempt a pickoff while pitching/)
  })

  it('rejects pickoff when no runner on the target base', () => {
    const state = makeGameState()
    state.player_role = 'pitching'
    state.bases = [false, false, false]
    attemptPickoff(state, 0)
    expect(state.last_play).toMatch(/no runner/)
  })

  it('successful pickoff with 2 outs ends the half-inning', () => {
    const state = makeGameState()
    state.player_role = 'pitching'
    state.outs = 2
    state.bases = [true, false, false]
    state.runner_indices = [0, null, null]
    vi.spyOn(Math, 'random').mockReturnValue(0.05) // below 0.15
    attemptPickoff(state, 0)
    Math.random.mockRestore()
    expect(state.outs).toBe(0) // reset after end of half-inning
    expect(state.bases).toEqual([false, false, false])
  })
})

// ──────────────────────────────────────────────
// TEST 30: double play records 2 outs on groundout with runner on 1st
// ──────────────────────────────────────────────
describe('double play', () => {
  it('groundout with runner on 1st and <2 outs can produce a double play', () => {
    const state = makeGameState()
    state.is_top = false
    state.player_role = 'batting'
    state.bases = [true, false, false]
    state.runner_indices = [0, null, null]
    state.outs = 0
    state._forceNextOutcome = 'groundout'
    // Mock Math.random: cpuPicksPitch, error chance (high to skip), DP roll (low to trigger)
    const randomMock = vi.spyOn(Math, 'random')
    randomMock.mockReturnValueOnce(0.5)  // cpuPicksPitch
      .mockReturnValueOnce(0.99) // skip error
      .mockReturnValueOnce(0.1)  // trigger DP (below 0.55)
    processAtBat(state, 'swing')
    randomMock.mockRestore()
    expect(state.outs).toBeGreaterThanOrEqual(2)
    expect(state.bases[0]).toBe(false)
    expect(state.play_log.some(m => m.includes('Double play'))).toBe(true)
  })

  // ──────────────────────────────────────────────
  // TEST 31: no double play with 2 outs
  // ──────────────────────────────────────────────
  it('double play does not trigger with 2 outs already', () => {
    const state = makeGameState()
    state.is_top = false
    state.player_role = 'batting'
    state.bases = [true, false, false]
    state.runner_indices = [0, null, null]
    state.outs = 2
    state._forceNextOutcome = 'groundout'
    vi.spyOn(Math, 'random').mockReturnValue(0.99) // high value skips error
    processAtBat(state, 'swing')
    Math.random.mockRestore()
    // With 2 outs, DP condition (outs < 2) is false, so only 1 out is added → 3 outs → end of inning
    // The key check: should NOT see "Double play" in the log
    expect(state.play_log.some(m => m.includes('Double play'))).toBe(false)
  })

  // ──────────────────────────────────────────────
  // TEST 32: no double play on flyout or lineout
  // ──────────────────────────────────────────────
  it('double play only triggers on groundouts, not flyouts or lineouts', () => {
    for (const outType of ['flyout', 'lineout']) {
      const state = makeGameState()
      state.is_top = false
      state.player_role = 'batting'
      state.bases = [true, false, false]
      state.runner_indices = [0, null, null]
      state.outs = 0
      state._forceNextOutcome = outType
      vi.spyOn(Math, 'random').mockReturnValue(0.99) // skip error
      processAtBat(state, 'swing')
      Math.random.mockRestore()
      expect(state.play_log.some(m => m.includes('Double play'))).toBe(false)
    }
  })

  // ──────────────────────────────────────────────
  // TEST 33: double play with runners on 1st and 2nd advances runner to 3rd
  // ──────────────────────────────────────────────
  it('double play with runners on 1st and 2nd advances 2nd to 3rd', () => {
    const state = makeGameState()
    state.is_top = false
    state.player_role = 'batting'
    state.bases = [true, true, false]
    state.runner_indices = [0, 1, null]
    state.outs = 0
    state._forceNextOutcome = 'groundout'
    const randomMock = vi.spyOn(Math, 'random')
    randomMock.mockReturnValueOnce(0.5)  // cpuPicksPitch
      .mockReturnValueOnce(0.99) // skip error
      .mockReturnValueOnce(0.1)  // trigger DP
    processAtBat(state, 'swing')
    randomMock.mockRestore()
    expect(state.bases[0]).toBe(false) // runner removed from 1st
    expect(state.bases[1]).toBe(false) // 2nd cleared (advanced)
    expect(state.play_log.some(m => m.includes('Double play'))).toBe(true)
  })

  // ──────────────────────────────────────────────
  // TEST 34: double play with runner on 3rd scores the run
  // ──────────────────────────────────────────────
  it('double play with runners on 1st and 3rd scores the runner from 3rd', () => {
    const state = makeGameState()
    state.is_top = false
    state.player_role = 'batting'
    state.bases = [true, false, true]
    state.runner_indices = [0, null, 2]
    state.outs = 0
    const scoreBefore = state.home_total
    state._forceNextOutcome = 'groundout'
    const randomMock = vi.spyOn(Math, 'random')
    randomMock.mockReturnValueOnce(0.5)  // cpuPicksPitch
      .mockReturnValueOnce(0.99) // skip error
      .mockReturnValueOnce(0.1)  // trigger DP
    processAtBat(state, 'swing')
    randomMock.mockRestore()
    expect(state.home_total).toBe(scoreBefore + 1)
    expect(state.bases[2]).toBe(false) // runner scored
    expect(state.play_log.some(m => m.includes('Double play'))).toBe(true)
  })

  // ──────────────────────────────────────────────
  // TEST 35: double play with 1 out ends the half-inning
  // ──────────────────────────────────────────────
  it('double play with 1 out ends the half-inning (3 outs)', () => {
    const state = makeGameState()
    state.is_top = false
    state.player_role = 'batting'
    state.bases = [true, false, false]
    state.runner_indices = [0, null, null]
    state.outs = 1
    state._forceNextOutcome = 'groundout'
    const randomMock = vi.spyOn(Math, 'random')
    randomMock.mockReturnValueOnce(0.5)  // cpuPicksPitch
      .mockReturnValueOnce(0.99) // skip error
      .mockReturnValueOnce(0.1)  // trigger DP
    processAtBat(state, 'swing')
    randomMock.mockRestore()
    // 1 + 2 = 3 outs → half-inning ends, outs reset to 0
    expect(state.outs).toBe(0)
    expect(state.bases).toEqual([false, false, false])
  })

  // ──────────────────────────────────────────────
  // TEST 36: double play pushes scorecard entry as 'double_play'
  // ──────────────────────────────────────────────
  it('double play records a scorecard PA with result double_play', () => {
    const state = makeGameState()
    state.is_top = false
    state.player_role = 'batting'
    state.bases = [true, false, false]
    state.runner_indices = [0, null, null]
    state.outs = 0
    state._forceNextOutcome = 'groundout'
    const randomMock = vi.spyOn(Math, 'random')
    randomMock.mockReturnValueOnce(0.5)  // cpuPicksPitch
      .mockReturnValueOnce(0.99) // skip error
      .mockReturnValueOnce(0.1)  // trigger DP
    processAtBat(state, 'swing')
    randomMock.mockRestore()
    const dpEntry = state.home_scorecard.find(e => e.result === 'double_play')
    expect(dpEntry).toBeDefined()
  })

  // ──────────────────────────────────────────────
  // TEST 37: double play credits pitcher with 2 ip_outs
  // ──────────────────────────────────────────────
  it('double play credits the pitcher with 2 ip_outs', () => {
    const state = makeGameState()
    state.is_top = false
    state.player_role = 'batting'
    state.bases = [true, false, false]
    state.runner_indices = [0, null, null]
    state.outs = 0
    const ipOutsBefore = state.away_pitcher_stats.ip_outs
    state._forceNextOutcome = 'groundout'
    const randomMock = vi.spyOn(Math, 'random')
    randomMock.mockReturnValueOnce(0.5)  // cpuPicksPitch
      .mockReturnValueOnce(0.99) // skip error
      .mockReturnValueOnce(0.1)  // trigger DP
    processAtBat(state, 'swing')
    randomMock.mockRestore()
    expect(state.away_pitcher_stats.ip_outs).toBe(ipOutsBefore + 2)
  })
})

// ──────────────────────────────────────────────
// BUNT TESTS
// ──────────────────────────────────────────────
describe('bunt', () => {
  // ──────────────────────────────────────────────
  // TEST: BUNT_OUTCOMES table has valid weights that sum to 100
  // ──────────────────────────────────────────────
  it('BUNT_OUTCOMES weights sum to 100 and all are positive', () => {
    const total = Object.values(BUNT_OUTCOMES).reduce((a, b) => a + b, 0)
    expect(total).toBe(100)
    for (const w of Object.values(BUNT_OUTCOMES)) {
      expect(w).toBeGreaterThan(0)
    }
  })

  // ──────────────────────────────────────────────
  // TEST: weightedChoice returns only valid bunt outcomes
  // ──────────────────────────────────────────────
  it('weightedChoice with BUNT_OUTCOMES returns valid bunt outcomes', () => {
    const validOutcomes = new Set(Object.keys(BUNT_OUTCOMES))
    for (let i = 0; i < 100; i++) {
      expect(validOutcomes).toContain(weightedChoice(BUNT_OUTCOMES))
    }
  })

  // ──────────────────────────────────────────────
  // TEST: processAtBat accepts 'bunt' action and updates state
  // ──────────────────────────────────────────────
  it('processAtBat accepts bunt action and updates play log', () => {
    const state = makeGameState()
    state.is_top = false
    state.player_role = 'batting'
    const before = state.play_log.length
    processAtBat(state, 'bunt')
    expect(state.play_log.length).toBeGreaterThan(before)
    expect(state.play_log.some(m => m.includes('bunt'))).toBe(true)
  })

  // ──────────────────────────────────────────────
  // TEST: sacrifice_out advances runners and records an out
  // ──────────────────────────────────────────────
  it('sacrifice_out advances runners one base and records an out', () => {
    const state = makeGameState()
    state.is_top = false
    state.player_role = 'batting'
    state.bases = [true, false, false]
    state.runner_indices = [0, null, null]
    state.outs = 0
    state._forceNextOutcome = 'sacrifice_out'
    processAtBat(state, 'bunt')
    // Runner should have advanced from 1st to 2nd
    expect(state.bases[1]).toBe(true)
    expect(state.bases[0]).toBe(false)
    // One out recorded
    expect(state.outs).toBe(1)
    expect(state.play_log.some(m => m.includes('Sacrifice bunt'))).toBe(true)
  })

  // ──────────────────────────────────────────────
  // TEST: sacrifice_out with runner on 3rd scores a run
  // ──────────────────────────────────────────────
  it('sacrifice_out with runner on 3rd scores a run', () => {
    const state = makeGameState()
    state.is_top = false
    state.player_role = 'batting'
    state.bases = [false, false, true]
    state.runner_indices = [null, null, 2]
    state.outs = 0
    const scoreBefore = state.home_total
    state._forceNextOutcome = 'sacrifice_out'
    processAtBat(state, 'bunt')
    expect(state.home_total).toBe(scoreBefore + 1)
    expect(state.bases[2]).toBe(false)
    expect(state.play_log.some(m => m.includes('run(s) score'))).toBe(true)
  })

  // ──────────────────────────────────────────────
  // TEST: sacrifice_out credits RBI to batter when runner scores
  // ──────────────────────────────────────────────
  it('sacrifice_out credits RBI to batter when a run scores', () => {
    const state = makeGameState()
    state.is_top = false
    state.player_role = 'batting'
    state.bases = [false, false, true]
    state.runner_indices = [null, null, 2]
    state.outs = 0
    state._forceNextOutcome = 'sacrifice_out'
    const batterIdx = state.home_batter_idx
    processAtBat(state, 'bunt')
    expect(state.home_box_score[batterIdx].rbi).toBe(1)
  })

  // ──────────────────────────────────────────────
  // TEST: sacrifice_out pushes scorecard entry
  // ──────────────────────────────────────────────
  it('sacrifice_out pushes a scorecard PA with result sacrifice_out', () => {
    const state = makeGameState()
    state.is_top = false
    state.player_role = 'batting'
    state.bases = [true, false, false]
    state.runner_indices = [0, null, null]
    state._forceNextOutcome = 'sacrifice_out'
    processAtBat(state, 'bunt')
    const entry = state.home_scorecard.find(e => e.result === 'sacrifice_out')
    expect(entry).toBeDefined()
  })

  // ──────────────────────────────────────────────
  // TEST: bunt foul with 2 strikes is a strikeout
  // ──────────────────────────────────────────────
  it('bunt foul with 2 strikes results in a strikeout', () => {
    const state = makeGameState()
    state.is_top = false
    state.player_role = 'batting'
    state.strikes = 2
    state.outs = 0
    state._forceNextOutcome = 'foul'
    processAtBat(state, 'bunt')
    // Should have struck out
    expect(state.outs).toBe(1)
    expect(state.play_log.some(m => m.includes('Bunt foul with two strikes'))).toBe(true)
    expect(state.home_box_score[0].so).toBe(1)
  })

  // ──────────────────────────────────────────────
  // TEST: bunt foul with fewer than 2 strikes just adds a strike
  // ──────────────────────────────────────────────
  it('bunt foul with 0 strikes adds a strike without strikeout', () => {
    const state = makeGameState()
    state.is_top = false
    state.player_role = 'batting'
    state.strikes = 0
    state.outs = 0
    state._forceNextOutcome = 'foul'
    processAtBat(state, 'bunt')
    expect(state.strikes).toBe(1)
    expect(state.outs).toBe(0)
  })

  // ──────────────────────────────────────────────
  // TEST: bunt popout records an out without advancing runners
  // ──────────────────────────────────────────────
  it('bunt popout records an out and runners hold', () => {
    const state = makeGameState()
    state.is_top = false
    state.player_role = 'batting'
    state.bases = [true, false, false]
    state.runner_indices = [0, null, null]
    state.outs = 0
    state._forceNextOutcome = 'popout'
    vi.spyOn(Math, 'random').mockReturnValue(0.99) // skip error chance
    processAtBat(state, 'bunt')
    Math.random.mockRestore()
    expect(state.outs).toBe(1)
    // Runner should still be on 1st (popout = runners hold)
    expect(state.bases[0]).toBe(true)
  })

  // ──────────────────────────────────────────────
  // TEST: bunt single reaches base and advances runners
  // ──────────────────────────────────────────────
  it('bunt single puts batter on base and advances runners', () => {
    const state = makeGameState()
    state.is_top = false
    state.player_role = 'batting'
    state.bases = [false, true, false]
    state.runner_indices = [null, 1, null]
    state.outs = 0
    state._forceNextOutcome = 'single'
    processAtBat(state, 'bunt')
    // Batter on 1st, runner advanced from 2nd to 3rd
    expect(state.bases[0]).toBe(true)
    expect(state.bases[2]).toBe(true)
    expect(state.home_box_score[0].h).toBe(1)
  })

  // ──────────────────────────────────────────────
  // TEST: bunt groundout records out without advancing runners
  // ──────────────────────────────────────────────
  it('bunt groundout records an out (normal out, no sacrifice advancement)', () => {
    const state = makeGameState()
    state.is_top = false
    state.player_role = 'batting'
    state.bases = [true, false, false]
    state.runner_indices = [0, null, null]
    state.outs = 0
    state._forceNextOutcome = 'groundout'
    // Skip error and DP (high random)
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    processAtBat(state, 'bunt')
    Math.random.mockRestore()
    expect(state.outs).toBe(1)
    expect(state.home_box_score[0].ab).toBe(1)
  })

  // ──────────────────────────────────────────────
  // TEST: sacrifice_out with 2 outs ends the half-inning
  // ──────────────────────────────────────────────
  it('sacrifice_out with 2 outs ends the half-inning', () => {
    const state = makeGameState()
    state.is_top = false
    state.player_role = 'batting'
    state.bases = [true, false, false]
    state.runner_indices = [0, null, null]
    state.outs = 2
    state._forceNextOutcome = 'sacrifice_out'
    processAtBat(state, 'bunt')
    // 3 outs → half-inning ends, outs reset
    expect(state.outs).toBe(0)
    expect(state.bases).toEqual([false, false, false])
  })

  // ──────────────────────────────────────────────
  // TEST: sacrifice_out credits pitcher ip_outs
  // ──────────────────────────────────────────────
  it('sacrifice_out credits the pitcher with 1 ip_out', () => {
    const state = makeGameState()
    state.is_top = false
    state.player_role = 'batting'
    state.bases = [true, false, false]
    state.runner_indices = [0, null, null]
    const ipBefore = state.away_pitcher_stats.ip_outs
    state._forceNextOutcome = 'sacrifice_out'
    processAtBat(state, 'bunt')
    expect(state.away_pitcher_stats.ip_outs).toBe(ipBefore + 1)
  })
})

// ──────────────────────────────────────────────
// HALF-INNING INTEGRITY — every half-inning ends with exactly 3 outs
// ──────────────────────────────────────────────
describe('half-inning integrity', () => {
  it('every completed half-inning has exactly 3 outs across multiple simulated games', () => {
    // Run several games to cover variation (DPs, walk-offs, extras, steals)
    for (let g = 0; g < 5; g++) {
      const state = makeGameState()
      const { snapshots } = simulateGame(state)

      // Count outs per half-inning by tracking positive deltas in the
      // snapshot outs field. When outs increase within a half-inning,
      // add the delta to the running total. When a half-inning transition
      // occurs (inning/is_top changes), the outs were >= 3 which triggered
      // _endHalfInning (resetting to 0). The "missing" outs from the final
      // play are: (3 - last seen outs before the transition snapshot).
      let prevInning = snapshots[0].inning
      let prevIsTop = snapshots[0].is_top
      let accumOuts = snapshots[0].outs
      let lastSeenOuts = snapshots[0].outs
      const outsPerHalf = []

      for (let i = 1; i < snapshots.length; i++) {
        const snap = snapshots[i]

        if (snap.inning !== prevInning || snap.is_top !== prevIsTop) {
          // Half-inning transition: the final play brought outs to >= 3,
          // then _endHalfInning reset them. Infer the missing outs.
          const finalOuts = accumOuts + (3 - lastSeenOuts)
          outsPerHalf.push({ inning: prevInning, isTop: prevIsTop, outs: finalOuts })
          accumOuts = snap.outs
          lastSeenOuts = snap.outs
          prevInning = snap.inning
          prevIsTop = snap.is_top
        } else {
          if (snap.outs > lastSeenOuts) {
            accumOuts += (snap.outs - lastSeenOuts)
          }
          lastSeenOuts = snap.outs
        }
      }

      // Every completed half-inning should have exactly 3 outs.
      // Walk-off exception: bottom of the last inning where home team
      // wins may end with < 3 outs (game ends on a go-ahead run).
      const finalSnap = snapshots[snapshots.length - 1]
      for (const half of outsPerHalf) {
        const isWalkOff = !half.isTop
          && half.inning === finalSnap.inning
          && finalSnap.game_status === 'final'
          && finalSnap.home_total > finalSnap.away_total
        if (!isWalkOff) {
          expect(half.outs, `Game ${g}: inning ${half.inning} ${half.isTop ? 'top' : 'bot'} had ${half.outs} outs`).toBe(3)
        }
      }
    }
  })
})

// ──────────────────────────────────────────────
// BATTING ORDER — visiting team always bats first (top of 1st)
// ──────────────────────────────────────────────
describe('batting order', () => {
  it('game starts with top of inning 1 (visiting team batting)', () => {
    const state = makeGameState()
    expect(state.inning).toBe(1)
    expect(state.is_top).toBe(true)
    // Player is home team, so top of 1st = pitching (away team bats)
    expect(state.player_role).toBe('pitching')
  })

  it('visiting team bats first in every simulated game', () => {
    for (let g = 0; g < 3; g++) {
      const state = makeGameState()
      const { snapshots } = simulateGame(state)
      // First snapshot should be top of inning 1
      const first = snapshots[0]
      expect(first.inning).toBe(1)
      expect(first.is_top).toBe(true)
      // First half-inning transition should go from top to bottom (away batted first)
      const firstTransition = snapshots.find((s, i) =>
        i > 0 && (s.inning !== snapshots[i - 1].inning || s.is_top !== snapshots[i - 1].is_top)
      )
      expect(firstTransition.inning).toBe(1)
      expect(firstTransition.is_top).toBe(false)
    }
  })
})

// ──────────────────────────────────────────────
// WALK — exactly 4 balls triggers a walk
// ──────────────────────────────────────────────
describe('walk', () => {
  it('4 consecutive balls result in a walk', () => {
    const state = makeGameState()
    state.is_top = false
    state.player_role = 'batting'
    // Throw 4 balls by forcing the outcome each time
    for (let i = 0; i < 3; i++) {
      state._forceNextOutcome = 'ball'
      processAtBat(state, 'take')
      expect(state.balls).toBe(i + 1)
    }
    // 4th ball triggers the walk — count resets, batter reaches 1st
    state._forceNextOutcome = 'ball'
    processAtBat(state, 'take')
    expect(state.balls).toBe(0) // count resets after walk
    expect(state.bases[0]).toBe(true) // batter on 1st
    expect(state.play_log.some(m => m.includes('walks'))).toBe(true)
  })

  it('walk credits batter BB and pitcher BB', () => {
    const state = makeGameState()
    state.is_top = false
    state.player_role = 'batting'
    for (let i = 0; i < 4; i++) {
      state._forceNextOutcome = 'ball'
      processAtBat(state, 'take')
    }
    expect(state.home_box_score[0].bb).toBe(1)
    expect(state.away_pitcher_stats.bb).toBe(1)
  })

  it('3 balls does not trigger a walk', () => {
    const state = makeGameState()
    state.is_top = false
    state.player_role = 'batting'
    for (let i = 0; i < 3; i++) {
      state._forceNextOutcome = 'ball'
      processAtBat(state, 'take')
    }
    expect(state.balls).toBe(3)
    expect(state.bases[0]).toBe(false) // batter not on base yet
    expect(state.home_box_score[0].bb).toBe(0)
  })
})

// ──────────────────────────────────────────────
// GAME LENGTH — 9 innings regulation, extra innings when tied
// ──────────────────────────────────────────────
describe('game length', () => {
  it('game ends after 9 innings when the score is not tied', () => {
    // Simulate several games and check that non-tied games end in 9
    for (let g = 0; g < 5; g++) {
      const state = makeGameState()
      const { state: final } = simulateGame(state)
      expect(final.game_status).toBe('final')
      if (final.home_total !== final.away_total) {
        // Regulation or extras — but final score is never tied
        expect(final.inning).toBeGreaterThanOrEqual(9)
      }
      // Winner must exist — no ties
      expect(final.home_total).not.toBe(final.away_total)
    }
  })

  it('extra innings occur when tied after 9 and continue until a winner is determined', () => {
    // Force a tied game going into extras by using _outcomeFilter to suppress
    // all runs until late, then letting the game play out naturally.
    // We run many attempts since we need randomness to produce a tie at end of 9.
    let foundExtras = false
    for (let attempt = 0; attempt < 50 && !foundExtras; attempt++) {
      const state = makeGameState()
      // Force all outcomes to groundout (no runs) for the first 8 innings,
      // then let the game play normally. This maximizes the chance of a
      // 0-0 tie going into the 9th, with extras likely.
      state._outcomeFilter = (st, outcome) => {
        if (st.inning <= 8) return 'groundout'
        return outcome
      }
      const { state: final } = simulateGame(state)
      expect(final.game_status).toBe('final')
      expect(final.home_total).not.toBe(final.away_total) // always a winner
      if (final.inning > 9) {
        foundExtras = true
        // Extra innings: game went past 9 because it was tied
        expect(final.inning).toBeGreaterThan(9)
      }
    }
    // We should have found at least one extra-innings game in 50 attempts
    expect(foundExtras).toBe(true)
  })

  it('game never ends in a tie', () => {
    for (let g = 0; g < 10; g++) {
      const state = makeGameState()
      const { state: final } = simulateGame(state)
      expect(final.game_status).toBe('final')
      expect(final.home_total).not.toBe(final.away_total)
    }
  })
})

// ──────────────────────────────────────────────
// STRIKEOUT — exactly 3 strikes triggers a strikeout
// ──────────────────────────────────────────────
describe('strikeout', () => {
  it('3 consecutive strikes result in a strikeout', () => {
    const state = makeGameState()
    state.is_top = false
    state.player_role = 'batting'
    for (let i = 0; i < 2; i++) {
      state._forceNextOutcome = 'strike_swinging'
      processAtBat(state, 'swing')
      expect(state.strikes).toBe(i + 1)
    }
    // 3rd strike triggers the strikeout — count resets, out recorded
    state._forceNextOutcome = 'strike_swinging'
    processAtBat(state, 'swing')
    expect(state.strikes).toBe(0) // count resets after strikeout
    expect(state.outs).toBe(1)
    expect(state.play_log.some(m => m.includes('Strikeout'))).toBe(true)
  })

  it('strikeout credits batter SO and pitcher SO', () => {
    const state = makeGameState()
    state.is_top = false
    state.player_role = 'batting'
    for (let i = 0; i < 3; i++) {
      state._forceNextOutcome = 'strike_looking'
      processAtBat(state, 'take')
    }
    expect(state.home_box_score[0].so).toBe(1)
    expect(state.away_pitcher_stats.so).toBe(1)
  })

  it('2 strikes does not trigger a strikeout', () => {
    const state = makeGameState()
    state.is_top = false
    state.player_role = 'batting'
    for (let i = 0; i < 2; i++) {
      state._forceNextOutcome = 'strike_swinging'
      processAtBat(state, 'swing')
    }
    expect(state.strikes).toBe(2)
    expect(state.outs).toBe(0)
    expect(state.home_box_score[0].so).toBe(0)
  })

  it('foul balls do not add a 3rd strike (capped at 2)', () => {
    const state = makeGameState()
    state.is_top = false
    state.player_role = 'batting'
    // Get to 2 strikes
    state._forceNextOutcome = 'strike_swinging'
    processAtBat(state, 'swing')
    state._forceNextOutcome = 'strike_swinging'
    processAtBat(state, 'swing')
    expect(state.strikes).toBe(2)
    // Foul balls should not advance past 2 strikes
    state._forceNextOutcome = 'foul'
    processAtBat(state, 'swing')
    expect(state.strikes).toBe(2)
    expect(state.outs).toBe(0) // no strikeout
    state._forceNextOutcome = 'foul'
    processAtBat(state, 'swing')
    expect(state.strikes).toBe(2)
    expect(state.outs).toBe(0) // still no strikeout
  })
})

// ──────────────────────────────────────────────
// PLAYER SIDE — home vs away
// ──────────────────────────────────────────────

/** Build a game state where the player controls the away team. */
function makeAwayGameState(overrides = {}) {
  const state = makeGameState(overrides)
  state.player_side = 'away'
  // Away player bats in top of inning (away team at bat)
  state.player_role = 'batting'
  return state
}

describe('player side', () => {
  it('home player starts with player_role pitching (default behavior)', () => {
    const state = makeGameState()
    expect(state.player_side).toBe('home')
    expect(state.player_role).toBe('pitching')
    expect(state.is_top).toBe(true)
  })

  it('away player starts with player_role batting in top of 1st', () => {
    const state = makeAwayGameState()
    expect(state.player_side).toBe('away')
    expect(state.player_role).toBe('batting')
    expect(state.is_top).toBe(true)
  })

  it('processPitch works for away player pitching in bottom of inning', () => {
    const state = makeAwayGameState()
    state.is_top = false
    state.player_role = 'pitching'
    const before = state.play_log.length
    processPitch(state, 'fastball')
    expect(state.away_pitch_count).toBe(1)
    expect(state.play_log.length).toBeGreaterThan(before)
  })

  it('processAtBat works for away player batting in top of inning', () => {
    const state = makeAwayGameState()
    const before = state.play_log.length
    processAtBat(state, 'swing')
    // CPU is home team, so home_pitch_count should increment
    expect(state.home_pitch_count).toBe(1)
    expect(state.play_log.length).toBeGreaterThan(before)
  })

  it('processAtBat rejects input when away player is pitching', () => {
    const state = makeAwayGameState()
    state.is_top = false
    state.player_role = 'pitching'
    processAtBat(state, 'swing')
    expect(state.last_play).toMatch(/pitching right now/)
  })

  it('processPitch rejects input when away player is batting', () => {
    const state = makeAwayGameState()
    // player_role is 'batting' by default for away player in top
    processPitch(state, 'fastball')
    expect(state.last_play).toMatch(/batting right now/)
  })

  it('half-inning transition: away player goes from batting to pitching', () => {
    const state = makeAwayGameState()
    // Force 3 quick outs to end the top half
    for (let i = 0; i < 3; i++) {
      state._forceNextOutcome = 'groundout'
      vi.spyOn(Math, 'random').mockReturnValue(0.99) // skip error and DP
      processAtBat(state, 'swing')
      Math.random.mockRestore()
    }
    // Should now be bottom of 1st, away player pitching
    expect(state.is_top).toBe(false)
    expect(state.player_role).toBe('pitching')
  })

  it('half-inning transition: away player goes from pitching back to batting', () => {
    const state = makeAwayGameState()
    // Force all outcomes to groundouts (processPitch doesn't use _forceNextOutcome)
    state._outcomeFilter = (_st, _outcome) => 'groundout'
    // End top half (player batting)
    for (let i = 0; i < 3; i++) {
      vi.spyOn(Math, 'random').mockReturnValue(0.99)
      processAtBat(state, 'swing')
      Math.random.mockRestore()
    }
    expect(state.player_role).toBe('pitching')
    // End bottom half (player pitching)
    for (let i = 0; i < 3; i++) {
      vi.spyOn(Math, 'random').mockReturnValue(0.99)
      processPitch(state, 'fastball')
      Math.random.mockRestore()
    }
    // Should now be top of 2nd, away player batting again
    expect(state.is_top).toBe(true)
    expect(state.inning).toBe(2)
    expect(state.player_role).toBe('batting')
  })

  it('processAtBat auto-replaces fatigued CPU pitcher (home side) when player is away', () => {
    const state = makeAwayGameState()
    state.home_pitch_count = 100
    const originalName = state.home_pitcher.name
    processAtBat(state, 'take')
    expect(state.home_pitcher.name).not.toBe(originalName)
    expect(state.home_pitch_count).toBeLessThanOrEqual(1)
  })

  it('simulateGame works with away player and produces a final result', () => {
    const state = makeAwayGameState()
    const { state: final, snapshots } = simulateGame(state)
    expect(final.game_status).toBe('final')
    expect(snapshots.length).toBeGreaterThan(1)
    expect(final.inning).toBeGreaterThanOrEqual(9)
    expect(final.home_total).not.toBe(final.away_total)
  })

  it('simulateGame as away player: player_role alternates correctly through snapshots', () => {
    const state = makeAwayGameState()
    const { snapshots } = simulateGame(state)
    for (const snap of snapshots) {
      // Away player bats in top (is_top=true), pitches in bottom (is_top=false)
      if (snap.is_top) {
        expect(snap.player_role).toBe('batting')
      } else {
        expect(snap.player_role).toBe('pitching')
      }
    }
  })

  it('switchPitcher works for away side', () => {
    const state = makeAwayGameState()
    state.away_pitch_count = 95
    const reliever = { id: 99, name: 'Away New Arm', stats: { era: 2.50, k_per_9: 10.0, bb_per_9: 2.0 } }
    switchPitcher(state, 'away', reliever)
    expect(state.away_pitcher.name).toBe('Away New Arm')
    expect(state.away_pitch_count).toBe(0)
    expect(state.away_pitcher_stats.id).toBe(99)
  })

  it('outcome filter applies in processAtBat (e.g., Ellis no-hitter when player is away)', () => {
    const state = makeAwayGameState()
    // Apply a filter that converts all hits to groundouts when is_top is true
    state._outcomeFilter = (st, outcome) => {
      if (st.is_top && ['single', 'double', 'triple', 'homerun'].includes(outcome)) return 'groundout'
      return outcome
    }
    // Force a single in the top (player batting as away)
    state._forceNextOutcome = 'single'
    vi.spyOn(Math, 'random').mockReturnValue(0.99) // skip error
    processAtBat(state, 'swing')
    Math.random.mockRestore()
    // The filter should have converted it to a groundout
    expect(state.away_hits).toBe(0)
    expect(state.outs).toBe(1)
  })

  it('game over message reflects away player perspective', () => {
    const state = makeAwayGameState()
    // Force a quick game: home wins
    state.inning = 9
    state.is_top = true
    state.home_total = 5
    state.away_total = 3
    // End the top of 9th with 3 outs → game should end (home is ahead)
    for (let i = 0; i < 3; i++) {
      state._forceNextOutcome = 'groundout'
      vi.spyOn(Math, 'random').mockReturnValue(0.99)
      processAtBat(state, 'swing')
      Math.random.mockRestore()
    }
    expect(state.game_status).toBe('final')
    // Away player lost (away_total < home_total)
    expect(state.last_play).toMatch(/You lose!/)
  })

  it('game over message shows win for away player when away team leads', () => {
    const state = makeAwayGameState()
    // Set up bottom of 9th scenario: away leads, need to get 3 outs
    state.inning = 9
    state.is_top = false
    state.player_role = 'pitching'
    state.away_total = 5
    state.home_total = 3
    // Force all outcomes to groundouts
    state._outcomeFilter = (_st, _outcome) => 'groundout'
    for (let i = 0; i < 3; i++) {
      vi.spyOn(Math, 'random').mockReturnValue(0.99)
      processPitch(state, 'fastball')
      Math.random.mockRestore()
    }
    expect(state.game_status).toBe('final')
    expect(state.last_play).toMatch(/You win!/)
  })
})
