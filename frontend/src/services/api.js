import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
})

export async function getTodaysGames() {
  const { data } = await api.get('/games/today')
  return data
}

export async function getGameDetail(gamePk) {
  const { data } = await api.get(`/games/${gamePk}`)
  return data
}

export async function getPlayByPlay(gamePk) {
  const { data } = await api.get(`/games/${gamePk}/playbyplay`)
  return data
}
