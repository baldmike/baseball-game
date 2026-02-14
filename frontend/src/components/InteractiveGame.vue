<template>
  <div class="interactive-game">
    <!-- Team Selection Screen -->
    <div v-if="!game && !teamSelected">
      <div class="title-art">&#9918;</div>
      <h2 class="game-title">Interactive Baseball</h2>
      <TeamSelector @teamSelected="onTeamSelected" />
      <div class="season-select">
        <label for="season">Season:</label>
        <select id="season" v-model="selectedSeason">
          <option v-for="year in availableSeasons" :key="year" :value="year">{{ year }}</option>
        </select>
      </div>
      <div class="skip-select">
        <button class="skip-btn" @click="startGame(null)">Skip — Play without teams</button>
      </div>
    </div>

    <!-- Start Screen (team selected, ready to play) -->
    <div v-if="!game && teamSelected" class="start-screen">
      <div class="title-art">&#9918;</div>
      <h2>Interactive Baseball</h2>
      <p>Team selected! Ready to play.</p>
      <button class="play-btn" @click="startGame(teamSelected)" :disabled="loading">
        {{ loading ? 'Loading rosters...' : 'Play Ball!' }}
      </button>
    </div>

    <!-- Active Game -->
    <div v-if="game">
      <!-- Game Over Overlay -->
      <div v-if="game.game_status === 'final'" class="game-over-overlay">
        <div class="game-over-card">
          <h2>Game Over!</h2>
          <div class="final-score">
            <div class="final-team">
              <span class="label">{{ game.away_abbreviation || 'AWAY' }}</span>
              <span class="score">{{ game.away_total }}</span>
            </div>
            <div class="vs">—</div>
            <div class="final-team">
              <span class="label">{{ game.home_abbreviation || 'HOME' }} (You)</span>
              <span class="score">{{ game.home_total }}</span>
            </div>
          </div>
          <p class="result-text">{{ game.home_total > game.away_total ? 'You Win!' : 'You Lose!' }}</p>
          <button class="play-btn" @click="resetGame">New Game</button>
        </div>
      </div>

      <Scoreboard
        :away-score="game.away_score"
        :home-score="game.home_score"
        :away-total="game.away_total"
        :home-total="game.home_total"
        :inning="game.inning"
        :is-top="game.is_top"
        :balls="game.balls"
        :strikes="game.strikes"
        :outs="game.outs"
        :away-team-name="game.away_abbreviation"
        :home-team-name="game.home_abbreviation"
        :current-batter-name="game.current_batter_name"
      />

      <BaseballDiamond :bases="game.bases" />

      <!-- Current Batter Display -->
      <div v-if="game.current_batter_name" class="batter-display">
        <span class="batter-label">AT BAT:</span>
        <span class="batter-name">{{ game.current_batter_name }}</span>
      </div>

      <!-- Current Pitcher Display -->
      <div v-if="currentPitcherName" class="pitcher-display">
        <span class="pitcher-label">PITCHING:</span>
        <span class="pitcher-name">{{ currentPitcherName }}</span>
      </div>

      <!-- Last Play -->
      <div class="last-play" v-if="game.last_play">
        <p>{{ game.last_play }}</p>
      </div>

      <!-- Controls -->
      <div class="controls" v-if="game.game_status === 'active'">
        <!-- Pitching Mode -->
        <div v-if="game.player_role === 'pitching'" class="pitch-controls">
          <div class="mode-label">You're Pitching — Choose your pitch:</div>
          <div class="button-group">
            <button
              v-for="pitch in pitchTypes"
              :key="pitch.value"
              class="action-btn pitch-btn"
              :class="pitch.value"
              @click="doPitch(pitch.value)"
              :disabled="loading"
            >
              {{ pitch.label }}
            </button>
          </div>
        </div>

        <!-- Batting Mode -->
        <div v-if="game.player_role === 'batting'" class="bat-controls">
          <div class="mode-label">You're Batting — Swing or take?</div>
          <div class="button-group">
            <button class="action-btn swing-btn" @click="doBat('swing')" :disabled="loading">
              Swing!
            </button>
            <button class="action-btn take-btn" @click="doBat('take')" :disabled="loading">
              Take
            </button>
          </div>
        </div>
      </div>

      <!-- Play Log -->
      <div class="play-log">
        <h3>Play-by-Play</h3>
        <div class="log-entries" ref="logEl">
          <div
            v-for="(entry, i) in game.play_log"
            :key="i"
            class="log-entry"
            :class="{ separator: entry.startsWith('---') }"
          >
            {{ entry }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, watch } from 'vue'
import { createNewGame, throwPitch, batAction } from '../services/gameApi.js'
import { useSoundEffects } from '../composables/useSoundEffects.js'
import BaseballDiamond from './BaseballDiamond.vue'
import Scoreboard from './Scoreboard.vue'
import TeamSelector from './TeamSelector.vue'

const game = ref(null)
const loading = ref(false)
const logEl = ref(null)
const teamSelected = ref(null)
const selectedSeason = ref(2024)
const availableSeasons = Array.from({ length: 2025 - 1920 + 1 }, (_, i) => 2025 - i)

const { playForLastPlay } = useSoundEffects()

const pitchTypes = [
  { label: 'Fastball', value: 'fastball' },
  { label: 'Curveball', value: 'curveball' },
  { label: 'Slider', value: 'slider' },
  { label: 'Changeup', value: 'changeup' },
]

// Show the pitcher who is currently on the mound
const currentPitcherName = computed(() => {
  if (!game.value) return ''
  // Top of inning: home pitcher is on the mound
  // Bottom of inning: away pitcher is on the mound
  const pitcher = game.value.is_top ? game.value.home_pitcher : game.value.away_pitcher
  return pitcher?.name || ''
})

function onTeamSelected(teamId) {
  teamSelected.value = teamId
}

async function startGame(teamId) {
  loading.value = true
  try {
    game.value = await createNewGame(teamId, selectedSeason.value)
  } finally {
    loading.value = false
  }
}

function resetGame() {
  game.value = null
  teamSelected.value = null
  selectedSeason.value = 2024
}

async function doPitch(pitchType) {
  loading.value = true
  try {
    game.value = await throwPitch(game.value.game_id, pitchType)
  } finally {
    loading.value = false
  }
}

async function doBat(action) {
  loading.value = true
  try {
    game.value = await batAction(game.value.game_id, action)
  } finally {
    loading.value = false
  }
}

// Play sound effects based on last_play changes
watch(
  () => game.value?.last_play,
  (newPlay, oldPlay) => {
    if (newPlay && newPlay !== oldPlay) {
      playForLastPlay(newPlay)
    }
  }
)

// Auto-scroll play log
watch(
  () => game.value?.play_log?.length,
  async () => {
    await nextTick()
    if (logEl.value) {
      logEl.value.scrollTop = logEl.value.scrollHeight
    }
  }
)
</script>

<style scoped>
.interactive-game {
  position: relative;
}

.game-title {
  text-align: center;
  font-size: 32px;
  color: #e94560;
  margin-bottom: 4px;
}

.title-art {
  font-size: 72px;
  margin-bottom: 16px;
  text-align: center;
}

.season-select {
  text-align: center;
  margin-top: 16px;
}

.season-select label {
  color: #aaa;
  font-size: 14px;
  margin-right: 8px;
}

.season-select select {
  background: #16213e;
  color: #e0e0e0;
  border: 1px solid #555;
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 14px;
  cursor: pointer;
}

.season-select select:hover {
  border-color: #e94560;
}

.skip-select {
  text-align: center;
  margin-top: 16px;
}

.skip-btn {
  background: none;
  border: 1px solid #555;
  color: #888;
  padding: 8px 20px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.skip-btn:hover {
  border-color: #e94560;
  color: #e0e0e0;
}

.start-screen {
  text-align: center;
  padding: 60px 20px;
}

.start-screen h2 {
  font-size: 32px;
  color: #e94560;
  margin-bottom: 12px;
}

.start-screen p {
  color: #aaa;
  margin-bottom: 24px;
}

.play-btn {
  background: #e94560;
  color: white;
  border: none;
  padding: 14px 40px;
  font-size: 20px;
  border-radius: 8px;
  cursor: pointer;
  font-weight: bold;
  transition: background 0.2s;
}

.play-btn:hover:not(:disabled) {
  background: #ff6b81;
}

.play-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Batter Display */
.batter-display {
  text-align: center;
  padding: 8px;
  margin: 8px 0;
}

.batter-label {
  font-size: 11px;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-right: 8px;
}

.batter-name {
  font-size: 16px;
  font-weight: bold;
  color: #ffdd00;
}

/* Pitcher Display */
.pitcher-display {
  text-align: center;
  padding: 4px 8px;
  margin-bottom: 8px;
}

.pitcher-label {
  font-size: 11px;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-right: 8px;
}

.pitcher-name {
  font-size: 16px;
  font-weight: bold;
  color: #e94560;
}

/* Game Over */
.game-over-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  border-radius: 8px;
}

.game-over-card {
  text-align: center;
  padding: 40px;
}

.game-over-card h2 {
  font-size: 36px;
  color: #e94560;
  margin-bottom: 20px;
}

.final-score {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
  margin-bottom: 16px;
}

.final-team {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.final-team .label {
  font-size: 12px;
  color: #888;
  text-transform: uppercase;
}

.final-team .score {
  font-size: 48px;
  font-weight: bold;
  color: #ffdd00;
  font-family: 'Courier New', monospace;
}

.vs {
  font-size: 24px;
  color: #666;
}

.result-text {
  font-size: 24px;
  font-weight: bold;
  color: #4caf50;
  margin-bottom: 24px;
}

/* Last Play */
.last-play {
  background: #16213e;
  border: 1px solid #e94560;
  border-radius: 6px;
  padding: 10px 16px;
  margin: 12px 0;
  text-align: center;
  font-size: 15px;
  color: #ffdd00;
  font-weight: 500;
}

/* Controls */
.controls {
  margin: 16px 0;
}

.mode-label {
  text-align: center;
  font-size: 14px;
  color: #aaa;
  margin-bottom: 10px;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.button-group {
  display: flex;
  gap: 10px;
  justify-content: center;
  flex-wrap: wrap;
}

.action-btn {
  padding: 12px 24px;
  font-size: 16px;
  font-weight: bold;
  border: 2px solid;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 100px;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pitch-btn {
  background: #16213e;
  color: #e0e0e0;
  border-color: #e94560;
}

.pitch-btn:hover:not(:disabled) {
  background: #e94560;
  color: white;
}

.swing-btn {
  background: #e94560;
  color: white;
  border-color: #e94560;
  min-width: 140px;
}

.swing-btn:hover:not(:disabled) {
  background: #ff6b81;
}

.take-btn {
  background: #16213e;
  color: #4caf50;
  border-color: #4caf50;
  min-width: 140px;
}

.take-btn:hover:not(:disabled) {
  background: #4caf50;
  color: white;
}

/* Play Log */
.play-log {
  margin-top: 16px;
}

.play-log h3 {
  font-size: 14px;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 8px;
}

.log-entries {
  background: #0f0f23;
  border: 1px solid #333;
  border-radius: 6px;
  padding: 10px;
  max-height: 200px;
  overflow-y: auto;
}

.log-entry {
  padding: 3px 0;
  font-size: 13px;
  color: #ccc;
  border-bottom: 1px solid #1a1a2e;
}

.log-entry.separator {
  color: #e94560;
  font-weight: bold;
  border-bottom: none;
  padding: 6px 0;
}

.log-entries::-webkit-scrollbar {
  width: 6px;
}

.log-entries::-webkit-scrollbar-track {
  background: #0f0f23;
}

.log-entries::-webkit-scrollbar-thumb {
  background: #333;
  border-radius: 3px;
}
</style>
