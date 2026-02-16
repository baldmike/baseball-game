/**
 * weather.js — Weather conditions and their effects on game mechanics.
 *
 * Each weather condition applies multipliers to outcome weights before
 * the existing stats adjustments in determineOutcome(). A multiplier of
 * 1.0 means no change; >1.0 increases that outcome's likelihood.
 */

export const WEATHER_CONDITIONS = {
  clear:    { label: 'Clear Skies',  icon: '☀️',  temp: '75°F', wind: 'Calm' },
  hot:      { label: 'Hot & Humid',  icon: '🔥', temp: '95°F', wind: 'Calm' },
  cold:     { label: 'Cold',         icon: '🥶', temp: '40°F', wind: 'Calm' },
  wind_out: { label: 'Wind Out',     icon: '💨', temp: '70°F', wind: 'Blowing Out' },
  wind_in:  { label: 'Wind In',      icon: '🌬️',  temp: '70°F', wind: 'Blowing In' },
  rain:     { label: 'Rain',         icon: '🌧️',  temp: '60°F', wind: 'Calm' },
  dome:     { label: 'Dome / Roof',  icon: '🏟️',  temp: '72°F', wind: 'None' },
}

export const WEATHER_MODIFIERS = {
  clear:    { homerun: 1.0,  double: 1.0,  triple: 1.0, single: 1.0,  flyout: 1.0,  groundout: 1.0,  ball: 1.0,  strike_swinging: 1.0  },
  hot:      { homerun: 1.15, double: 1.10, triple: 1.0, single: 1.0,  flyout: 0.95, groundout: 1.0,  ball: 1.05, strike_swinging: 0.95 },
  cold:     { homerun: 0.75, double: 0.85, triple: 1.0, single: 1.0,  flyout: 1.15, groundout: 1.1,  ball: 1.05, strike_swinging: 0.9  },
  wind_out: { homerun: 1.25, double: 1.10, triple: 1.0, single: 1.0,  flyout: 0.85, groundout: 1.0,  ball: 1.0,  strike_swinging: 1.0  },
  wind_in:  { homerun: 0.60, double: 0.80, triple: 1.0, single: 1.05, flyout: 1.30, groundout: 1.05, ball: 1.0,  strike_swinging: 1.0  },
  rain:     { homerun: 0.85, double: 0.95, triple: 0.9, single: 1.15, flyout: 1.0,  groundout: 1.1,  ball: 1.20, strike_swinging: 0.90 },
  dome:     { homerun: 1.0,  double: 1.0,  triple: 1.0, single: 1.0,  flyout: 1.0,  groundout: 1.0,  ball: 1.0,  strike_swinging: 1.0  },
}

/**
 * Apply weather multipliers to an outcome weights table.
 * Returns a new object with adjusted weights. Outcomes not present
 * in the modifier table are left unchanged.
 *
 * @param {Object} outcomeWeights - Map of outcome names to numeric weights
 * @param {string} weatherKey - Key into WEATHER_MODIFIERS (e.g., 'hot', 'rain')
 * @returns {Object} New weights object with weather adjustments applied
 */
export function applyWeatherModifiers(outcomeWeights, weatherKey) {
  const modifiers = WEATHER_MODIFIERS[weatherKey]
  if (!modifiers) return { ...outcomeWeights }

  const adjusted = {}
  for (const [outcome, weight] of Object.entries(outcomeWeights)) {
    const multiplier = modifiers[outcome] ?? 1.0
    adjusted[outcome] = weight * multiplier
  }
  return adjusted
}

// ============================================================
// TIME OF DAY — Premium game modifier
// ============================================================

export const TIME_OF_DAY = {
  day:      { label: 'Day Game',  icon: '☀️',  desc: '+3% BA, -5% K, +10% errors' },
  twilight: { label: 'Twilight',  icon: '🌅', desc: '+15% errors, weird visibility' },
  night:    { label: 'Night Game', icon: '🌙', desc: '-5% BA, +10% K, +5% pitcher' },
}

export const TIME_OF_DAY_MODIFIERS = {
  day:      { single: 1.03, double: 1.03, triple: 1.03, homerun: 1.03, strike_swinging: 0.95, strike_looking: 0.95 },
  twilight: { single: 0.97, double: 0.97, triple: 0.97, homerun: 0.97, strike_swinging: 1.05, strike_looking: 1.05 },
  night:    { single: 0.95, double: 0.95, triple: 0.95, homerun: 0.95, strike_swinging: 1.10, strike_looking: 1.10, groundout: 1.05, flyout: 1.05 },
}

export function applyTimeOfDayModifiers(outcomeWeights, todKey) {
  const modifiers = TIME_OF_DAY_MODIFIERS[todKey]
  if (!modifiers) return { ...outcomeWeights }

  const adjusted = {}
  for (const [outcome, weight] of Object.entries(outcomeWeights)) {
    const multiplier = modifiers[outcome] ?? 1.0
    adjusted[outcome] = weight * multiplier
  }
  return adjusted
}

const ERROR_CHANCES = { day: 0.04, twilight: 0.06, night: 0.02 }

export function getErrorChance(todKey) {
  return ERROR_CHANCES[todKey] ?? 0.02
}
