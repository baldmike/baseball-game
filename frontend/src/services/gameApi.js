/**
 * gameApi.js — API service layer for communicating with the baseball game backend.
 *
 * This module uses axios to send HTTP requests to the backend REST API.
 * All endpoints are prefixed with "/api" and proxied by the Vite dev server
 * (or served by the same origin in production). Each function returns the
 * parsed response data directly, so callers don't need to unwrap axios responses.
 */

import axios from 'axios'

/**
 * Create a pre-configured axios instance.
 * The baseURL "/api" means all requests go to e.g. "/api/game/teams".
 * In development, Vite's proxy forwards these to the backend server.
 */
const api = axios.create({
  baseURL: '/api',
})

/**
 * Fetch every MLB team available in the database.
 * Returns an array of team objects with id, name, abbreviation, and league fields.
 * Used by TeamSelector and InteractiveGame to populate team-picking UI.
 */
export async function getAllTeams() {
  const { data } = await api.get('/game/teams')
  return data
}

/**
 * Fetch the list of pitchers for a specific team and season.
 * The backend looks up the historical roster for that team/year and returns
 * pitcher objects with id, name, and stats (era, k_per_9, etc.).
 *
 * @param {number} teamId - The MLB team ID (e.g., 147 for Yankees)
 * @param {number} season - The year to pull the roster from (defaults to 2024)
 * @returns {Array} Array of pitcher objects with stats
 */
export async function getTeamPitchers(teamId, season) {
  const { data } = await api.get('/game/pitchers', { params: { team_id: teamId, season: season || 2024 } })
  return data
}

/**
 * Create a new game on the backend and return its initial state.
 *
 * The payload is flexible — if no teamId is provided (the "Skip" path),
 * the backend assigns random teams. Otherwise, the caller specifies
 * home team, away team, season years, and optionally specific pitcher IDs.
 *
 * @param {Object} options - Game creation options
 * @param {number} options.teamId - Home team MLB ID
 * @param {number} options.season - Home team roster season year
 * @param {number} options.homePitcherId - Specific home pitcher MLB ID (or null for auto-assign)
 * @param {number} options.awayTeamId - Away team MLB ID (or null for random)
 * @param {number} options.awaySeason - Away team roster season year
 * @param {number} options.awayPitcherId - Specific away pitcher MLB ID (or null for auto-assign)
 * @returns {Object} The full initial game state including game_id, lineups, scores, etc.
 */
export async function createNewGame({ teamId, season, homePitcherId, awayTeamId, awaySeason, awayPitcherId } = {}) {
  // Only send a payload if the user actually selected a team;
  // otherwise send undefined so the backend uses its default random matchup logic.
  const payload = teamId ? {
    team_id: teamId,
    season: season || 2024,
    home_pitcher_id: homePitcherId || null,
    away_team_id: awayTeamId || null,
    away_season: awaySeason || null,
    away_pitcher_id: awayPitcherId || null,
  } : undefined
  const { data } = await api.post('/game/new', payload)
  return data
}

/**
 * Run a full automated simulation of a game.
 * The backend plays the entire game at once and returns an array of "snapshots" —
 * one game-state object per play. The frontend then replays these snapshots
 * on a timer to animate the game play-by-play (see InteractiveGame's simulation logic).
 *
 * @param {string} gameId - The UUID of the game to simulate
 * @returns {Object} Contains a `snapshots` array of game states, one per at-bat event
 */
export async function simulateGame(gameId) {
  const { data } = await api.post(`/game/${gameId}/simulate`)
  return data
}

/**
 * Fetch the current state of an existing game.
 * Useful for resuming or refreshing the game UI without making a play.
 *
 * @param {string} gameId - The UUID of the game
 * @returns {Object} Full game state (scores, bases, count, lineups, etc.)
 */
export async function getGameState(gameId) {
  const { data } = await api.get(`/game/${gameId}`)
  return data
}

/**
 * Throw a pitch in the active game (used when the player is pitching).
 * The backend resolves the pitch outcome (ball, strike, hit, out, etc.)
 * based on the pitch type and the batter's stats, then returns the updated game state.
 *
 * @param {string} gameId - The UUID of the game
 * @param {string} pitchType - One of 'fastball', 'curveball', 'slider', 'changeup'
 * @returns {Object} Updated game state after the pitch is resolved
 */
export async function throwPitch(gameId, pitchType) {
  const { data } = await api.post(`/game/${gameId}/pitch`, { pitch_type: pitchType })
  return data
}

/**
 * Perform a batting action in the active game (used when the player is batting).
 * The player chooses to "swing" or "take" (watch the pitch go by), and the
 * backend resolves the outcome accordingly.
 *
 * @param {string} gameId - The UUID of the game
 * @param {string} action - Either 'swing' or 'take'
 * @returns {Object} Updated game state after the at-bat action resolves
 */
export async function batAction(gameId, action) {
  const { data } = await api.post(`/game/${gameId}/bat`, { action })
  return data
}
