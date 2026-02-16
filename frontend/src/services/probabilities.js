/**
 * probabilities.js — MLB-realistic probability tables for the baseball game.
 *
 * Ported from probabilities.py. Uses weighted random selection to produce
 * outcomes that feel realistic relative to actual MLB statistics.
 */

import { calculateAdjustedOutcomes, calculateAdjustedTakeOutcomes } from './statsCalculator.js'
import { applyWeatherModifiers, applyTimeOfDayModifiers } from './weather.js'

// CPU pitch type selection weights (~50% fastball, matching real MLB usage)
export const CPU_PITCH_WEIGHTS = {
  fastball: 50,
  slider: 20,
  curveball: 15,
  changeup: 15,
}

// CPU batter swings at roughly 50% of pitches (MLB ~47% swing rate)
export const CPU_SWING_PROBABILITY = 0.50

// Outcomes when the batter SWINGS, keyed by pitch type.
// Tuned to produce ~4-5 runs/team/game matching MLB averages:
//   BA ~.245, HR ~1.1/game, ~8-10 total runs/game
export const SWING_OUTCOMES = {
  fastball: {
    strike_swinging: 25,
    foul: 20,
    groundout: 17,
    flyout: 13,
    lineout: 5,
    single: 11.5,
    double: 4,
    triple: 1,
    homerun: 2.5,
  },
  curveball: {
    strike_swinging: 33,
    foul: 16,
    groundout: 17,
    flyout: 12,
    lineout: 5,
    single: 10,
    double: 3.5,
    triple: 0.5,
    homerun: 2.5,
  },
  slider: {
    strike_swinging: 30,
    foul: 18,
    groundout: 17,
    flyout: 12,
    lineout: 5,
    single: 10.5,
    double: 3.5,
    triple: 0.5,
    homerun: 2.5,
  },
  changeup: {
    strike_swinging: 28,
    foul: 17,
    groundout: 18,
    flyout: 13,
    lineout: 5,
    single: 10.5,
    double: 4,
    triple: 0.5,
    homerun: 2.5,
  },
}

// Outcomes when the batter TAKES (doesn't swing)
export const TAKE_OUTCOMES = {
  fastball: {
    strike_looking: 55,
    ball: 45,
  },
  curveball: {
    strike_looking: 35,
    ball: 65,
  },
  slider: {
    strike_looking: 40,
    ball: 60,
  },
  changeup: {
    strike_looking: 40,
    ball: 60,
  },
}

/**
 * Pick a random outcome from a weighted dict.
 * @param {Object} weights - Map of outcome names to integer weights
 * @returns {string} The selected outcome
 */
export function weightedChoice(weights) {
  const outcomes = Object.keys(weights)
  const w = Object.values(weights)
  const total = w.reduce((a, b) => a + b, 0)
  let r = Math.random() * total
  for (let i = 0; i < outcomes.length; i++) {
    r -= w[i]
    if (r <= 0) return outcomes[i]
  }
  return outcomes[outcomes.length - 1]
}

/**
 * Apply fatigue modifiers based on pitch count.
 * Fatigue kicks in after 85 pitches, increasing hit/walk probability.
 */
export function applyFatigueMod(table, pitchCount) {
  if (pitchCount < 85) return table
  let factor
  if (pitchCount < 100) factor = 1.05
  else if (pitchCount < 115) factor = 1.10
  else factor = 1.18
  const adjusted = { ...table }
  if (adjusted.homerun) adjusted.homerun *= factor
  if (adjusted.double) adjusted.double *= factor
  if (adjusted.single) adjusted.single *= factor
  if (adjusted.ball) adjusted.ball *= factor
  if (adjusted.strike_swinging) adjusted.strike_swinging /= factor
  return adjusted
}

/**
 * Given a pitch type and whether the batter swings, return the outcome.
 * Optionally adjusts weights based on real player/pitcher stats.
 */
export function determineOutcome(pitchType, swings, playerStats = null, pitcherStats = null, weather = null, pitchCount = 0, timeOfDay = null) {
  if (swings) {
    let table = { ...SWING_OUTCOMES[pitchType] }
    if (weather) table = applyWeatherModifiers(table, weather)
    if (timeOfDay) table = applyTimeOfDayModifiers(table, timeOfDay)
    if (pitchCount) table = applyFatigueMod(table, pitchCount)
    if (playerStats) {
      table = calculateAdjustedOutcomes(table, playerStats, pitcherStats)
    } else if (pitcherStats) {
      table = calculateAdjustedOutcomes(
        table,
        { avg: 0.245, slg: 0.395, k_rate: 0.230 },
        pitcherStats,
      )
    }
    return weightedChoice(table)
  } else {
    let table = { ...TAKE_OUTCOMES[pitchType] }
    if (weather) table = applyWeatherModifiers(table, weather)
    if (timeOfDay) table = applyTimeOfDayModifiers(table, timeOfDay)
    if (pitchCount) table = applyFatigueMod(table, pitchCount)
    if (pitcherStats) {
      table = calculateAdjustedTakeOutcomes(table, pitcherStats)
    }
    return weightedChoice(table)
  }
}

// Outcomes when the batter BUNTS — pitch-type independent (bunting is mechanical, not reactive)
export const BUNT_OUTCOMES = {
  sacrifice_out: 45,   // batter out, runners advance (the main purpose)
  groundout: 15,       // batter out, runners don't advance
  foul: 25,            // foul ball (with 2 strikes = strikeout)
  single: 10,          // bunt single (batter reaches, runners advance)
  popout: 5,           // popped up, easy out, runners hold
}

/** CPU batter decides whether to swing (60% chance). */
export function cpuDecidesSwing() {
  return Math.random() < CPU_SWING_PROBABILITY
}

/** CPU pitcher picks a pitch type using weighted random selection. */
export function cpuPicksPitch() {
  return weightedChoice(CPU_PITCH_WEIGHTS)
}
