<template>
  <div class="scoreboard">
    <div class="score-grid">
      <table>
        <thead>
          <tr>
            <th class="team-col"></th>
            <th
              v-for="(_, i) in totalInnings"
              :key="i"
              :class="{ active: i === inning - 1 }"
            >
              {{ i + 1 }}
            </th>
            <th class="total-col">R</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="team-col">{{ awayTeamName || 'AWAY' }}</td>
            <td
              v-for="(runs, i) in awayScore"
              :key="'a' + i"
              :class="{ active: i === inning - 1 && isTop }"
            >
              {{ i < inning || (i === inning - 1 && isTop) ? runs : '' }}
            </td>
            <td class="total-col">{{ awayTotal }}</td>
          </tr>
          <tr>
            <td class="team-col">{{ homeTeamName || 'HOME' }}</td>
            <td
              v-for="(runs, i) in homeScore"
              :key="'h' + i"
              :class="{ active: i === inning - 1 && !isTop }"
            >
              {{ i < inning - 1 || (i === inning - 1 && !isTop) ? runs : '' }}
            </td>
            <td class="total-col">{{ homeTotal }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="game-info">
      <div class="count-display">
        <div class="info-label">COUNT</div>
        <div class="count-numbers">
          <span class="balls">{{ balls }}</span>
          <span class="separator">-</span>
          <span class="strikes">{{ strikes }}</span>
        </div>
        <div class="count-labels">
          <span>B</span><span></span><span>S</span>
        </div>
      </div>

      <div class="outs-display">
        <div class="info-label">OUTS</div>
        <div class="out-dots">
          <span class="out-dot" :class="{ filled: outs >= 1 }"></span>
          <span class="out-dot" :class="{ filled: outs >= 2 }"></span>
        </div>
      </div>

      <div class="inning-display">
        <div class="info-label">INNING</div>
        <div class="inning-number">
          <span class="arrow">{{ isTop ? '▲' : '▼' }}</span>
          {{ inning }}
        </div>
      </div>

      <div v-if="currentBatterName" class="at-bat-display">
        <div class="info-label">AT BAT</div>
        <div class="at-bat-name">{{ currentBatterName }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  awayScore: { type: Array, default: () => [] },
  homeScore: { type: Array, default: () => [] },
  awayTotal: { type: Number, default: 0 },
  homeTotal: { type: Number, default: 0 },
  inning: { type: Number, default: 1 },
  isTop: { type: Boolean, default: true },
  balls: { type: Number, default: 0 },
  strikes: { type: Number, default: 0 },
  outs: { type: Number, default: 0 },
  awayTeamName: { type: String, default: '' },
  homeTeamName: { type: String, default: '' },
  currentBatterName: { type: String, default: '' },
})

const totalInnings = computed(() => props.awayScore.length)
</script>

<style scoped>
.scoreboard {
  background: #0f0f23;
  border: 2px solid #e94560;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 16px;
}

.score-grid {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  text-align: center;
  font-family: 'Courier New', monospace;
}

th, td {
  padding: 4px 8px;
  min-width: 28px;
  font-size: 14px;
}

th {
  color: #888;
  border-bottom: 1px solid #333;
}

td {
  color: #e0e0e0;
}

.team-col {
  text-align: left;
  font-weight: bold;
  color: #e94560;
  min-width: 50px;
}

.total-col {
  font-weight: bold;
  color: #ffdd00;
  border-left: 2px solid #333;
  min-width: 30px;
}

.active {
  background: rgba(233, 69, 96, 0.15);
}

.game-info {
  display: flex;
  justify-content: space-around;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #333;
}

.info-label {
  font-size: 10px;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 4px;
  text-align: center;
}

.count-display {
  text-align: center;
}

.count-numbers {
  font-size: 24px;
  font-weight: bold;
  font-family: 'Courier New', monospace;
}

.balls {
  color: #4caf50;
}

.strikes {
  color: #e94560;
}

.separator {
  color: #666;
  margin: 0 2px;
}

.count-labels {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: #666;
  padding: 0 4px;
}

.outs-display {
  text-align: center;
}

.out-dots {
  display: flex;
  gap: 8px;
  justify-content: center;
  margin-top: 6px;
}

.out-dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid #e94560;
  display: inline-block;
}

.out-dot.filled {
  background: #e94560;
}

.inning-display {
  text-align: center;
}

.inning-number {
  font-size: 24px;
  font-weight: bold;
  font-family: 'Courier New', monospace;
  color: #e0e0e0;
}

.arrow {
  font-size: 14px;
  color: #e94560;
}

.at-bat-display {
  text-align: center;
}

.at-bat-name {
  font-size: 13px;
  font-weight: bold;
  color: #ffdd00;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
