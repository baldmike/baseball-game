import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
})

export async function getAllTeams() {
  const { data } = await api.get('/game/teams')
  return data
}

export async function getTeamPitchers(teamId, season) {
  const { data } = await api.get('/game/pitchers', { params: { team_id: teamId, season: season || 2024 } })
  return data
}

export async function createNewGame({ teamId, season, homePitcherId, awayTeamId, awaySeason, awayPitcherId } = {}) {
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

export async function simulateGame(gameId) {
  const { data } = await api.post(`/game/${gameId}/simulate`)
  return data
}

export async function getGameState(gameId) {
  const { data } = await api.get(`/game/${gameId}`)
  return data
}

export async function throwPitch(gameId, pitchType) {
  const { data } = await api.post(`/game/${gameId}/pitch`, { pitch_type: pitchType })
  return data
}

export async function batAction(gameId, action) {
  const { data } = await api.post(`/game/${gameId}/bat`, { action })
  return data
}
