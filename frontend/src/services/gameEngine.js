/**
 * gameEngine.js — Core game logic and state management.
 * Operates on plain state objects entirely in the browser.
 *
 * This is the heart of the baseball simulation. Every pitch, hit, out, steal,
 * and double play flows through this module. It tracks all game state including
 * the scoreboard, base runners, box scores, pitch counts, and play-by-play log.
 *
 * ALL FEATURES IN THIS FILE ARE FREE — the game engine has no premium gating.
 * Premium vs free distinctions live entirely in the UI layer (InteractiveGame.vue),
 * which controls what teams/seasons/options the player can select before a game
 * starts. Once a game is created, all mechanics are available to all users.
 *
 * Key subsystems:
 *   - Count tracking: balls, strikes, fouls → walks and strikeouts
 *   - Hit resolution: singles, doubles, triples, home runs → runner advancement
 *   - Out resolution: groundouts, flyouts, lineouts → outs, errors, double plays
 *   - Base running: runner advancement on hits/walks, stolen bases (incl. home)
 *   - Pitching: fatigue tracking, bullpen management, pitcher substitution
 *   - Game flow: half-inning transitions, extra innings, walk-off detection
 *   - Box scores: per-batter stats (AB, H, R, RBI, etc.) and pitcher stats (IP, K, BB, etc.)
 *   - Scorecard: per-PA records for the detailed scorecard view
 */

import * as mlbApi from './mlbApi.js'
import { cpuDecidesSwing, cpuPicksPitch, determineOutcome, BUNT_OUTCOMES, SQUEEZE_OUTCOMES, weightedChoice } from './probabilities.js'
import { WEATHER_CONDITIONS, TIME_OF_DAY, getErrorChance } from './weather.js'

// ============================================================
// CONSTANTS
// ============================================================

/** Standard MLB game length. Extra innings are handled automatically. */
const TOTAL_INNINGS = 9

/** Outcome categories — used to branch logic in _applyOutcome(). */
const HIT_TYPES = new Set(['single', 'double', 'triple', 'homerun'])
const OUT_TYPES = new Set(['groundout', 'flyout', 'lineout', 'popout'])

/**
 * Double play probability when the situation is "in order" (runner on 1st, <2 outs,
 * groundout outcome). MLB GIDP rate in these situations is roughly 50-60%.
 */
const DOUBLE_PLAY_RATE = 0.55

// ============================================================
// STATE INITIALIZATION
// ============================================================

/**
 * Create a blank game state object with all fields initialized to defaults.
 * This is the single source of truth for every piece of game data.
 *
 * The state object is a plain JS object (not reactive) — Vue reactivity is
 * added in InteractiveGame.vue by wrapping it in a ref and spreading on updates.
 */
function _emptyState() {
  return {
    // --- Game identity ---
    game_id: '',

    // --- Inning / half-inning tracking ---
    inning: 1,              // current inning number (1-indexed)
    is_top: true,            // true = top of inning (away bats), false = bottom (home bats)

    // --- Count & outs ---
    outs: 0,                 // outs in the current half-inning (0-2; 3 triggers transition)
    balls: 0,                // balls in the current at-bat (0-3; 4 triggers walk)
    strikes: 0,              // strikes in the current at-bat (0-2; 3 triggers strikeout)

    // --- Base runners ---
    bases: [false, false, false],          // [1st, 2nd, 3rd] — true if occupied
    runner_indices: [null, null, null],     // lineup index of the runner on each base (for box score credit)

    // --- Scoreboard ---
    away_score: Array(TOTAL_INNINGS).fill(0),  // runs per inning (array grows for extras)
    home_score: Array(TOTAL_INNINGS).fill(0),
    away_total: 0,
    home_total: 0,
    away_hits: 0,
    home_hits: 0,
    away_errors: 0,
    home_errors: 0,

    // --- Game flow ---
    player_side: 'home',       // 'home' or 'away' — which team the player controls
    player_role: 'pitching',   // 'pitching' (top of inning) or 'batting' (bottom)
    game_status: 'active',     // 'active' or 'final'

    // --- Play-by-play log ---
    play_log: [],              // array of human-readable play descriptions
    last_play: '',             // most recent play (displayed prominently in the UI)

    // --- Teams ---
    away_team: null,           // full team name (e.g., "New York Yankees")
    home_team: null,
    away_abbreviation: null,   // 3-letter abbreviation (e.g., "NYY")
    home_abbreviation: null,

    // --- Lineups & batting order ---
    away_lineup: null,         // array of 9 batter objects with stats
    home_lineup: null,
    away_batter_idx: 0,        // current position in the batting order (0-8, wraps)
    home_batter_idx: 0,
    current_batter_index: 0,   // lineup index of the batter currently at the plate
    current_batter_name: '',   // display name of the current batter

    // --- Pitchers ---
    home_pitcher: null,        // current pitcher object (with stats, splits, etc.)
    away_pitcher: null,

    // --- Box scores (per-batter stats for the game) ---
    away_box_score: [],        // [{id, name, pos, ab, r, h, 2b, 3b, hr, rbi, bb, so, sb}, ...]
    home_box_score: [],

    // --- Pitcher stats (for the game) ---
    away_pitcher_stats: null,  // {id, name, ip_outs, h, r, er, bb, so}
    home_pitcher_stats: null,
    away_pitcher_history: [],  // previous pitchers' stats (in order they pitched)
    home_pitcher_history: [],

    // --- Weather & time of day (FREE: weather selection, PREMIUM: time of day) ---
    weather: null,             // weather key (e.g., 'clear', 'rain') — affects hit/error probabilities
    time_of_day: null,         // time of day key (e.g., 'day', 'night') — PREMIUM feature in UI, but engine processes it for all games

    // --- Pitch counts & bullpen ---
    home_pitch_count: 0,       // pitches thrown by the home team's current pitcher
    away_pitch_count: 0,
    home_bullpen: [],          // array of reliever objects available to bring in
    away_bullpen: [],

    // --- Per-PA scorecard (for detailed scorecard view) ---
    home_scorecard: [],        // [{inning, batterName, batterIdx, result, rbi, runs, pitchCount}, ...]
    away_scorecard: [],

    // --- Classic game mode ---
    classic_relievers: null,   // {home: 'Rivera', away: 'Nen'} — named relievers for classic matchups

    // --- Bullpen warmup (simulation mode) ---
    home_warmup: null,         // { pitcher, pitches: 0 } or null — reliever warming up
    away_warmup: null,
  }
}

// ============================================================
// INTERNAL HELPERS — Batting order, box scores, formatting
// ============================================================

/**
 * Look up the current batter from the active lineup and update state
 * with their name and index. Called after every batter change.
 */
function _getCurrentBatter(state) {
  const lineup = state.is_top ? state.away_lineup : state.home_lineup
  const idx = state.is_top ? (state.away_batter_idx || 0) : (state.home_batter_idx || 0)
  if (!lineup) return null
  const batter = lineup[idx % lineup.length]
  state.current_batter_index = idx % lineup.length
  state.current_batter_name = batter?.name || ''
  return batter
}

/** Move to the next batter in the batting order (wraps around after #9). */
function _advanceBatter(state) {
  if (state.is_top) {
    const lineup = state.away_lineup
    if (lineup) state.away_batter_idx = ((state.away_batter_idx || 0) + 1) % lineup.length
  } else {
    const lineup = state.home_lineup
    if (lineup) state.home_batter_idx = ((state.home_batter_idx || 0) + 1) % lineup.length
  }
}

/** Get the box score entry for the current batter (for stat tracking). */
function _getBatterBox(state) {
  const box = state.is_top ? state.away_box_score : state.home_box_score
  const idx = state.is_top ? (state.away_batter_idx || 0) : (state.home_batter_idx || 0)
  if (!box || !box.length) return null
  return box[idx % box.length]
}

/** Get the pitcher stats entry for the current pitcher (for stat tracking). */
function _getPitcherBox(state) {
  return state.is_top ? state.home_pitcher_stats : state.away_pitcher_stats
}

/** Convert an outcome key like 'strike_swinging' to display text 'Strike Swinging'. */
function _formatOutcome(outcome) {
  return outcome.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// ============================================================
// RUNNER ADVANCEMENT — Walk and hit logic
// ============================================================

/**
 * Advance all base runners on a walk (base on balls).
 * Runners only move if forced — i.e., all bases behind them are occupied.
 * If bases are loaded, the runner on 3rd scores.
 * Returns the number of runs scored.
 */
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

/**
 * Advance all base runners on a hit (single, double, triple, home run).
 * Each hit type has different advancement rules:
 *   - Single: runners advance 1 base; runner on 3rd scores
 *   - Double: runners on 2nd/3rd score; runner on 1st goes to 3rd
 *   - Triple: all runners score; batter ends up on 3rd
 *   - Home run: everyone scores, including the batter
 * Returns the number of runs scored.
 */
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

/**
 * Advance runners on a sacrifice bunt (batter is out, runners move up one base).
 * Runner on 3rd scores, 2nd→3rd, 1st→2nd. Batter does NOT reach base.
 * Returns the number of runs scored.
 */
function _advanceRunnersBunt(state) {
  const bases = state.bases
  const ri = state.runner_indices
  let runs = 0
  if (bases[2]) { runs += 1; _scoreRunner(state, ri[2]); bases[2] = false; ri[2] = null }
  if (bases[1]) { bases[2] = true; ri[2] = ri[1]; bases[1] = false; ri[1] = null }
  if (bases[0]) { bases[1] = true; ri[1] = ri[0]; bases[0] = false; ri[0] = null }
  return runs
}

/** Credit a run to a runner in the box score */
function _scoreRunner(state, runnerIdx) {
  if (runnerIdx == null) return
  const box = state.is_top ? state.away_box_score : state.home_box_score
  if (box && box[runnerIdx]) box[runnerIdx].r += 1
}

// ============================================================
// SCORING & COUNT MANAGEMENT
// ============================================================

/**
 * Add runs to the scoreboard for the team currently at bat.
 * Updates both the per-inning array and the running total.
 */
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

/** Reset the ball/strike count to 0-0 (after a PA completes). */
function _resetCount(state) {
  state.balls = 0
  state.strikes = 0
}

// ============================================================
// GAME FLOW — End of game, end of half-inning
// ============================================================

/** Mark the game as final and log the final score message. */
function _endGame(state) {
  state.game_status = 'final'
  const homeName = state.home_team || 'Home'
  const awayName = state.away_team || 'Away'
  const playerTotal = state.player_side === 'home' ? state.home_total : state.away_total
  const opponentTotal = state.player_side === 'home' ? state.away_total : state.home_total
  const winner = playerTotal > opponentTotal ? 'You win!' : 'You lose!'
  const msg = `Game Over! Final: ${homeName} ${state.home_total} - ${awayName} ${state.away_total}. ${winner}`
  state.play_log.push(msg)
  state.last_play = msg
}

/**
 * End the current half-inning: reset outs, clear bases, swap sides.
 * Handles walk-off detection (home team ahead after top of 9+) and
 * extra-inning creation (tie game after regulation).
 */
function _endHalfInning(state) {
  state.outs = 0
  state.bases = [false, false, false]
  state.runner_indices = [null, null, null]
  _resetCount(state)

  if (state.is_top) {
    state.is_top = false
    state.player_role = (state.player_side === 'home') ? 'batting' : 'pitching'
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
    state.player_role = (state.player_side === 'home') ? 'pitching' : 'batting'
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

// ============================================================
// SCORECARD — Per-PA records for the detailed scorecard view
// ============================================================

/** Push a plate appearance result onto the scorecard for the batting team. */
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

// ============================================================
// PLATE APPEARANCE RESOLUTION — Walks, outs, hits, double plays
// ============================================================

/** Process a base on balls (walk). Advances forced runners, credits BB stats. */
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

/**
 * Record a single out (strikeout, groundout, flyout, lineout).
 * Increments outs, resets the count, advances the batting order,
 * and triggers end-of-half-inning if this was the 3rd out.
 */
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

/**
 * Record a hit (single, double, triple, home run).
 * Advances runners, credits RBIs and extra-base hits, scores runs,
 * and moves to the next batter.
 */
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

/**
 * Process a ground-into double play (GIDP).
 * Standard 6-4-3 / 4-6-3: lead runner forced at 2nd, batter thrown out at 1st.
 *
 * Conditions (checked in _applyOutcome before calling this):
 *   - Outcome must be 'groundout'
 *   - Runner must be on 1st base
 *   - Less than 2 outs (so 2 more outs won't exceed 3 total... well, it can make exactly 3)
 *
 * Runner advancement on DP:
 *   - Runner on 1st: removed (forced out at 2nd)
 *   - Runner on 2nd: advances to 3rd (not forced, moves up)
 *   - Runner on 3rd: scores (not forced, moves up)
 *   - Batter: out at 1st (does not reach base)
 */
function _applyDoublePlay(state) {
  const batterBox = _getBatterBox(state)
  const pitcherBox = _getPitcherBox(state)

  // Two outs recorded on the play
  state.outs += 2
  if (batterBox) batterBox.ab += 1
  if (pitcherBox) pitcherBox.ip_outs += 2

  // Lead runner forced at 2nd — remove from 1st; batter thrown out at 1st — doesn't reach
  state.bases[0] = false
  state.runner_indices[0] = null

  // Non-forced runners advance freely during the double play
  let runs = 0
  if (state.bases[2]) {
    runs += 1
    _scoreRunner(state, state.runner_indices[2])
    state.bases[2] = false
    state.runner_indices[2] = null
  }
  if (state.bases[1]) {
    state.bases[2] = true
    state.runner_indices[2] = state.runner_indices[1]
    state.bases[1] = false
    state.runner_indices[1] = null
  }

  _scoreRuns(state, runs)
  _pushScorecardPA(state, 'double_play', runs)

  const dpMsg = `Double play! ${runs > 0 ? runs + ' run(s) score!' : ''}`
  state.play_log.push(dpMsg)
  state.last_play = dpMsg

  _resetCount(state)
  _advanceBatter(state)
  if (state.outs >= 3) {
    _endHalfInning(state)
  } else {
    _getCurrentBatter(state)
  }
}

/**
 * Central outcome dispatcher — routes every pitch result to the appropriate handler.
 *
 * Called by processPitch() (player pitching), processAtBat() (player batting),
 * and simulateGame() (CPU vs CPU). Handles:
 *   - Balls → walk after 4
 *   - Strikes → strikeout after 3
 *   - Fouls → increment strike (max 2)
 *   - Outs (groundout/flyout/lineout) → error check → double play check → normal out
 *   - Hits (single/double/triple/homerun) → runner advancement and scoring
 */
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
    if (state._lastActionWasBunt && state.strikes >= 2) {
      // Bunt foul with 2 strikes is a strikeout
      state.strikes = 3
      if (batterBox) { batterBox.ab += 1; batterBox.so += 1 }
      if (pitcherBox) { pitcherBox.so += 1; pitcherBox.ip_outs += 1 }
      _recordOut(state, 'Bunt foul with two strikes — strikeout!', 'strikeout')
    } else {
      if (state.strikes < 2) state.strikes += 1
    }
  } else if (outcome === 'sacrifice_out') {
    // Sacrifice bunt: batter is out, runners advance one base each
    const runs = _advanceRunnersBunt(state)
    if (batterBox) batterBox.ab += 1
    if (pitcherBox) pitcherBox.ip_outs += 1
    if (batterBox && runs > 0) batterBox.rbi += runs
    if (pitcherBox && runs > 0) { pitcherBox.r += runs; pitcherBox.er += runs }
    _scoreRuns(state, runs)
    const desc = runs > 0 ? `Sacrifice bunt! ${runs} run(s) score!` : 'Sacrifice bunt — runners advance!'
    _pushScorecardPA(state, 'sacrifice_out', runs)
    state.play_log.push(desc)
    state.last_play = msg + ' ' + desc
    state.outs += 1
    _resetCount(state)
    _advanceBatter(state)
    if (state.outs >= 3) {
      _endHalfInning(state)
    } else {
      _getCurrentBatter(state)
    }
  } else if (OUT_TYPES.has(outcome)) {
    const errorChance = getErrorChance(state.time_of_day)
    if (Math.random() < errorChance) {
      // Error: batter reaches on an error (treated as a single, no out, no AB)
      // Error is charged to the fielding team (opposite of batting team)
      if (state.is_top) state.home_errors += 1
      else state.away_errors += 1
      const errorMsg = `Error! ${state.current_batter_name || 'Batter'} reaches on an error!`
      state.play_log.push(errorMsg)
      state.last_play = errorMsg
      _pushScorecardPA(state, 'error', 0)
      const runs = _advanceRunnersHit(state, 'single')
      if (pitcherBox && runs > 0) { pitcherBox.r += runs }
      _scoreRuns(state, runs)
      _resetCount(state)
      _advanceBatter(state)
      _getCurrentBatter(state)
      if (runs > 0) {
        state.play_log.push(`${runs} run(s) score!`)
        state.last_play += ` ${runs} run(s) score!`
      }
    } else if (outcome === 'groundout' && (state.bases[0] || state.bases[1] || state.bases[2]) && state.outs < 2 && Math.random() < DOUBLE_PLAY_RATE) {
      // Double play: runner on any base, less than 2 outs
      _applyDoublePlay(state)
    } else {
      if (batterBox) batterBox.ab += 1
      if (pitcherBox) pitcherBox.ip_outs += 1
      _recordOut(state, _formatOutcome(outcome) + '!', outcome)
    }
  } else if (HIT_TYPES.has(outcome)) {
    if (batterBox) { batterBox.ab += 1; batterBox.h += 1 }
    if (pitcherBox) pitcherBox.h += 1
    if (state.is_top) state.away_hits += 1
    else state.home_hits += 1
    _recordHit(state, outcome)
  }
}

// ============================================================
// SNAPSHOT — Deep-copy state for simulation replay
// ============================================================

/**
 * Create a deep copy of the game state for simulation replay.
 * Each snapshot captures the state after one play, allowing the UI
 * to step through the game play-by-play in the simulation viewer.
 */
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
    away_hits: state.away_hits,
    home_hits: state.home_hits,
    away_errors: state.away_errors,
    home_errors: state.home_errors,
    player_side: state.player_side,
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
    away_pitcher_history: (state.away_pitcher_history || []).map((s) => ({ ...s })),
    home_pitcher_history: (state.home_pitcher_history || []).map((s) => ({ ...s })),
    weather: state.weather,
    time_of_day: state.time_of_day,
    home_pitch_count: state.home_pitch_count,
    away_pitch_count: state.away_pitch_count,
    home_bullpen: state.home_bullpen.map((p) => ({ ...p })),
    away_bullpen: state.away_bullpen.map((p) => ({ ...p })),
    home_scorecard: state.home_scorecard.map((r) => ({ ...r })),
    away_scorecard: state.away_scorecard.map((r) => ({ ...r })),
    classic_relievers: state.classic_relievers,
    home_warmup: state.home_warmup ? { pitcher: state.home_warmup.pitcher, pitches: state.home_warmup.pitches } : null,
    away_warmup: state.away_warmup ? { pitcher: state.away_warmup.pitcher, pitches: state.away_warmup.pitches } : null,
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
  // Save outgoing pitcher's stats to history
  if (!state[side + '_pitcher_history']) state[side + '_pitcher_history'] = []
  const oldStats = state[side + '_pitcher_stats']
  if (oldStats) {
    state[side + '_pitcher_history'].push({ ...oldStats })
  }
  state[side + '_pitcher'] = newPitcher
  state[side + '_pitch_count'] = 0
  state[side + '_warmup'] = null
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
 *
 * This function is called from the UI after the player completes the setup wizard.
 * It accepts whatever teams/seasons/pitchers the UI provides — the engine itself
 * has no concept of free vs premium. Premium gating (season ranges, opponent
 * season selection, time-of-day picker) is enforced in InteractiveGame.vue BEFORE
 * this function is called.
 *
 * The `timeOfDay` parameter affects error chance probabilities via weather.js.
 * It is only set when a premium user selects a time of day in the UI;
 * free users get `null` (which defaults to a baseline 2% error chance).
 */
export async function createNewGame({
  homeTeamId = null,
  season = 2024,
  homePitcherId = null,
  awayTeamId = null,
  awaySeason = null,
  awayPitcherId = null,
  weather = null,
  timeOfDay = null,
  classicRelievers = null,
  playerSide = 'home',
} = {}) {
  const state = _emptyState()
  state.game_id = crypto.randomUUID()
  state.weather = weather || 'clear'
  state.time_of_day = timeOfDay || null
  state.classic_relievers = classicRelievers
  state.player_side = playerSide
  // Set initial player_role based on side: home pitches first (top), away bats first (top)
  state.player_role = playerSide === 'home' ? 'pitching' : 'batting'

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
        const todInfo = state.time_of_day ? TIME_OF_DAY[state.time_of_day] : null
        const todStr = todInfo ? ` ${todInfo.icon} ${todInfo.label}` : ''
        const playerTeam = playerSide === 'home' ? homeTeam.name : opponent.name
        const cpuTeam = playerSide === 'home' ? opponent.name : homeTeam.name
        const msg = `Play Ball! You're the ${playerTeam} vs the ${cpuTeam}!${weatherStr}${todStr}`
        state.play_log.push(msg)
        state.last_play = msg
        return state
      }
    } catch {
      // Fall through to default
    }
  }

  const sideLabel = playerSide === 'home' ? 'home' : 'away'
  state.play_log.push(`Play Ball! You're the ${sideLabel} team.`)
  state.last_play = `Play Ball! You're the ${sideLabel} team.`
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
  const side = state.player_side || 'home'
  const pitcher = state[side + '_pitcher']
  const pitcherStats = pitcher?.activeStats || pitcher?.stats || null

  const swings = cpuDecidesSwing()
  let outcome = determineOutcome(pitchType, swings, playerStats, pitcherStats, state.weather, state[side + '_pitch_count'], state.time_of_day)
  if (state._outcomeFilter) outcome = state._outcomeFilter(state, outcome)
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
  const cpuSide = (state.player_side || 'home') === 'home' ? 'away' : 'home'
  if (state[cpuSide + '_pitch_count'] >= 100 && state[cpuSide + '_bullpen'].length > 0) {
    switchPitcher(state, cpuSide, state[cpuSide + '_bullpen'].shift())
  }

  const batter = _getCurrentBatter(state)
  const playerStats = batter?.activeStats || batter?.stats || null
  const pitcher = state[cpuSide + '_pitcher']
  const pitcherStats = pitcher?.activeStats || pitcher?.stats || null

  // CPU pitcher selects a pitch type (fastball, slider, curveball, changeup)
  const pitchType = cpuPicksPitch()

  // Squeeze play: coupled bunt + runner logic (not routed through _applyOutcome)
  if (action === 'squeeze') {
    // Fall back to normal bunt if no runner on 3rd
    if (!state.bases[2]) {
      action = 'bunt'
    } else {
      if (state.is_top) state.home_pitch_count += 1
      else state.away_pitch_count += 1

      let outcome
      if (state._forceNextOutcome) {
        outcome = state._forceNextOutcome
        state._forceNextOutcome = null
      } else {
        outcome = weightedChoice(SQUEEZE_OUTCOMES)
      }
      if (state._outcomeFilter) outcome = state._outcomeFilter(state, outcome)

      const batterBox = _getBatterBox(state)
      const pitcherBox = _getPitcherBox(state)
      const msg = `Pitcher throws a ${pitchType}. You squeeze: ${_formatOutcome(outcome)}!`
      state.play_log.push(msg)
      state.last_play = msg

      if (outcome === 'squeeze_score_batter_out') {
        // Runner scores, batter out
        _scoreRunner(state, state.runner_indices[2])
        state.bases[2] = false
        state.runner_indices[2] = null
        // Advance other runners
        if (state.bases[1]) { state.bases[2] = true; state.runner_indices[2] = state.runner_indices[1]; state.bases[1] = false; state.runner_indices[1] = null }
        if (state.bases[0]) { state.bases[1] = true; state.runner_indices[1] = state.runner_indices[0]; state.bases[0] = false; state.runner_indices[0] = null }
        _scoreRuns(state, 1)
        if (batterBox) { batterBox.ab += 1; batterBox.rbi += 1 }
        if (pitcherBox) { pitcherBox.ip_outs += 1; pitcherBox.r += 1; pitcherBox.er += 1 }
        _pushScorecardPA(state, 'squeeze_score_batter_out', 1)
        state.outs += 1
        _resetCount(state)
        _advanceBatter(state)
        if (state.outs >= 3) _endHalfInning(state)
        else _getCurrentBatter(state)
      } else if (outcome === 'squeeze_both_safe') {
        // Runner scores, batter reaches 1st
        _scoreRunner(state, state.runner_indices[2])
        state.bases[2] = false
        state.runner_indices[2] = null
        // Advance other runners
        if (state.bases[1]) { state.bases[2] = true; state.runner_indices[2] = state.runner_indices[1]; state.bases[1] = false; state.runner_indices[1] = null }
        if (state.bases[0]) { state.bases[1] = true; state.runner_indices[1] = state.runner_indices[0]; state.bases[0] = false; state.runner_indices[0] = null }
        // Batter to 1st
        state.bases[0] = true
        const idx = state.is_top ? (state.away_batter_idx || 0) : (state.home_batter_idx || 0)
        const lineup = state.is_top ? state.away_lineup : state.home_lineup
        state.runner_indices[0] = lineup ? idx % lineup.length : 0
        _scoreRuns(state, 1)
        if (batterBox) { batterBox.ab += 1; batterBox.h += 1; batterBox.rbi += 1 }
        if (pitcherBox) { pitcherBox.h += 1; pitcherBox.r += 1; pitcherBox.er += 1 }
        if (state.is_top) state.away_hits += 1
        else state.home_hits += 1
        _pushScorecardPA(state, 'squeeze_both_safe', 1)
        _resetCount(state)
        _advanceBatter(state)
        _getCurrentBatter(state)
      } else if (outcome === 'squeeze_runner_out') {
        // Runner out at home, batter reaches 1st, other runners hold
        state.bases[2] = false
        state.runner_indices[2] = null
        state.outs += 1
        // Batter to 1st
        state.bases[0] = true
        const idx = state.is_top ? (state.away_batter_idx || 0) : (state.home_batter_idx || 0)
        const lineup = state.is_top ? state.away_lineup : state.home_lineup
        state.runner_indices[0] = lineup ? idx % lineup.length : 0
        if (batterBox) batterBox.ab += 1
        if (pitcherBox) pitcherBox.ip_outs += 1
        _pushScorecardPA(state, 'squeeze_runner_out', 0)
        _resetCount(state)
        _advanceBatter(state)
        if (state.outs >= 3) _endHalfInning(state)
        else _getCurrentBatter(state)
      } else if (outcome === 'squeeze_both_out') {
        // Runner out, batter out — double play
        state.bases[2] = false
        state.runner_indices[2] = null
        state.outs += 1
        if (batterBox) batterBox.ab += 1
        if (pitcherBox) pitcherBox.ip_outs += 1
        if (state.outs >= 3) {
          _pushScorecardPA(state, 'squeeze_both_out', 0)
          _resetCount(state)
          _advanceBatter(state)
          _endHalfInning(state)
        } else {
          state.outs += 1
          if (pitcherBox) pitcherBox.ip_outs += 1
          _pushScorecardPA(state, 'squeeze_both_out', 0)
          _resetCount(state)
          _advanceBatter(state)
          if (state.outs >= 3) _endHalfInning(state)
          else _getCurrentBatter(state)
        }
      } else if (outcome === 'squeeze_foul') {
        // Foul ball — runner retreats to 3rd, add strike (2-strike foul = K)
        if (state.strikes >= 2) {
          state.strikes = 3
          if (batterBox) { batterBox.ab += 1; batterBox.so += 1 }
          if (pitcherBox) { pitcherBox.so += 1; pitcherBox.ip_outs += 1 }
          _recordOut(state, 'Squeeze foul with two strikes — strikeout!', 'strikeout')
        } else {
          state.strikes += 1
        }
      }
      return state
    }
  }

  // Determine outcome: forced (testing), bunt table, or normal swing/take
  let outcome
  if (state._forceNextOutcome) {
    outcome = state._forceNextOutcome
    state._forceNextOutcome = null
  } else if (action === 'bunt') {
    // Bunts use a flat probability table — no pitch-type or stat adjustments
    outcome = weightedChoice(BUNT_OUTCOMES)
  } else {
    const swings = action === 'swing'
    outcome = determineOutcome(pitchType, swings, playerStats, pitcherStats, state.weather, state[cpuSide + '_pitch_count'], state.time_of_day)
  }

  if (state._outcomeFilter) outcome = state._outcomeFilter(state, outcome)
  // Flag bunt action so _applyOutcome can enforce bunt-foul strikeout rule
  state._lastActionWasBunt = action === 'bunt'
  const actionStr = action === 'bunt' ? 'bunt' : (action === 'swing' ? 'swing' : 'take')
  const msg = `Pitcher throws a ${pitchType}. You ${actionStr}: ${_formatOutcome(outcome)}!`
  _applyOutcome(state, outcome, msg)
  state._lastActionWasBunt = false
  return state
}

// ============================================================
// STOLEN BASES — Manual (interactive) and automatic (simulation)
// ============================================================

/** MLB pickoff success rate when attempted is ~10-20%. */
const PICKOFF_SUCCESS_RATE = 0.15

/** Higher pickoff success rate when the runner is leading off. */
const PICKOFF_LEADOFF_RATE = 0.30

/** MLB average stolen base success rate is ~75%. */
const STEAL_SUCCESS_RATE = 0.75

/**
 * Stealing home is extremely risky — MLB success rate when attempted is ~30-40%.
 * Players very rarely attempt it (maybe a few times per season league-wide).
 */
const STEAL_HOME_SUCCESS_RATE = 0.30

/** Probability the CPU attempts a steal per plate appearance in sim mode (~1.1 per team per game). */
const SIM_STEAL_ATTEMPT_RATE = 0.06

/** Probability the CPU attempts to steal home in sim mode (extremely rare). */
const SIM_STEAL_HOME_ATTEMPT_RATE = 0.005

/**
 * Attempt a stolen base.
 *   baseIdx = 0 → runner on 1st steals 2nd
 *   baseIdx = 1 → runner on 2nd steals 3rd
 *   baseIdx = 2 → runner on 3rd steals home (scores a run on success)
 *
 * On success: runner advances (or scores), SB stat credited.
 * On failure: runner is out (caught stealing), base cleared.
 * Returns the updated state.
 */
export function attemptSteal(state, baseIdx) {
  if (!state || state.game_status !== 'active') return state || {}

  // Steal home: baseIdx=2, runner on 3rd steals home plate
  if (baseIdx === 2) {
    if (!state.bases[2]) {
      state.last_play = "Can't steal — no runner on 3rd!"
      return state
    }
    const box = state.is_top ? state.away_box_score : state.home_box_score
    const runnerIdx = state.runner_indices[2]
    const runnerName = (box && runnerIdx != null) ? box[runnerIdx]?.name || 'Runner' : 'Runner'

    if (Math.random() < STEAL_HOME_SUCCESS_RATE) {
      _scoreRunner(state, runnerIdx)
      _scoreRuns(state, 1)
      state.bases[2] = false
      state.runner_indices[2] = null
      if (box && runnerIdx != null && box[runnerIdx]) box[runnerIdx].sb += 1
      const msg = `${runnerName} steals home! Run scores!`
      state.play_log.push(msg)
      state.last_play = msg
    } else {
      state.bases[2] = false
      state.runner_indices[2] = null
      state.outs += 1
      const msg = `${runnerName} caught stealing home!`
      state.play_log.push(msg)
      state.last_play = msg
      if (state.outs >= 3) {
        _endHalfInning(state)
      }
    }
    return state
  }

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
 * Attempt a pickoff throw to a base (player-pitcher only).
 *   baseIdx = 0 → throw to 1st
 *   baseIdx = 1 → throw to 2nd
 *   baseIdx = 2 → throw to 3rd
 *
 * On success: runner is out, base cleared.
 * On failure: runner is safe, no state change except log + pitch count.
 * Returns the updated state.
 */
export function attemptPickoff(state, baseIdx, leadoff) {
  if (!state || state.game_status !== 'active') return state || {}
  if (state.player_role !== 'pitching') {
    state.last_play = "You can only attempt a pickoff while pitching!"
    return state
  }
  if (!state.bases[baseIdx]) {
    const baseLabel = baseIdx === 0 ? '1st' : baseIdx === 1 ? '2nd' : '3rd'
    state.last_play = `Can't throw to ${baseLabel} — no runner!`
    return state
  }

  const box = state.is_top ? state.away_box_score : state.home_box_score
  const runnerIdx = state.runner_indices[baseIdx]
  const runnerName = (box && runnerIdx != null) ? box[runnerIdx]?.name || 'Runner' : 'Runner'
  const baseLabel = baseIdx === 0 ? '1st' : baseIdx === 1 ? '2nd' : '3rd'
  const rate = leadoff ? PICKOFF_LEADOFF_RATE : PICKOFF_SUCCESS_RATE

  if (Math.random() < rate) {
    // Picked off
    state.bases[baseIdx] = false
    state.runner_indices[baseIdx] = null
    state.outs += 1
    const msg = `Picked off ${runnerName} at ${baseLabel}!`
    state.play_log.push(msg)
    state.last_play = msg
    if (state.outs >= 3) {
      _endHalfInning(state)
    }
  } else {
    // Safe
    const msg = `Throw to ${baseLabel} — ${runnerName} is safe!`
    state.play_log.push(msg)
    state.last_play = msg
    // Costs a throw — increment pitch count
    if (state.is_top) state.home_pitch_count += 1
    else state.away_pitch_count += 1
  }
  return state
}

/** Probability a runner takes an aggressive lead on any given pitch. */
const SIM_LEADOFF_RATE = 0.20

/** Probability the pitcher throws over when a runner is leading. */
const SIM_THROW_OVER_RATE = 0.15

/**
 * In simulation mode, runners may take aggressive leads off base.
 * If a runner leads off, the pitcher may throw over for a pickoff attempt
 * (using the higher PICKOFF_LEADOFF_RATE). Called once per pitch.
 */
function _maybeSimLeadoff(state) {
  const box = state.is_top ? state.away_box_score : state.home_box_score
  // Check each base (prefer furthest runner — 3rd, 2nd, 1st)
  for (let b = 2; b >= 0; b--) {
    if (!state.bases[b]) continue
    if (Math.random() >= SIM_LEADOFF_RATE) continue

    const runnerIdx = state.runner_indices[b]
    const runnerName = (box && runnerIdx != null) ? box[runnerIdx]?.name || 'Runner' : 'Runner'
    const baseLabel = b === 0 ? '1st' : b === 1 ? '2nd' : '3rd'
    const leadMsg = `${runnerName} takes a lead off ${baseLabel}`
    state.play_log.push(leadMsg)
    state.last_play = leadMsg

    // Pitcher may throw over
    if (Math.random() < SIM_THROW_OVER_RATE) {
      if (state.is_top) state.home_pitch_count += 1
      else state.away_pitch_count += 1

      if (Math.random() < PICKOFF_LEADOFF_RATE) {
        state.bases[b] = false
        state.runner_indices[b] = null
        state.outs += 1
        const msg = `Throw to ${baseLabel} — ${runnerName} picked off!`
        state.play_log.push(msg)
        state.last_play = msg
        if (state.outs >= 3) _endHalfInning(state)
      } else {
        const msg = `Throw to ${baseLabel} — ${runnerName} is safe!`
        state.play_log.push(msg)
        state.last_play = msg
      }
    }
    // Only one leadoff event per pitch
    return
  }
}

/**
 * In simulation mode, roll the dice to see if the CPU attempts a steal.
 * Called once per plate appearance. Priority: steal home (very rare) > steal 2nd > steal 3rd.
 */
function _maybeSimSteal(state) {
  // Steal home: extremely rare (~0.5% chance per PA with runner on 3rd)
  if (state.bases[2] && Math.random() < SIM_STEAL_HOME_ATTEMPT_RATE) {
    attemptSteal(state, 2)
    return
  }
  if (Math.random() >= SIM_STEAL_ATTEMPT_RATE) return
  // Prefer stealing 2nd (runner on 1st) over 3rd
  if (state.bases[0] && !state.bases[1]) {
    attemptSteal(state, 0)
  } else if (state.bases[1] && !state.bases[2]) {
    attemptSteal(state, 1)
  }
}

// ============================================================
// PITCHING CHANGES — Fatigue and classic-mode reliever logic
// ============================================================

/**
 * Find a reliever from the bullpen by name (case-insensitive partial match).
 * Used for classic matchups where specific relievers are designated (e.g., Rivera).
 * Returns the index in the bullpen array, or -1 if not found.
 */
function _findRelieverIdx(bullpen, name) {
  if (!name || !bullpen.length) return -1
  const lower = name.toLowerCase()
  return bullpen.findIndex((p) => p.name.toLowerCase().includes(lower) || lower.includes(p.name.toLowerCase()))
}

/** Pitch count at which warmup begins. */
const WARMUP_TRIGGER = 75

/** Pitches needed to fully warm up a reliever (matches interactive mode). */
const SIM_WARMUP_PITCHES = 13

/**
 * Check if a pitching change should happen for the given side, and make it.
 *
 * Warmup flow (simulation mode):
 *   1. At 60+ pitches (50% health), start warming up the next reliever
 *   2. Each call increments the warmup pitch counter
 *   3. When warmup is complete (13 pitches), bring the reliever in
 *   4. Safety net: force swap at 100 pitches even if warmup isn't done
 *
 * Classic mode: named relievers still enter at inning 7, but with warmup announcements.
 */
function _maybeSwapPitcher(state, side) {
  const bullpen = state[side + '_bullpen']
  if (!bullpen.length) return

  // Never pull a pitcher throwing a no-hitter
  const opponentHits = side === 'home' ? state.away_hits : state.home_hits
  if (opponentHits === 0) return

  const pitchCount = state[side + '_pitch_count']
  const warmupKey = side + '_warmup'
  const warmup = state[warmupKey]
  const relievers = state.classic_relievers
  const relieverName = relievers?.[side]
  const abbrev = state[side + '_abbreviation'] || side.toUpperCase()

  // --- Classic mode: named reliever at inning 7 ---
  if (relieverName) {
    if (state.inning >= 7 && state.outs === 0) {
      const currentPitcher = state[side + '_pitcher']
      if (currentPitcher && !currentPitcher.name.toLowerCase().includes(relieverName.toLowerCase())) {
        const idx = _findRelieverIdx(bullpen, relieverName)
        if (idx >= 0) {
          // Start warmup if not already warming this pitcher
          if (!warmup || warmup.pitcher.id !== bullpen[idx].id) {
            const reliever = bullpen[idx]
            state[warmupKey] = { pitcher: reliever, pitches: 0 }
            const msg = `${abbrev} warming up ${reliever.name} in the bullpen`
            state.play_log.push(msg)
            state.last_play = msg
          }
        }
      }
    }
  }

  // --- Warmup trigger at 50% health (60 pitches) ---
  if (!warmup && pitchCount >= WARMUP_TRIGGER) {
    let reliever
    let relieverIdx
    if (relieverName) {
      relieverIdx = _findRelieverIdx(bullpen, relieverName)
      reliever = relieverIdx >= 0 ? bullpen[relieverIdx] : bullpen[0]
    } else {
      reliever = bullpen[0]
    }
    state[warmupKey] = { pitcher: reliever, pitches: 0 }
    const msg = `${abbrev} warming up ${reliever.name} in the bullpen`
    state.play_log.push(msg)
    state.last_play = msg
  }

  // --- Increment warmup pitches ---
  if (state[warmupKey]) {
    state[warmupKey].pitches += 1

    // --- Warmup complete: bring the reliever in ---
    if (state[warmupKey].pitches >= SIM_WARMUP_PITCHES) {
      const readyPitcher = state[warmupKey].pitcher
      const idx = bullpen.indexOf(readyPitcher)
      if (idx >= 0) {
        bullpen.splice(idx, 1)
      } else {
        bullpen.shift()
      }
      switchPitcher(state, side, readyPitcher)
      return
    }
  }

  // --- Safety net: force swap at 100 pitches ---
  if (pitchCount >= 100) {
    const readyPitcher = warmup ? warmup.pitcher : bullpen[0]
    const idx = bullpen.indexOf(readyPitcher)
    if (idx >= 0) {
      bullpen.splice(idx, 1)
    } else {
      bullpen.shift()
    }
    switchPitcher(state, side, readyPitcher)
  }
}

// ============================================================
// SIMULATION — CPU vs CPU full-game simulation
// ============================================================

/**
 * Simulate an entire game (CPU vs CPU) from the current state to completion.
 * Returns {state, snapshots} where snapshots is an array of state copies,
 * one per play, used by the UI to replay the game with animation.
 * Capped at 500 iterations as a safety valve against infinite loops.
 */
export function simulateGame(state) {
  if (!state || state.game_status !== 'active') return { state: state || {}, snapshots: [] }

  const snapshots = [_snapshot(state)]
  let iteration = 0
  const maxIterations = 500

  while (state.game_status === 'active' && iteration < maxIterations) {
    iteration++

    // Pre-pitch hook for forced outcomes
    if (state._prePitchHook) state._prePitchHook(state)

    const pSide = state.player_side || 'home'
    const cpuSide = pSide === 'home' ? 'away' : 'home'

    if (state.player_role === 'pitching') {
      _maybeSwapPitcher(state, pSide)
      _maybeSimLeadoff(state)
      if (state.outs >= 3) { snapshots.push(_snapshot(state)); continue }
      _maybeSimSteal(state)
      if (state.outs >= 3) { snapshots.push(_snapshot(state)); continue }
      const batter = _getCurrentBatter(state)
      const playerStats = batter?.activeStats || batter?.stats || null
      const batterName = batter?.name || 'Batter'
      const pitcher = state[pSide + '_pitcher']
      const pitcherStats = pitcher?.activeStats || pitcher?.stats || null

      const pitchType = cpuPicksPitch()
      const swings = cpuDecidesSwing()
      let outcome
      if (state._forceNextOutcome) { outcome = state._forceNextOutcome; state._forceNextOutcome = null }
      else { outcome = determineOutcome(pitchType, swings, playerStats, pitcherStats, state.weather, state[pSide + '_pitch_count'], state.time_of_day) }
      if (state._outcomeFilter) outcome = state._outcomeFilter(state, outcome)
      const actionStr = swings ? 'swings' : 'takes'
      const msg = `You throw a ${pitchType}. ${batterName} ${actionStr}: ${_formatOutcome(outcome)}!`
      _applyOutcome(state, outcome, msg)
    } else {
      _maybeSwapPitcher(state, cpuSide)
      _maybeSimLeadoff(state)
      if (state.outs >= 3) { snapshots.push(_snapshot(state)); continue }
      _maybeSimSteal(state)
      if (state.outs >= 3) { snapshots.push(_snapshot(state)); continue }
      const batter = _getCurrentBatter(state)
      const playerStats = batter?.activeStats || batter?.stats || null
      const pitcher = state[cpuSide + '_pitcher']
      const pitcherStats = pitcher?.activeStats || pitcher?.stats || null

      const pitchType = cpuPicksPitch()
      const swings = cpuDecidesSwing()
      let outcome
      if (state._forceNextOutcome) { outcome = state._forceNextOutcome; state._forceNextOutcome = null }
      else { outcome = determineOutcome(pitchType, swings, playerStats, pitcherStats, state.weather, state[cpuSide + '_pitch_count'], state.time_of_day) }
      if (state._outcomeFilter) outcome = state._outcomeFilter(state, outcome)
      const actionStr = swings ? 'swing' : 'take'
      const msg = `Pitcher throws a ${pitchType}. You ${actionStr}: ${_formatOutcome(outcome)}!`
      _applyOutcome(state, outcome, msg)
    }

    snapshots.push(_snapshot(state))
  }

  return { state, snapshots }
}
