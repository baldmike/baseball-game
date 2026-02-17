<template>
  <div class="game-view">
    <!-- Game List -->
    <div v-if="!selectedGame" class="game-list">
      <h2>Today's Games</h2>
      <p v-if="loading" class="loading">Loading games...</p>
      <p v-if="error" class="error">{{ error }}</p>
      <div v-if="games.length === 0 && !loading && !error" class="no-games">
        <template v-if="countdown">
          <div class="countdown">
            <div class="countdown-value">{{ countdown.days }}<span class="countdown-unit">d</span></div>
            <div class="countdown-value">{{ countdown.hours }}<span class="countdown-unit">h</span></div>
            <div class="countdown-value">{{ countdown.minutes }}<span class="countdown-unit">m</span></div>
            <div class="countdown-value">{{ countdown.seconds }}<span class="countdown-unit">s</span></div>
          </div>
          <p class="countdown-label">until first pitch.</p>
        </template>
        <template v-else>
          No games scheduled today.
        </template>
      </div>
      <div
        v-for="game in games"
        :key="game.game_pk"
        class="game-card"
        @click="selectGame(game.game_pk)"
      >
        <div class="teams">
          <span class="team away">{{ game.away_team }}</span>
          <span class="score" v-if="game.status !== 'Pre-Game'">
            {{ game.away_score }} - {{ game.home_score }}
          </span>
          <span class="vs" v-else>@</span>
          <span class="team home">{{ game.home_team }}</span>
        </div>
        <div class="status">{{ game.status }}</div>
      </div>
    </div>

    <!-- Play-by-Play View -->
    <div v-else class="play-by-play">
      <button class="back-btn" @click="selectedGame = null">Back to Games</button>
      <h2>Play-by-Play</h2>
      <p v-if="playsLoading" class="loading">Loading play data...</p>
      <p v-if="playsError" class="error">{{ playsError }}</p>

      <div v-for="play in plays" :key="play.at_bat_index" class="play-card">
        <div class="play-header">
          <span class="inning">
            {{ play.half_inning === 'top' ? 'Top' : 'Bot' }} {{ play.inning }}
          </span>
          <span class="matchup">{{ play.batter }} vs {{ play.pitcher }}</span>
        </div>

        <div class="pitches">
          <div v-for="(pitch, i) in play.pitches" :key="i" class="pitch">
            <span class="pitch-num">#{{ i + 1 }}</span>
            <span class="pitch-type">{{ pitch.pitch_type }}</span>
            <span class="pitch-speed" v-if="pitch.speed">{{ pitch.speed }} mph</span>
            <span class="pitch-call">{{ pitch.call }}</span>
            <span class="pitch-count">
              {{ pitch.count.balls }}-{{ pitch.count.strikes }}
            </span>
          </div>
        </div>

        <div class="play-result" v-if="play.result">
          <strong>{{ play.event }}:</strong> {{ play.result }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { getTodaysGames, getPlayByPlay } from '../services/mlbApi.js'

const games = ref([])
const loading = ref(false)
const error = ref(null)

const selectedGame = ref(null)
const plays = ref([])
const playsLoading = ref(false)
const playsError = ref(null)

// 2026 Opening Day: March 26, 2026 — first pitch ~1:10 PM ET
const OPENING_DAY = new Date('2026-03-26T13:10:00-04:00')
const countdown = ref(null)
let countdownTimer = null

function updateCountdown() {
  const now = new Date()
  const diff = OPENING_DAY - now
  if (diff <= 0) {
    countdown.value = null
    if (countdownTimer) clearInterval(countdownTimer)
    return
  }
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  const minutes = Math.floor((diff % 3600000) / 60000)
  const seconds = Math.floor((diff % 60000) / 1000)
  countdown.value = { days, hours, minutes, seconds }
}

onMounted(async () => {
  updateCountdown()
  if (countdown.value) {
    countdownTimer = setInterval(updateCountdown, 1000)
  }

  loading.value = true
  try {
    games.value = await getTodaysGames()
  } catch (e) {
    error.value = 'Failed to load games.'
  } finally {
    loading.value = false
  }
})

onUnmounted(() => {
  if (countdownTimer) clearInterval(countdownTimer)
})

async function selectGame(gamePk) {
  selectedGame.value = gamePk
  playsLoading.value = true
  playsError.value = null
  try {
    const data = await getPlayByPlay(gamePk)
    plays.value = data.plays
  } catch (e) {
    playsError.value = 'Failed to load play-by-play data.'
  } finally {
    playsLoading.value = false
  }
}
</script>

<style scoped>
.game-list h2,
.play-by-play h2 {
  margin-bottom: 16px;
}

.game-card {
  background: #16213e;
  border: 1px solid #0f3460;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 10px;
  cursor: pointer;
  transition: border-color 0.2s;
}

.game-card:hover {
  border-color: #e94560;
}

.teams {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 1.1rem;
}

.score, .vs {
  font-weight: bold;
  color: #e94560;
}

.status {
  margin-top: 6px;
  font-size: 0.85rem;
  color: #888;
}

.back-btn {
  background: #0f3460;
  color: #e0e0e0;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 12px;
}

.back-btn:hover {
  background: #e94560;
}

.play-card {
  background: #16213e;
  border: 1px solid #0f3460;
  border-radius: 8px;
  padding: 14px;
  margin-bottom: 10px;
}

.play-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}

.inning {
  background: #0f3460;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.85rem;
}

.matchup {
  font-size: 0.9rem;
  color: #ccc;
}

.pitches {
  margin: 8px 0;
}

.pitch {
  display: flex;
  gap: 12px;
  padding: 4px 0;
  font-size: 0.85rem;
  border-bottom: 1px solid #0f3460;
}

.pitch:last-child {
  border-bottom: none;
}

.pitch-num {
  color: #888;
  min-width: 24px;
}

.pitch-type {
  color: #e94560;
  min-width: 100px;
}

.pitch-speed {
  min-width: 70px;
}

.pitch-call {
  flex: 1;
}

.pitch-count {
  color: #888;
}

.play-result {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #0f3460;
  font-size: 0.9rem;
}

.loading {
  color: #888;
  text-align: center;
}

.error {
  color: #e94560;
  text-align: center;
}

.no-games {
  text-align: center;
  color: #888;
  padding: 40px;
}

.countdown {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-bottom: 12px;
}

.countdown-value {
  font-size: 2.2rem;
  font-weight: 700;
  color: #ffffff;
  background: #16213e;
  border: 1px solid #0f3460;
  border-radius: 8px;
  padding: 12px 16px;
  min-width: 60px;
  text-align: center;
}

.countdown-unit {
  font-size: 0.9rem;
  font-weight: 400;
  color: #e94560;
  margin-left: 2px;
}

.countdown-label {
  font-size: 1.1rem;
  color: #ccc;
  margin: 0;
  letter-spacing: 0.5px;
}
</style>
