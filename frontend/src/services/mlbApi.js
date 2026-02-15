/**
 * mlbApi.js — MLB Stats API integration via CORS proxy.
 * Ported from mlb_service.py. Uses native fetch instead of axios.
 */

const MLB_BASE = 'https://statsapi.mlb.com'
const CORS_PROXY = 'https://corsproxy.io/?url='

/** Minor league team IDs mapped to their sportId (for stats queries). */
const MINOR_LEAGUE_TEAMS = { 247: 12 } // Birmingham Barons = Double-A

/** Players guaranteed a lineup spot when their team is selected (by team ID). */
const GUARANTEED_LINEUP = { 247: [470052] } // Michael Jordan on the Barons

function sportIdForTeam(teamId) {
  return MINOR_LEAGUE_TEAMS[teamId] || 1
}

async function mlbFetch(path) {
  const url = `${CORS_PROXY}${encodeURIComponent(`${MLB_BASE}${path}`)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`MLB API error: ${res.status}`)
  return res.json()
}

/** Fetch today's MLB schedule with scores and game status. */
export async function getTodaysGames() {
  try {
    const today = new Date()
    const mm = String(today.getMonth() + 1).padStart(2, '0')
    const dd = String(today.getDate()).padStart(2, '0')
    const yyyy = today.getFullYear()
    const dateStr = `${mm}/${dd}/${yyyy}`
    const data = await mlbFetch(`/api/v1/schedule?sportId=1&date=${dateStr}&hydrate=linescore`)
    const games = []
    for (const dateEntry of data.dates || []) {
      for (const game of dateEntry.games || []) {
        const linescore = game.linescore || {}
        games.push({
          game_pk: game.gamePk,
          away_team: game.teams?.away?.team?.name || '',
          home_team: game.teams?.home?.team?.name || '',
          status: game.status?.detailedState || '',
          away_score: game.teams?.away?.score ?? 0,
          home_score: game.teams?.home?.score ?? 0,
          inning: linescore.currentInning || '',
          inning_state: linescore.inningState || '',
        })
      }
    }
    return games
  } catch {
    return []
  }
}

/** Fetch detailed box score data for a specific game. */
export async function getGameDetail(gamePk) {
  try {
    const data = await mlbFetch(`/api/v1.1/game/${gamePk}/boxscore`)
    return {
      game_pk: gamePk,
      away_team: data.teams?.away?.team?.name || '',
      home_team: data.teams?.home?.team?.name || '',
      away_batters: data.teams?.away?.batters || [],
      home_batters: data.teams?.home?.batters || [],
    }
  } catch {
    return { game_pk: gamePk, away_team: '', home_team: '', away_batters: [], home_batters: [] }
  }
}

/** Fetch complete play-by-play data for a specific game. */
export async function getPlayByPlay(gamePk) {
  try {
    const data = await mlbFetch(`/api/v1/game/${gamePk}/playByPlay`)
    const plays = []
    for (const play of data.allPlays || []) {
      const result = play.result || {}
      const about = play.about || {}
      const matchup = play.matchup || {}

      const pitchEvents = []
      for (const event of play.playEvents || []) {
        if (event.isPitch) {
          const details = event.details || {}
          const pitchData = event.pitchData || {}
          pitchEvents.push({
            pitch_type: details.type?.description || '',
            speed: pitchData.startSpeed ?? null,
            call: details.description || '',
            strike_zone_top: pitchData.strikeZoneTop ?? null,
            strike_zone_bottom: pitchData.strikeZoneBottom ?? null,
            coordinates: pitchData.coordinates || {},
            count: event.count || {},
          })
        }
      }

      plays.push({
        at_bat_index: about.atBatIndex,
        inning: about.inning,
        half_inning: about.halfInning,
        batter: matchup.batter?.fullName || '',
        pitcher: matchup.pitcher?.fullName || '',
        result: result.description || '',
        event: result.event || '',
        pitches: pitchEvents,
      })
    }
    return { game_pk: gamePk, plays }
  } catch {
    return { game_pk: gamePk, plays: [] }
  }
}

/** Return list of MLB teams with id, name, and abbreviation. Optionally filter by season. */
export async function getAllTeams(season = null) {
  try {
    const seasonParam = season ? `&season=${season}` : ''
    const data = await mlbFetch(`/api/v1/teams?sportIds=1${seasonParam}`)
    const teams = []
    for (const team of data.teams || []) {
      const leagueName = team.league?.name || ''
      let league
      if (leagueName.includes('Negro') || leagueName.includes('East-West')) {
        league = 'NLB'
      } else if (leagueName.includes('American')) {
        league = 'AL'
      } else if (leagueName.includes('National')) {
        league = 'NL'
      } else {
        league = ''
      }
      teams.push({
        id: team.id,
        name: team.name,
        abbreviation: team.abbreviation || '',
        league,
      })
    }
    // Easter egg: include the 1994 AA Birmingham Barons (Michael Jordan's team)
    if (season === 1994) {
      teams.push({ id: 247, name: 'Birmingham Barons (AA)', abbreviation: 'BIR', league: '' })
    }

    teams.sort((a, b) => a.name.localeCompare(b.name))
    return teams
  } catch {
    return []
  }
}

/** Fetch a player's hitting stats for a given season. */
export async function getPlayerHittingStats(playerId, season = 2024, sportId = 1) {
  const defaults = { avg: 0.245, slg: 0.395, k_rate: 0.230, hr_rate: 0.030 }
  try {
    const data = await mlbFetch(
      `/api/v1/people/${playerId}/stats?stats=season&group=hitting&season=${season}&sportId=${sportId}`
    )
    for (const split of data.stats?.[0]?.splits || []) {
      const s = split.stat || {}
      const atBats = parseInt(s.atBats || '0', 10)
      const plateAppearances = parseInt(s.plateAppearances || '0', 10)
      if (atBats < 50) return defaults
      return {
        avg: parseFloat(s.avg || defaults.avg),
        slg: parseFloat(s.slg || defaults.slg),
        k_rate: plateAppearances > 0
          ? parseInt(s.strikeOuts || '0', 10) / plateAppearances
          : defaults.k_rate,
        hr_rate: atBats > 0
          ? parseInt(s.homeRuns || '0', 10) / atBats
          : defaults.hr_rate,
      }
    }
  } catch { /* fall through */ }
  return defaults
}

/** Fetch a player's pitching stats for a given season. */
export async function getPlayerPitchingStats(playerId, season = 2024, sportId = 1) {
  const defaults = { era: 4.30, k_per_9: 8.20, bb_per_9: 3.20, gamesStarted: 0, gamesPlayed: 0 }
  try {
    const data = await mlbFetch(
      `/api/v1/people/${playerId}/stats?stats=season&group=pitching&season=${season}&sportId=${sportId}`
    )
    for (const split of data.stats?.[0]?.splits || []) {
      const s = split.stat || {}
      const ipStr = s.inningsPitched || '0'
      const innings = parseFloat(ipStr.replace('.', '')) || 0
      if (innings < 20) return defaults
      return {
        era: parseFloat(s.era || defaults.era),
        k_per_9: parseFloat(s.strikeoutsPer9Inn || defaults.k_per_9),
        bb_per_9: parseFloat(s.walksPer9Inn || defaults.bb_per_9),
        gamesStarted: parseInt(s.gamesStarted || '0', 10),
        gamesPlayed: parseInt(s.gamesPlayed || '0', 10),
      }
    }
  } catch { /* fall through */ }
  return defaults
}

/** Fetch a team's roster for the given season. */
async function getTeamRoster(teamId, season = 2024) {
  const data = await mlbFetch(
    `/api/v1/teams/${teamId}/roster?rosterType=active&season=${season}`
  )
  return data.roster || []
}

/**
 * Fetch a team's roster and return 9 position players with hitting stats.
 * Same OPS-based lineup construction as the Python backend.
 */
export async function getTeamLineup(teamId, season = 2024) {
  const defaults = { avg: 0.245, slg: 0.395, k_rate: 0.230, hr_rate: 0.030 }
  const sportId = sportIdForTeam(teamId)
  try {
    const roster = await getTeamRoster(teamId, season)
    const positionPlayers = []
    for (const entry of roster) {
      const person = entry.person || {}
      const position = entry.position || {}
      if (position.type === 'Pitcher') continue
      positionPlayers.push({
        id: person.id,
        name: person.fullName || 'Unknown',
        position: position.abbreviation || '',
      })
    }

    // Fetch hitting stats for each position player
    await Promise.all(positionPlayers.map(async (player) => {
      player.stats = player.id
        ? await getPlayerHittingStats(player.id, season, sportId)
        : { ...defaults }
    }))

    const ops = (p) => (p.stats.avg || 0) + (p.stats.slg || 0)

    // First pass: fill one player per defensive position
    const targetPositions = ['C', '1B', '2B', '3B', 'SS', 'OF', 'OF', 'OF', 'DH']
    const lineup = []
    const usedIds = new Set()

    for (const target of targetPositions) {
      const candidates = positionPlayers.filter(
        (p) => !usedIds.has(p.id) &&
          (p.position === target || (target === 'OF' && ['OF', 'LF', 'CF', 'RF'].includes(p.position)))
      )
      if (candidates.length) {
        const best = candidates.reduce((a, b) => (ops(a) >= ops(b) ? a : b))
        lineup.push(best)
        usedIds.add(best.id)
      }
    }

    // Second pass: fill remaining spots with highest OPS available
    const remaining = positionPlayers
      .filter((p) => !usedIds.has(p.id))
      .sort((a, b) => ops(b) - ops(a))
    for (const player of remaining) {
      if (lineup.length >= 9) break
      lineup.push(player)
    }

    // Ensure guaranteed players make the lineup (e.g. Michael Jordan on the Barons)
    const guaranteed = GUARANTEED_LINEUP[teamId] || []
    for (const gId of guaranteed) {
      if (!lineup.find(p => p.id === gId)) {
        const gPlayer = positionPlayers.find(p => p.id === gId)
        if (gPlayer && lineup.length >= 9) {
          // Replace the lowest-OPS non-guaranteed player
          lineup.sort((a, b) => ops(a) - ops(b))
          const dropIdx = lineup.findIndex(p => !guaranteed.includes(p.id))
          if (dropIdx >= 0) lineup.splice(dropIdx, 1, gPlayer)
        } else if (gPlayer) {
          lineup.push(gPlayer)
        }
      }
    }

    // Sort final lineup by OPS descending
    lineup.sort((a, b) => ops(b) - ops(a))

    // Pad to 9 if needed
    while (lineup.length < 9) {
      lineup.push({
        id: 0,
        name: `Player ${lineup.length + 1}`,
        position: 'UT',
        stats: { ...defaults },
      })
    }

    return lineup
  } catch {
    return Array.from({ length: 9 }, (_, i) => ({
      id: 0,
      name: `Player ${i + 1}`,
      position: 'UT',
      stats: { avg: 0.245, slg: 0.395, k_rate: 0.230, hr_rate: 0.030 },
    }))
  }
}

/** Fetch all pitchers from a team's roster with their pitching stats. */
export async function getTeamPitchers(teamId, season = 2024) {
  const defaultStats = { era: 4.30, k_per_9: 8.20, bb_per_9: 3.20 }
  const sportId = sportIdForTeam(teamId)
  try {
    const roster = await getTeamRoster(teamId, season)
    const pitchers = []
    for (const entry of roster) {
      const person = entry.person || {}
      const position = entry.position || {}
      if (position.type !== 'Pitcher') continue
      pitchers.push({
        id: person.id,
        name: person.fullName || 'Unknown',
        position: position.abbreviation || 'P',
        stats: null, // filled below
      })
    }

    // Fetch pitching stats in parallel
    await Promise.all(pitchers.map(async (p) => {
      p.stats = p.id
        ? await getPlayerPitchingStats(p.id, season, sportId)
        : { ...defaultStats }
    }))

    // Classify each pitcher as SP or RP based on games started ratio
    for (const p of pitchers) {
      const gs = p.stats.gamesStarted || 0
      const g = p.stats.gamesPlayed || 0
      p.role = (g > 0 && gs / g >= 0.5) ? 'SP' : 'RP'
    }

    pitchers.sort((a, b) => (a.stats.era ?? 99) - (b.stats.era ?? 99))
    return pitchers
  } catch {
    return []
  }
}

/** Fetch the best starting pitcher from the team's roster (lowest ERA). */
export async function getTeamPitcher(teamId, season = 2024) {
  const defaultPitcher = {
    id: 0,
    name: 'Unknown Pitcher',
    position: 'P',
    stats: { era: 4.30, k_per_9: 8.20, bb_per_9: 3.20 },
  }
  const pitchers = await getTeamPitchers(teamId, season)
  return pitchers.length ? pitchers[0] : defaultPitcher
}

/**
 * Fetch a team's home venue for a given season.
 * Uses the `hydrate=venue` parameter to include venue data in the team response.
 * Returns { id, name } for the venue, or null if unavailable or on error.
 */
export async function getTeamVenue(teamId, season) {
  try {
    const data = await mlbFetch(`/api/v1/teams/${teamId}?hydrate=venue&season=${season}`)
    const team = data.teams?.[0]
    return team?.venue ? { id: team.venue.id, name: team.venue.name } : null
  } catch {
    return null
  }
}

/** Pick a random team that isn't the player's team. */
export async function getRandomOpponent(excludeTeamId) {
  const teams = await getAllTeams()
  const opponents = teams.filter((t) => t.id !== excludeTeamId)
  return opponents[Math.floor(Math.random() * opponents.length)]
}
