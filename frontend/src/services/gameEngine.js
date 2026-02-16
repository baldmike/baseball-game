/**
 * gameEngine.js — Core game logic and state management.
 * Ported from game_engine.py. Operates on plain state objects.
 */

import * as mlbApi from './mlbApi.js'
import { cpuDecidesSwing, cpuPicksPitch, determineOutcome } from './probabilities.js'
import { WEATHER_CONDITIONS } from './weather.js'

const TOTAL_INNINGS = 9
const HIT_TYPES = new Set(['single', 'double', 'triple', 'homerun'])
const OUT_TYPES = new Set(['groundout', 'flyout', 'lineout'])

function _emptyState() {
  return {
    game_id: '',
    inning: 1,
    is_top: true,
    outs: 0,
    balls: 0,
    strikes: 0,
    bases: [false, false, false],
    runner_indices: [null, null, null],  // batter index of runner on each base
    away_score: Array(TOTAL_INNINGS).fill(0),
    home_score: Array(TOTAL_INNINGS).fill(0),
    away_total: 0,
    home_total: 0,
    player_role: 'pitching',
    game_status: 'active',
    play_log: [],
    last_play: '',
    away_team: null,
    home_team: null,
    away_abbreviation: null,
    home_abbreviation: null,
    away_lineup: null,
    home_lineup: null,
    away_batter_idx: 0,
    home_batter_idx: 0,
    current_batter_index: 0,
    current_batter_name: '',
    home_pitcher: null,
    away_pitcher: null,
    away_box_score: [],
    home_box_score: [],
    away_pitcher_stats: null,
    home_pitcher_stats: null,
    weather: null,
    home_pitch_count: 0,
    away_pitch_count: 0,
    home_bullpen: [],
    away_bullpen: [],
    home_scorecard: [],
    away_scorecard: [],
    classic_relievers: null,
  }
}

function _getCurrentBatter(state) {
  const lineup = state.is_top ? state.away_lineup : state.home_lineup
  const idx = state.is_top ? (state.away_batter_idx || 0) : (state.home_batter_idx || 0)
  if (!lineup) return null
  const batter = lineup[idx % lineup.length]
  state.current_batter_index = idx % lineup.length
  state.current_batter_name = batter?.name || ''
  return batter
}

function _advanceBatter(state) {
  if (state.is_top) {
    const lineup = state.away_lineup
    if (lineup) state.away_batter_idx = ((state.away_batter_idx || 0) + 1) % lineup.length
  } else {
    const lineup = state.home_lineup
    if (lineup) state.home_batter_idx = ((state.home_batter_idx || 0) + 1) % lineup.length
  }
}

function _getBatterBox(state) {
  const box = state.is_top ? state.away_box_score : state.home_box_score
  const idx = state.is_top ? (state.away_batter_idx || 0) : (state.home_batter_idx || 0)
  if (!box || !box.length) return null
  return box[idx % box.length]
}

function _getPitcherBox(state) {
  return state.is_top ? state.home_pitcher_stats : state.away_pitcher_stats
}

function _formatOutcome(outcome) {
  return outcome.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function _advanceRunnersWalk(state) {
  const bases = state.bases
  const ri = state.runner_indices
  let runs = 0
  if (bases[0] && bases[1] && bases[2]) { runs = 1; _scoreRunner(state, ri[2]); ri[2] = null }
  if (bases[0] && bases[1]) { bases[2] = true; ri[2] = ri[1]; ri[1] = null }
  if (bases[0]) { bases[1] = true; ri[1] = ri[0]; ri[0] = null }
  bases[0] = true
  const idx = state.is_top ? (state.away_batter_idx || 0) : (state.home_batter_idx || 0)
  const lineup = state.is_top ? state.away_lineup : state.home_lineup
  ri[0] = lineup ? idx % lineup.length : 0
  return runs
}

function _advanceRunnersHit(state, hitType) {
  const bases = state.bases
  const ri = state.runner_indices
  let runs = 0
  if (hitType === 'single') {
    if (bases[2]) { runs += 1; _scoreRunner(state, ri[2]); bases[2] = false; ri[2] = null }
    if (bases[1]) { bases[2] = true; ri[2] = ri[1]; bases[1] = false; ri[1] = null }
    if (bases[0]) { bases[1] = true; ri[1] = ri[0]; bases[0] = false; ri[0] = null }
    bases[0] = true
    const idx = state.is_top ? (state.away_batter_idx || 0) : (state.home_batter_idx || 0)
    const lineup = state.is_top ? state.away_lineup : state.home_lineup
    ri[0] = lineup ? idx % lineup.length : 0
  } else if (hitType === 'double') {
    if (bases[2]) { runs += 1; _scoreRunner(state, ri[2]); ri[2] = null }
    if (bases[1]) { runs += 1; _scoreRunner(state, ri[1]); ri[1] = null }
    if (bases[0]) { bases[2] = true; ri[2] = ri[0]; bases[0] = false; ri[0] = null } else { bases[2] = false; ri[2] = null }
    bases[1] = true
    const idx = state.is_top ? (state.away_batter_idx || 0) : (state.home_batter_idx || 0)
    const lineup = state.is_top ? state.away_lineup : state.home_lineup
    ri[1] = lineup ? idx % lineup.length : 0
  } else if (hitType === 'triple') {
    for (let i = 0; i < 3; i++) {
      if (bases[i]) { runs += 1; _scoreRunner(state, ri[i]); bases[i] = false; ri[i] = null }
    }
    bases[2] = true
    const idx = state.is_top ? (state.away_batter_idx || 0) : (state.home_batter_idx || 0)
    const lineup = state.is_top ? state.away_lineup : state.home_lineup
    ri[2] = lineup ? idx % lineup.length : 0
  } else if (hitType === 'homerun') {
    for (let i = 0; i < 3; i++) {
      if (bases[i]) { runs += 1; _scoreRunner(state, ri[i]); bases[i] = false; ri[i] = null }
    }
    runs += 1
    // Batter scores too — credit the run
    const idx = state.is_top ? (state.away_batter_idx || 0) : (state.home_batter_idx || 0)
    const lineup = state.is_top ? state.away_lineup : state.home_lineup
    _scoreRunner(state, lineup ? idx % lineup.length : 0)
  }
  return runs
}

/** Credit a run to a runner in the box score */
function _scoreRunner(state, runnerIdx) {
  if (runnerIdx == null) return
  const box = state.is_top ? state.away_box_score : state.home_box_score
  if (box && box[runnerIdx]) box[runnerIdx].r += 1
}

function _scoreRuns(state, runs) {
  if (runs <= 0) return
  const inningIdx = state.inning - 1
  if (state.is_top) {
    state.away_score[inningIdx] += runs
    state.away_total += runs
  } else {
    state.home_score[inningIdx] += runs
    state.home_total += runs
  }
}

function _resetCount(state) {
  state.balls = 0
  state.strikes = 0
}

function _endGame(state) {
  state.game_status = 'final'
  const homeName = state.home_team || 'Home'
  const awayName = state.away_team || 'Away'
  const winner = state.home_total > state.away_total ? 'You win!' : 'You lose!'
  const msg = `Game Over! Final: ${homeName} ${state.home_total} - ${awayName} ${state.away_total}. ${winner}`
  state.play_log.push(msg)
  state.last_play = msg
}

function _endHalfInning(state) {
  state.outs = 0
  state.bases = [false, false, false]
  state.runner_indices = [null, null, null]
  _resetCount(state)

  if (state.is_top) {
    state.is_top = false
    state.player_role = 'batting'
    const half = `Bottom of inning ${state.inning}`
    if (state.inning >= TOTAL_INNINGS && state.home_total > state.away_total) {
      _endGame(state)
      return
    }
    _getCurrentBatter(state)
    const msg = `--- ${half} ---`
    state.play_log.push(msg)
    state.last_play = msg
  } else {
    state.inning += 1
    state.is_top = true
    state.player_role = 'pitching'
    const half = `Top of inning ${state.inning}`
    if (state.inning > TOTAL_INNINGS && state.home_total !== state.away_total) {
      _endGame(state)
      return
    }
    if (state.inning > state.away_score.length) {
      state.away_score.push(0)
      state.home_score.push(0)
    }
    _getCurrentBatter(state)
    const msg = `--- ${half} ---`
    state.play_log.push(msg)
    state.last_play = msg
  }
}

function _pushScorecardPA(state, result, rbi) {
  const sc = state.is_top ? state.away_scorecard : state.home_scorecard
  const idx = state.is_top ? (state.away_batter_idx || 0) : (state.home_batter_idx || 0)
  const lineup = state.is_top ? state.away_lineup : state.home_lineup
  sc.push({
    inning: state.inning,
    batterName: lineup ? lineup[idx % lineup.length]?.name || '' : '',
    batterIdx: lineup ? idx % lineup.length : 0,
    result,
    rbi: rbi || 0,
    runs: 0,
    pitchCount: `${state.balls}-${state.strikes}`,
  })
}

function _walk(state) {
  const batterBox = _getBatterBox(state)
  const pitcherBox = _getPitcherBox(state)
  if (batterBox) batterBox.bb += 1
  if (pitcherBox) pitcherBox.bb += 1
  const msg = 'Ball four — batter walks!'
  state.play_log.push(msg)
  state.last_play = msg
  const runs = _advanceRunnersWalk(state)
  if (batterBox && runs > 0) batterBox.rbi += runs
  if (pitcherBox && runs > 0) { pitcherBox.r += runs; pitcherBox.er += runs }
  _pushScorecardPA(state, 'walk', runs)
  _scoreRuns(state, runs)
  _resetCount(state)
  _advanceBatter(state)
  _getCurrentBatter(state)
}

function _recordOut(state, description, outType) {
  if (outType) _pushScorecardPA(state, outType, 0)
  state.play_log.push(description)
  state.last_play = description
  state.outs += 1
  _resetCount(state)
  _advanceBatter(state)
  if (state.outs >= 3) {
    _endHalfInning(state)
  } else {
    _getCurrentBatter(state)
  }
}

function _recordHit(state, hitType) {
  const batterBox = _getBatterBox(state)
  const pitcherBox = _getPitcherBox(state)
  const runs = _advanceRunnersHit(state, hitType)
  if (batterBox) {
    if (runs > 0) batterBox.rbi += runs
    if (hitType === 'double') batterBox['2b'] += 1
    else if (hitType === 'triple') batterBox['3b'] += 1
    else if (hitType === 'homerun') batterBox.hr += 1
  }
  if (pitcherBox && runs > 0) { pitcherBox.r += runs; pitcherBox.er += runs }
  _pushScorecardPA(state, hitType, runs)
  _scoreRuns(state, runs)
  _resetCount(state)
  _advanceBatter(state)
  _getCurrentBatter(state)
  if (runs > 0) {
    state.play_log.push(`${runs} run(s) score!`)
    state.last_play += ` ${runs} run(s) score!`
  }
}

function _applyOutcome(state, outcome, msg) {
  if (state.is_top) state.home_pitch_count += 1
  else state.away_pitch_count += 1

  state.play_log.push(msg)
  state.last_play = msg

  const batterBox = _getBatterBox(state)
  const pitcherBox = _getPitcherBox(state)

  if (outcome === 'ball') {
    state.balls += 1
    if (state.balls >= 4) _walk(state)
  } else if (outcome === 'strike_looking' || outcome === 'strike_swinging') {
    state.strikes += 1
    if (state.strikes >= 3) {
      if (batterBox) { batterBox.ab += 1; batterBox.so += 1 }
      if (pitcherBox) { pitcherBox.so += 1; pitcherBox.ip_outs += 1 }
      _recordOut(state, 'Strikeout!', 'strikeout')
    }
  } else if (outcome === 'foul') {
    if (state.strikes < 2) state.strikes += 1
  } else if (OUT_TYPES.has(outcome)) {
    if (batterBox) batterBox.ab += 1
    if (pitcherBox) pitcherBox.ip_outs += 1
    _recordOut(state, _formatOutcome(outcome) + '!', outcome)
  } else if (HIT_TYPES.has(outcome)) {
    if (batterBox) { batterBox.ab += 1; batterBox.h += 1 }
    if (pitcherBox) pitcherBox.h += 1
    _recordHit(state, outcome)
  }
}

function _snapshot(state) {
  return {
    inning: state.inning,
    is_top: state.is_top,
    outs: state.outs,
    balls: state.balls,
    strikes: state.strikes,
    bases: [...state.bases],
    runner_indices: [...state.runner_indices],
    away_score: [...state.away_score],
    home_score: [...state.home_score],
    away_total: state.away_total,
    home_total: state.home_total,
    player_role: state.player_role,
    game_status: state.game_status,
    last_play: state.last_play,
    play_log: [...state.play_log],
    current_batter_name: state.current_batter_name || '',
    current_batter_index: state.current_batter_index || 0,
    home_pitcher: state.home_pitcher,
    away_pitcher: state.away_pitcher,
    away_team: state.away_team,
    home_team: state.home_team,
    away_abbreviation: state.away_abbreviation,
    home_abbreviation: state.home_abbreviation,
    away_box_score: state.away_box_score.map((b) => ({ ...b })),
    home_box_score: state.home_box_score.map((b) => ({ ...b })),
    away_pitcher_stats: state.away_pitcher_stats ? { ...state.away_pitcher_stats } : null,
    home_pitcher_stats: state.home_pitcher_stats ? { ...state.home_pitcher_stats } : null,
    weather: state.weather,
    home_pitch_count: state.home_pitch_count,
    away_pitch_count: state.away_pitch_count,
    home_bullpen: state.home_bullpen.map((p) => ({ ...p })),
    away_bullpen: state.away_bullpen.map((p) => ({ ...p })),
    home_scorecard: state.home_scorecard.map((r) => ({ ...r })),
    away_scorecard: state.away_scorecard.map((r) => ({ ...r })),
    classic_relievers: state.classic_relievers,
  }
}

/**
 * Switch the current pitcher for a given side ('home' or 'away').
 * Resets pitch count, initializes new pitcher stats, logs the change.
 */
export function switchPitcher(state, side, newPitcher) {
  const isHome = side === 'home'
  newPitcher.activeStats = (isHome ? newPitcher.splits?.home : newPitcher.splits?.away) || newPitcher.stats
  const oldPitcher = state[side + '_pitcher']
  state[side + '_pitcher'] = newPitcher
  state[side + '_pitch_count'] = 0
  state[side + '_pitcher_stats'] = {
    id: newPitcher.id,
    name: newPitcher.name,
    ip_outs: 0,
    h: 0,
    r: 0,
    er: 0,
    bb: 0,
    so: 0,
  }
  const msg = `Pitching change: ${newPitcher.name} replaces ${oldPitcher?.name || 'pitcher'}`
  state.play_log.push(msg)
  state.last_play = msg
}

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Initialize a new game with teams, lineups, and pitchers.
 * All MLB data is fetched via mlbApi.js.
 */
export async function createNewGame({
  homeTeamId = null,
  season = 2024,
  homePitcherId = null,
  awayTeamId = null,
  awaySeason = null,
  awayPitcherId = null,
  weather = null,
  classicRelievers = null,
} = {}) {
  const state = _emptyState()
  state.game_id = crypto.randomUUID()
  state.weather = weather || 'clear'
  state.classic_relievers = classicRelievers

  if (homeTeamId) {
    try {
      const teams = await mlbApi.getAllTeams()
      const homeTeam = teams.find((t) => t.id === homeTeamId)

      if (homeTeam) {
        let opponent
        if (awayTeamId) {
          opponent = teams.find((t) => t.id === awayTeamId)
          if (!opponent) opponent = await mlbApi.getRandomOpponent(homeTeamId)
        } else {
          opponent = await mlbApi.getRandomOpponent(homeTeamId)
        }

        const oppSeason = awaySeason || season

        state.home_team = homeTeam.name
        state.home_abbreviation = homeTeam.abbreviation
        state.away_team = opponent.name
        state.away_abbreviation = opponent.abbreviation

        // Fetch lineups and pitchers in parallel
        const [homeLineup, awayLineup] = await Promise.all([
          mlbApi.getTeamLineup(homeTeamId, season),
          mlbApi.getTeamLineup(opponent.id, oppSeason),
        ])
        state.home_lineup = homeLineup
        state.away_lineup = awayLineup

        // Fetch pitchers and build bullpens
        const [homePitchers, awayPitchers] = await Promise.all([
          mlbApi.getTeamPitchers(homeTeamId, season),
          mlbApi.getTeamPitchers(opponent.id, oppSeason),
        ])

        if (homePitcherId) {
          const chosen = homePitchers.find((p) => p.id === homePitcherId)
          state.home_pitcher = chosen || homePitchers[0] || await mlbApi.getTeamPitcher(homeTeamId, season)
        } else {
          state.home_pitcher = homePitchers[0] || await mlbApi.getTeamPitcher(homeTeamId, season)
        }

        if (awayPitcherId) {
          const chosen = awayPitchers.find((p) => p.id === awayPitcherId)
          state.away_pitcher = chosen || awayPitchers[0] || await mlbApi.getTeamPitcher(opponent.id, oppSeason)
        } else {
          state.away_pitcher = awayPitchers[0] || await mlbApi.getTeamPitcher(opponent.id, oppSeason)
        }

        const homeRelievers = homePitchers.filter((p) => p.id !== state.home_pitcher.id && p.role !== 'SP')
        state.home_bullpen = homeRelievers.length > 0
          ? homeRelievers
          : homePitchers.filter((p) => p.id !== state.home_pitcher.id)
        const awayRelievers = awayPitchers.filter((p) => p.id !== state.away_pitcher.id && p.role !== 'SP')
        state.away_bullpen = awayRelievers.length > 0
          ? awayRelievers
          : awayPitchers.filter((p) => p.id !== state.away_pitcher.id)

        // Resolve activeStats based on home/away splits
        for (const batter of state.home_lineup) {
          batter.activeStats = batter.splits?.home || batter.stats
        }
        for (const batter of state.away_lineup) {
          batter.activeStats = batter.splits?.away || batter.stats
        }
        state.home_pitcher.activeStats = state.home_pitcher.splits?.home || state.home_pitcher.stats
        state.away_pitcher.activeStats = state.away_pitcher.splits?.away || state.away_pitcher.stats
        for (const p of state.home_bullpen) {
          p.activeStats = p.splits?.home || p.stats
        }
        for (const p of state.away_bullpen) {
          p.activeStats = p.splits?.away || p.stats
        }

        _getCurrentBatter(state)

        // Initialize box scores
        for (const [lineup, key] of [[state.home_lineup, 'home_box_score'], [state.away_lineup, 'away_box_score']]) {
          if (lineup) {
            state[key] = lineup.map((p) => ({
              id: p.id, name: p.name, pos: p.position || '', ab: 0, r: 0, h: 0, '2b': 0, '3b': 0, hr: 0, rbi: 0, bb: 0, so: 0, sb: 0,
            }))
          }
        }

        // Initialize pitcher stats
        for (const [pitcher, key] of [[state.home_pitcher, 'home_pitcher_stats'], [state.away_pitcher, 'away_pitcher_stats']]) {
          if (pitcher) {
            state[key] = { id: pitcher.id, name: pitcher.name, ip_outs: 0, h: 0, r: 0, er: 0, bb: 0, so: 0 }
          }
        }

        const weatherInfo = WEATHER_CONDITIONS[state.weather]
        const weatherStr = weatherInfo ? ` Conditions: ${weatherInfo.label} (${weatherInfo.temp})` : ''
        const msg = `Play Ball! You're the ${homeTeam.name} vs the ${opponent.name}!${weatherStr}`
        state.play_log.push(msg)
        state.last_play = msg
        return state
      }
    } catch {
      // Fall through to default
    }
  }

  state.play_log.push("Play Ball! You're the home team.")
  state.last_play = "Play Ball! You're the home team."
  return state
}

/** Player is pitching — CPU batter decides swing/take. */
export function processPitch(state, pitchType) {
  if (!state || state.game_status !== 'active') return state || {}
  if (state.player_role !== 'pitching') {
    state.last_play = "You're batting right now, not pitching!"
    return state
  }

  const batter = _getCurrentBatter(state)
  const playerStats = batter?.activeStats || batter?.stats || null
  const batterName = batter?.name || 'Batter'
  const pitcher = state.home_pitcher
  const pitcherStats = pitcher?.activeStats || pitcher?.stats || null

  const swings = cpuDecidesSwing()
  const outcome = determineOutcome(pitchType, swings, playerStats, pitcherStats, state.weather, state.home_pitch_count)
  const actionStr = swings ? 'swings' : 'takes'
  const msg = `You throw a ${pitchType}. ${batterName} ${actionStr}: ${_formatOutcome(outcome)}!`
  _applyOutcome(state, outcome, msg)
  return state
}

/** Player is batting — CPU pitches, player swings or takes. */
export function processAtBat(state, action) {
  if (!state || state.game_status !== 'active') return state || {}
  if (state.player_role !== 'batting') {
    state.last_play = "You're pitching right now, not batting!"
    return state
  }

  // CPU auto-replaces its pitcher when fatigued
  if (state.away_pitch_count >= 100 && state.away_bullpen.length > 0) {
    switchPitcher(state, 'away', state.away_bullpen.shift())
  }

  const batter = _getCurrentBatter(state)
  const playerStats = batter?.activeStats || batter?.stats || null
  const pitcher = state.away_pitcher
  const pitcherStats = pitcher?.activeStats || pitcher?.stats || null

  const pitchType = cpuPicksPitch()
  const swings = action === 'swing'
  let outcome
  if (state._forceNextOutcome) {
    outcome = state._forceNextOutcome
    state._forceNextOutcome = null
  } else {
    outcome = determineOutcome(pitchType, swings, playerStats, pitcherStats, state.weather, state.away_pitch_count)
  }
  const actionStr = swings ? 'swing' : 'take'
  const msg = `Pitcher throws a ${pitchType}. You ${actionStr}: ${_formatOutcome(outcome)}!`
  _applyOutcome(state, outcome, msg)
  return state
}

// MLB steal success rate ~75%, attempt rate ~0.06 per plate appearance
const STEAL_SUCCESS_RATE = 0.75
const SIM_STEAL_ATTEMPT_RATE = 0.06  // ~1.1 attempts per team per game

/**
 * Attempt a stolen base. baseIdx: 0 = steal 2nd, 1 = steal 3rd.
 * Returns the state after the attempt.
 */
export function attemptSteal(state, baseIdx) {
  if (!state || state.game_status !== 'active') return state || {}
  if (!state.bases[baseIdx] || state.bases[baseIdx + 1]) {
    state.last_play = "Can't steal — no runner or base occupied!"
    return state
  }

  const box = state.is_top ? state.away_box_score : state.home_box_score
  const runnerIdx = state.runner_indices[baseIdx]
  const runnerName = (box && runnerIdx != null) ? box[runnerIdx]?.name || 'Runner' : 'Runner'
  const targetBase = baseIdx === 0 ? '2nd' : '3rd'

  if (Math.random() < STEAL_SUCCESS_RATE) {
    // Success
    state.bases[baseIdx + 1] = true
    state.runner_indices[baseIdx + 1] = state.runner_indices[baseIdx]
    state.bases[baseIdx] = false
    state.runner_indices[baseIdx] = null
    if (box && runnerIdx != null && box[runnerIdx]) box[runnerIdx].sb += 1
    const msg = `${runnerName} steals ${targetBase}!`
    state.play_log.push(msg)
    state.last_play = msg
  } else {
    // Caught stealing
    state.bases[baseIdx] = false
    state.runner_indices[baseIdx] = null
    state.outs += 1
    const msg = `${runnerName} caught stealing ${targetBase}!`
    state.play_log.push(msg)
    state.last_play = msg
    if (state.outs >= 3) {
      _endHalfInning(state)
    }
  }
  return state
}

/**
 * In simulation, maybe attempt a steal if runners are on base.
 * Called once per plate appearance during simulated games.
 */
function _maybeSimSteal(state) {
  if (Math.random() >= SIM_STEAL_ATTEMPT_RATE) return
  // Prefer stealing 2nd (runner on 1st) over 3rd
  if (state.bases[0] && !state.bases[1]) {
    attemptSteal(state, 0)
  } else if (state.bases[1] && !state.bases[2]) {
    attemptSteal(state, 1)
  }
}

/**
 * Find a reliever from the bullpen by name (case-insensitive partial match).
 * Returns the index in the bullpen array, or -1 if not found.
 */
function _findRelieverIdx(bullpen, name) {
  if (!name || !bullpen.length) return -1
  const lower = name.toLowerCase()
  return bullpen.findIndex((p) => p.name.toLowerCase().includes(lower) || lower.includes(p.name.toLowerCase()))
}

/**
 * Check if a pitching change should happen for the given side, and make it.
 * For classic games with designated relievers, bring in the named reliever
 * around inning 7. Otherwise fall back to the standard fatigue rule (100 pitches).
 */
function _maybeSwapPitcher(state, side) {
  const bullpen = state[side + '_bullpen']
  if (!bullpen.length) return

  const pitchCount = state[side + '_pitch_count']
  const relievers = state.classic_relievers
  const relieverName = relievers?.[side]

  if (relieverName) {
    // Classic mode: bring in the named reliever at inning 7+ (start of a half-inning, 0 outs)
    if (state.inning >= 7 && state.outs === 0) {
      const currentPitcher = state[side + '_pitcher']
      // Only switch if we haven't already switched to this reliever
      if (currentPitcher && !currentPitcher.name.toLowerCase().includes(relieverName.toLowerCase())) {
        const idx = _findRelieverIdx(bullpen, relieverName)
        if (idx >= 0) {
          switchPitcher(state, side, bullpen.splice(idx, 1)[0])
          return
        }
      }
    }
    // Also apply standard fatigue rule as fallback
    if (pitchCount >= 100) {
      switchPitcher(state, side, bullpen.shift())
    }
  } else {
    // Standard fatigue-based replacement
    if (pitchCount >= 100) {
      switchPitcher(state, side, bullpen.shift())
    }
  }
}

/** Simulate an entire game (CPU vs CPU) and return snapshots at each play. */
export function simulateGame(state) {
  if (!state || state.game_status !== 'active') return { state: state || {}, snapshots: [] }

  const snapshots = [_snapshot(state)]
  let iteration = 0
  const maxIterations = 500

  while (state.game_status === 'active' && iteration < maxIterations) {
    iteration++

    // Pre-pitch hook for forced outcomes
    if (state._prePitchHook) state._prePitchHook(state)

    if (state.player_role === 'pitching') {
      _maybeSwapPitcher(state, 'home')
      _maybeSimSteal(state)
      if (state.outs >= 3) { snapshots.push(_snapshot(state)); continue }
      const batter = _getCurrentBatter(state)
      const playerStats = batter?.activeStats || batter?.stats || null
      const batterName = batter?.name || 'Batter'
      const pitcher = state.home_pitcher
      const pitcherStats = pitcher?.activeStats || pitcher?.stats || null

      const pitchType = cpuPicksPitch()
      const swings = cpuDecidesSwing()
      let outcome
      if (state._forceNextOutcome) { outcome = state._forceNextOutcome; state._forceNextOutcome = null }
      else { outcome = determineOutcome(pitchType, swings, playerStats, pitcherStats, state.weather, state.home_pitch_count) }
      const actionStr = swings ? 'swings' : 'takes'
      const msg = `You throw a ${pitchType}. ${batterName} ${actionStr}: ${_formatOutcome(outcome)}!`
      _applyOutcome(state, outcome, msg)
    } else {
      _maybeSwapPitcher(state, 'away')
      _maybeSimSteal(state)
      if (state.outs >= 3) { snapshots.push(_snapshot(state)); continue }
      const batter = _getCurrentBatter(state)
      const playerStats = batter?.activeStats || batter?.stats || null
      const pitcher = state.away_pitcher
      const pitcherStats = pitcher?.activeStats || pitcher?.stats || null

      const pitchType = cpuPicksPitch()
      const swings = cpuDecidesSwing()
      let outcome
      if (state._forceNextOutcome) { outcome = state._forceNextOutcome; state._forceNextOutcome = null }
      else { outcome = determineOutcome(pitchType, swings, playerStats, pitcherStats, state.weather, state.away_pitch_count) }
      const actionStr = swings ? 'swing' : 'take'
      const msg = `Pitcher throws a ${pitchType}. You ${actionStr}: ${_formatOutcome(outcome)}!`
      _applyOutcome(state, outcome, msg)
    }

    snapshots.push(_snapshot(state))
  }

  return { state, snapshots }
}
