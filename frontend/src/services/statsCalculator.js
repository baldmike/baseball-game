/**
 * statsCalculator.js — Adjust outcome probabilities based on real MLB player stats.
 */

// League average baselines
const LEAGUE_AVG = 0.245
const LEAGUE_SLG = 0.395
const LEAGUE_K_RATE = 0.230

const LEAGUE_ERA = 4.30
const LEAGUE_K_PER_9 = 8.20
const LEAGUE_BB_PER_9 = 3.20

// Maximum adjustment factor (+-30%)
const MAX_ADJ = 0.30

const HIT_OUTCOMES = new Set(['single', 'double', 'triple', 'homerun'])
const STRIKEOUT_OUTCOMES = new Set(['strike_swinging'])
const OUT_OUTCOMES = new Set(['groundout', 'flyout', 'lineout'])

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value))
}

/**
 * Scale swing-outcome weights based on a batter's stats vs league averages,
 * with an optional second layer of pitcher adjustments.
 */
export function calculateAdjustedOutcomes(baseOutcomes, playerStats, pitcherStats = null) {
  const avg = playerStats.avg ?? LEAGUE_AVG
  const slg = playerStats.slg ?? LEAGUE_SLG
  const kRate = playerStats.k_rate ?? LEAGUE_K_RATE

  const hitMult = LEAGUE_AVG ? clamp(avg / LEAGUE_AVG, 1 - MAX_ADJ, 1 + MAX_ADJ) : 1.0
  const powerMult = LEAGUE_SLG ? clamp(slg / LEAGUE_SLG, 1 - MAX_ADJ, 1 + MAX_ADJ) : 1.0
  const kMult = LEAGUE_K_RATE ? clamp(kRate / LEAGUE_K_RATE, 1 - MAX_ADJ, 1 + MAX_ADJ) : 1.0

  const totalOriginal = Object.values(baseOutcomes).reduce((a, b) => a + b, 0)
  const adjusted = {}

  for (const [outcome, weight] of Object.entries(baseOutcomes)) {
    if (STRIKEOUT_OUTCOMES.has(outcome)) {
      adjusted[outcome] = weight * kMult
    } else if (outcome === 'homerun') {
      adjusted[outcome] = weight * powerMult
    } else if (HIT_OUTCOMES.has(outcome)) {
      adjusted[outcome] = weight * hitMult
    } else if (OUT_OUTCOMES.has(outcome)) {
      const outMult = hitMult ? clamp(1 / hitMult, 1 - MAX_ADJ, 1 + MAX_ADJ) : 1.0
      adjusted[outcome] = weight * outMult
    } else {
      adjusted[outcome] = weight
    }
  }

  // Pitcher adjustments (second layer)
  if (pitcherStats) {
    const era = pitcherStats.era ?? LEAGUE_ERA
    const kPer9 = pitcherStats.k_per_9 ?? LEAGUE_K_PER_9

    const eraMult = LEAGUE_ERA ? clamp(era / LEAGUE_ERA, 1 - MAX_ADJ, 1 + MAX_ADJ) : 1.0
    const k9Mult = LEAGUE_K_PER_9 ? clamp(kPer9 / LEAGUE_K_PER_9, 1 - MAX_ADJ, 1 + MAX_ADJ) : 1.0

    for (const outcome of Object.keys(adjusted)) {
      if (STRIKEOUT_OUTCOMES.has(outcome)) {
        adjusted[outcome] *= k9Mult
      } else if (HIT_OUTCOMES.has(outcome) || outcome === 'homerun') {
        adjusted[outcome] *= eraMult
      }
    }
  }

  // Normalize to preserve total probability weight
  const adjustedTotal = Object.values(adjusted).reduce((a, b) => a + b, 0)
  if (adjustedTotal > 0) {
    const scale = totalOriginal / adjustedTotal
    for (const k of Object.keys(adjusted)) {
      adjusted[k] = Math.max(1, Math.round(adjusted[k] * scale))
    }
  }

  return adjusted
}

/**
 * Adjust take-outcome weights based on pitcher's BB/9.
 * High BB/9 -> more balls (wild pitcher).
 */
export function calculateAdjustedTakeOutcomes(baseOutcomes, pitcherStats) {
  const bbPer9 = pitcherStats.bb_per_9 ?? LEAGUE_BB_PER_9
  const bbMult = LEAGUE_BB_PER_9 ? clamp(bbPer9 / LEAGUE_BB_PER_9, 1 - MAX_ADJ, 1 + MAX_ADJ) : 1.0

  const totalOriginal = Object.values(baseOutcomes).reduce((a, b) => a + b, 0)
  const adjusted = {}

  for (const [outcome, weight] of Object.entries(baseOutcomes)) {
    if (outcome === 'ball') {
      adjusted[outcome] = weight * bbMult
    } else {
      adjusted[outcome] = weight * clamp(1 / bbMult, 1 - MAX_ADJ, 1 + MAX_ADJ)
    }
  }

  const adjustedTotal = Object.values(adjusted).reduce((a, b) => a + b, 0)
  if (adjustedTotal > 0) {
    const scale = totalOriginal / adjustedTotal
    for (const k of Object.keys(adjusted)) {
      adjusted[k] = Math.max(1, Math.round(adjusted[k] * scale))
    }
  }

  return adjusted
}
