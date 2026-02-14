import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
})

export async function getAllTeams() {
  const { data } = await api.get('/game/teams')
  return data
}

export async function createNewGame(teamId, season) {
  const payload = teamId ? { team_id: teamId, season: season || 2024 } : undefined
  const { data } = await api.post('/game/new', payload)
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
