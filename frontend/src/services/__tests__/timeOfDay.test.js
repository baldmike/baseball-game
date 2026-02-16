/**
 * timeOfDay.test.js — Tests for the time-of-day premium feature.
 */
import { describe, it, expect, vi } from 'vitest'

import {
  TIME_OF_DAY,
  TIME_OF_DAY_MODIFIERS,
  applyTimeOfDayModifiers,
  getErrorChance,
} from '../weather.js'

import { determineOutcome, SWING_OUTCOMES } from '../probabilities.js'

// ──────────────────────────────────────────────
// applyTimeOfDayModifiers
// ──────────────────────────────────────────────
describe('applyTimeOfDayModifiers', () => {
  const baseWeights = { single: 10, double: 4, triple: 1, homerun: 2.5, strike_swinging: 25, strike_looking: 0, groundout: 17, flyout: 13 }

  it('night reduces hits by 5% and increases strikeouts by 10%', () => {
    const result = applyTimeOfDayModifiers(baseWeights, 'night')
    expect(result.single).toBeCloseTo(10 * 0.95)
    expect(result.double).toBeCloseTo(4 * 0.95)
    expect(result.homerun).toBeCloseTo(2.5 * 0.95)
    expect(result.strike_swinging).toBeCloseTo(25 * 1.10)
    expect(result.groundout).toBeCloseTo(17 * 1.05)
    expect(result.flyout).toBeCloseTo(13 * 1.05)
  })

  it('day increases hits by 3% and decreases strikeouts by 5%', () => {
    const result = applyTimeOfDayModifiers(baseWeights, 'day')
    expect(result.single).toBeCloseTo(10 * 1.03)
    expect(result.double).toBeCloseTo(4 * 1.03)
    expect(result.homerun).toBeCloseTo(2.5 * 1.03)
    expect(result.strike_swinging).toBeCloseTo(25 * 0.95)
  })

  it('twilight slightly reduces hits and increases strikeouts', () => {
    const result = applyTimeOfDayModifiers(baseWeights, 'twilight')
    expect(result.single).toBeCloseTo(10 * 0.97)
    expect(result.strike_swinging).toBeCloseTo(25 * 1.05)
  })

  it('returns unchanged weights for unknown key', () => {
    const result = applyTimeOfDayModifiers(baseWeights, 'unknown')
    expect(result.single).toBe(10)
    expect(result.strike_swinging).toBe(25)
  })

  it('returns unchanged weights for null key', () => {
    const result = applyTimeOfDayModifiers(baseWeights, null)
    expect(result.single).toBe(10)
  })
})

// ──────────────────────────────────────────────
// getErrorChance
// ──────────────────────────────────────────────
describe('getErrorChance', () => {
  it('returns 0.04 for day games', () => {
    expect(getErrorChance('day')).toBe(0.04)
  })

  it('returns 0.06 for twilight games', () => {
    expect(getErrorChance('twilight')).toBe(0.06)
  })

  it('returns 0.02 for night games', () => {
    expect(getErrorChance('night')).toBe(0.02)
  })

  it('returns 0.02 baseline for null/undefined', () => {
    expect(getErrorChance(null)).toBe(0.02)
    expect(getErrorChance(undefined)).toBe(0.02)
  })
})

// ──────────────────────────────────────────────
// TIME_OF_DAY constants
// ──────────────────────────────────────────────
describe('TIME_OF_DAY constants', () => {
  it('has day, twilight, and night entries', () => {
    expect(Object.keys(TIME_OF_DAY)).toEqual(['day', 'twilight', 'night'])
  })

  it('each entry has label, icon, and desc', () => {
    for (const key of Object.keys(TIME_OF_DAY)) {
      expect(TIME_OF_DAY[key]).toHaveProperty('label')
      expect(TIME_OF_DAY[key]).toHaveProperty('icon')
      expect(TIME_OF_DAY[key]).toHaveProperty('desc')
    }
  })

  it('has matching modifiers for each time-of-day key', () => {
    for (const key of Object.keys(TIME_OF_DAY)) {
      expect(TIME_OF_DAY_MODIFIERS).toHaveProperty(key)
    }
  })
})

// ──────────────────────────────────────────────
// determineOutcome accepts timeOfDay parameter
// ──────────────────────────────────────────────
describe('determineOutcome with timeOfDay', () => {
  it('accepts timeOfDay as 7th parameter without error', () => {
    for (let i = 0; i < 20; i++) {
      const result = determineOutcome('fastball', true, null, null, null, 0, 'night')
      expect(typeof result).toBe('string')
    }
  })

  it('produces valid outcomes with all time-of-day values', () => {
    const validOutcomes = new Set(Object.keys(SWING_OUTCOMES.fastball))
    for (const tod of ['day', 'twilight', 'night', null]) {
      for (let i = 0; i < 10; i++) {
        const result = determineOutcome('fastball', true, null, null, 'clear', 0, tod)
        expect(validOutcomes.has(result)).toBe(true)
      }
    }
  })
})
