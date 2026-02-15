/**
 * probabilities.js — MLB-realistic probability tables for the baseball game.
 *
 * Ported from probabilities.py. Uses weighted random selection to produce
 * outcomes that feel realistic relative to actual MLB statistics.
 */

import { calculateAdjustedOutcomes, calculateAdjustedTakeOutcomes } from './statsCalculator.js'

// CPU pitch type selection weights (~50% fastball, matching real MLB usage)
export const CPU_PITCH_WEIGHTS = {
  fastball: 50,
  slider: 20,
  curveball: 15,
  changeup: 15,
}

// CPU batter swings at roughly 60% of pitches
export const CPU_SWING_PROBABILITY = 0.60

// Outcomes when the batter SWINGS, keyed by pitch type.
// Weights are relative (not percentages).
export const SWING_OUTCOMES = {
  fastball: {
    strike_swinging: 25,
    foul: 20,
    groundout: 15,
    flyout: 12,
    lineout: 5,
    single: 12,
    double: 5,
    triple: 1,
    homerun: 5,
  },
  curveball: {
    strike_swinging: 35,
    foul: 15,
    groundout: 15,
    flyout: 10,
    lineout: 5,
    single: 10,
    double: 4,
    triple: 1,
    homerun: 5,
  },
  slider: {
    strike_swinging: 30,
    foul: 18,
    groundout: 16,
    flyout: 10,
    lineout: 5,
    single: 11,
    double: 4,
    triple: 1,
    homerun: 5,
  },
  changeup: {
    strike_swinging: 28,
    foul: 17,
    groundout: 17,
    flyout: 11,
    lineout: 5,
    single: 11,
    double: 5,
    triple: 1,
    homerun: 5,
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
 * Given a pitch type and whether the batter swings, return the outcome.
 * Optionally adjusts weights based on real player/pitcher stats.
 */
export function determineOutcome(pitchType, swings, playerStats = null, pitcherStats = null) {
  if (swings) {
    let table = { ...SWING_OUTCOMES[pitchType] }
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
    if (pitcherStats) {
      table = calculateAdjustedTakeOutcomes(table, pitcherStats)
    }
    return weightedChoice(table)
  }
}

/** CPU batter decides whether to swing (60% chance). */
export function cpuDecidesSwing() {
  return Math.random() < CPU_SWING_PROBABILITY
}

/** CPU pitcher picks a pitch type using weighted random selection. */
export function cpuPicksPitch() {
  return weightedChoice(CPU_PITCH_WEIGHTS)
}
