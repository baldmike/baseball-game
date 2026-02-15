/**
 * gameEngine.js — Core game logic and state management.
 * Ported from game_engine.py. Operates on plain state objects.
 */

import * as mlbApi from './mlbApi.js'
import { cpuDecidesSwing, cpuPicksPitch, determineOutcome } from './probabilities.js'

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

function _advanceRunnersWalk(bases) {
  let runs = 0
  if (bases[0] && bases[1] && bases[2]) runs = 1
  if (bases[0] && bases[1]) bases[2] = true
  if (bases[0]) bases[1] = true
  bases[0] = true
  return runs
}

function _advanceRunnersHit(bases, hitType) {
  let runs = 0
  if (hitType === 'single') {
    if (bases[2]) { runs += 1; bases[2] = false }
    if (bases[1]) { bases[2] = true; bases[1] = false }
    if (bases[0]) { bases[1] = true; bases[0] = false }
    bases[0] = true
  } else if (hitType === 'double') {
    if (bases[2]) runs += 1
    if (bases[1]) runs += 1
    if (bases[0]) { bases[2] = true; bases[0] = false } else { bases[2] = false }
    bases[1] = true
  } else if (hitType === 'triple') {
    for (let i = 0; i < 3; i++) {
      if (bases[i]) { runs += 1; bases[i] = false }
    }
    bases[2] = true
  } else if (hitType === 'homerun') {
    for (let i = 0; i < 3; i++) {
      if (bases[i]) { runs += 1; bases[i] = false }
    }
    runs += 1
  }
  return runs
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

function _walk(state) {
  const batterBox = _getBatterBox(state)
  const pitcherBox = _getPitcherBox(state)
  if (batterBox) batterBox.bb += 1
  if (pitcherBox) pitcherBox.bb += 1
  const msg = 'Ball four — batter walks!'
  state.play_log.push(msg)
  state.last_play = msg
  const runs = _advanceRunnersWalk(state.bases)
  if (batterBox && runs > 0) batterBox.rbi += runs
  if (pitcherBox && runs > 0) { pitcherBox.r += runs; pitcherBox.er += runs }
  _scoreRuns(state, runs)
  _resetCount(state)
  _advanceBatter(state)
  _getCurrentBatter(state)
}

function _recordOut(state, description) {
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
  const runs = _advanceRunnersHit(state.bases, hitType)
  if (batterBox && runs > 0) batterBox.rbi += runs
  if (pitcherBox && runs > 0) { pitcherBox.r += runs; pitcherBox.er += runs }
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
      _recordOut(state, 'Strikeout!')
    }
  } else if (outcome === 'foul') {
    if (state.strikes < 2) state.strikes += 1
  } else if (OUT_TYPES.has(outcome)) {
    if (batterBox) batterBox.ab += 1
    if (pitcherBox) pitcherBox.ip_outs += 1
    _recordOut(state, _formatOutcome(outcome) + '!')
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
  }
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
} = {}) {
  const state = _emptyState()
  state.game_id = crypto.randomUUID()

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

        // Fetch pitchers
        if (homePitcherId) {
          const pitchers = await mlbApi.getTeamPitchers(homeTeamId, season)
          const chosen = pitchers.find((p) => p.id === homePitcherId)
          state.home_pitcher = chosen || await mlbApi.getTeamPitcher(homeTeamId, season)
        } else {
          state.home_pitcher = await mlbApi.getTeamPitcher(homeTeamId, season)
        }

        if (awayPitcherId) {
          const pitchers = await mlbApi.getTeamPitchers(opponent.id, oppSeason)
          const chosen = pitchers.find((p) => p.id === awayPitcherId)
          state.away_pitcher = chosen || await mlbApi.getTeamPitcher(opponent.id, oppSeason)
        } else {
          state.away_pitcher = await mlbApi.getTeamPitcher(opponent.id, oppSeason)
        }

        _getCurrentBatter(state)

        // Initialize box scores
        for (const [lineup, key] of [[state.home_lineup, 'home_box_score'], [state.away_lineup, 'away_box_score']]) {
          if (lineup) {
            state[key] = lineup.map((p) => ({
              id: p.id, name: p.name, pos: p.position || '', ab: 0, r: 0, h: 0, rbi: 0, bb: 0, so: 0,
            }))
          }
        }

        // Initialize pitcher stats
        for (const [pitcher, key] of [[state.home_pitcher, 'home_pitcher_stats'], [state.away_pitcher, 'away_pitcher_stats']]) {
          if (pitcher) {
            state[key] = { id: pitcher.id, name: pitcher.name, ip_outs: 0, h: 0, r: 0, er: 0, bb: 0, so: 0 }
          }
        }

        const msg = `Play Ball! You're the ${homeTeam.name} vs the ${opponent.name}!`
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
  const playerStats = batter?.stats || null
  const batterName = batter?.name || 'Batter'
  const pitcher = state.home_pitcher
  const pitcherStats = pitcher?.stats || null

  const swings = cpuDecidesSwing()
  const outcome = determineOutcome(pitchType, swings, playerStats, pitcherStats)
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

  const batter = _getCurrentBatter(state)
  const playerStats = batter?.stats || null
  const pitcher = state.away_pitcher
  const pitcherStats = pitcher?.stats || null

  const pitchType = cpuPicksPitch()
  const swings = action === 'swing'
  const outcome = determineOutcome(pitchType, swings, playerStats, pitcherStats)
  const actionStr = swings ? 'swing' : 'take'
  const msg = `Pitcher throws a ${pitchType}. You ${actionStr}: ${_formatOutcome(outcome)}!`
  _applyOutcome(state, outcome, msg)
  return state
}

/** Simulate an entire game (CPU vs CPU) and return snapshots at each play. */
export function simulateGame(state) {
  if (!state || state.game_status !== 'active') return { state: state || {}, snapshots: [] }

  const snapshots = [_snapshot(state)]
  let iteration = 0
  const maxIterations = 500

  while (state.game_status === 'active' && iteration < maxIterations) {
    iteration++

    if (state.player_role === 'pitching') {
      const batter = _getCurrentBatter(state)
      const playerStats = batter?.stats || null
      const batterName = batter?.name || 'Batter'
      const pitcher = state.home_pitcher
      const pitcherStats = pitcher?.stats || null

      const pitchType = cpuPicksPitch()
      const swings = cpuDecidesSwing()
      const outcome = determineOutcome(pitchType, swings, playerStats, pitcherStats)
      const actionStr = swings ? 'swings' : 'takes'
      const msg = `You throw a ${pitchType}. ${batterName} ${actionStr}: ${_formatOutcome(outcome)}!`
      _applyOutcome(state, outcome, msg)
    } else {
      const batter = _getCurrentBatter(state)
      const playerStats = batter?.stats || null
      const pitcher = state.away_pitcher
      const pitcherStats = pitcher?.stats || null

      const pitchType = cpuPicksPitch()
      const swings = cpuDecidesSwing()
      const outcome = determineOutcome(pitchType, swings, playerStats, pitcherStats)
      const actionStr = swings ? 'swing' : 'take'
      const msg = `Pitcher throws a ${pitchType}. You ${actionStr}: ${_formatOutcome(outcome)}!`
      _applyOutcome(state, outcome, msg)
    }

    snapshots.push(_snapshot(state))
  }

  return { state, snapshots }
}
