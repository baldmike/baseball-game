<template>
  <div class="scorecard">
    <h3 class="scorecard-header">{{ teamAbbr }} Scorecard</h3>
    <div class="scorecard-scroll">
      <table class="scorecard-table">
        <thead>
          <tr>
            <th class="sc-name">Player</th>
            <th v-for="inn in maxInning" :key="inn" class="sc-inning">{{ inn }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(player, idx) in lineup" :key="player.id || idx">
            <td class="sc-name">{{ player.name }}</td>
            <td v-for="inn in maxInning" :key="inn" class="sc-cell">
              <div
                v-for="(pa, pi) in getPAs(idx, inn)"
                :key="pi"
                class="sc-diamond-wrap"
              >
                <svg viewBox="0 0 32 32" class="sc-diamond-svg">
                  <!-- base diamond outline -->
                  <path
                    d="M16 2 L30 16 L16 30 L2 16 Z"
                    fill="none"
                    :stroke="diamondStroke(pa.result)"
                    stroke-width="1"
                    opacity="0.3"
                  />
                  <!-- home to 1B -->
                  <line
                    v-if="bases(pa.result) >= 1"
                    x1="16" y1="30" x2="30" y2="16"
                    :stroke="pathColor(pa.result)"
                    stroke-width="2.5"
                    stroke-linecap="round"
                  />
                  <!-- 1B to 2B -->
                  <line
                    v-if="bases(pa.result) >= 2"
                    x1="30" y1="16" x2="16" y2="2"
                    :stroke="pathColor(pa.result)"
                    stroke-width="2.5"
                    stroke-linecap="round"
                  />
                  <!-- 2B to 3B -->
                  <line
                    v-if="bases(pa.result) >= 3"
                    x1="16" y1="2" x2="2" y2="16"
                    :stroke="pathColor(pa.result)"
                    stroke-width="2.5"
                    stroke-linecap="round"
                  />
                  <!-- 3B to Home -->
                  <line
                    v-if="bases(pa.result) >= 4"
                    x1="2" y1="16" x2="16" y2="30"
                    :stroke="pathColor(pa.result)"
                    stroke-width="2.5"
                    stroke-linecap="round"
                  />
                  <!-- HR: filled diamond -->
                  <path
                    v-if="pa.result === 'homerun'"
                    d="M16 2 L30 16 L16 30 L2 16 Z"
                    :fill="pathColor(pa.result)"
                    opacity="0.2"
                  />
                  <!-- base dots for runner position -->
                  <circle v-if="bases(pa.result) === 1" cx="30" cy="16" r="2.5" :fill="pathColor(pa.result)" />
                  <circle v-if="bases(pa.result) === 2" cx="16" cy="2" r="2.5" :fill="pathColor(pa.result)" />
                  <circle v-if="bases(pa.result) === 3" cx="2" cy="16" r="2.5" :fill="pathColor(pa.result)" />
                </svg>
                <span class="sc-label" :class="resultClass(pa.result)">{{ formatResult(pa.result) }}</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  scorecard: { type: Array, default: () => [] },
  lineup: { type: Array, default: () => [] },
  teamAbbr: { type: String, default: '' },
})

const RESULT_MAP = {
  single: '1B',
  double: '2B',
  triple: '3B',
  homerun: 'HR',
  groundout: 'GO',
  flyout: 'FO',
  lineout: 'LO',
  strikeout: 'K',
  walk: 'BB',
}

const HIT_TYPES = new Set(['single', 'double', 'triple', 'homerun'])

const maxInning = computed(() => {
  if (!props.scorecard.length) return 9
  const max = Math.max(...props.scorecard.map((pa) => pa.inning))
  return Math.max(9, max)
})

function getPAs(batterIdx, inning) {
  return props.scorecard.filter(
    (pa) => pa.batterIdx === batterIdx && pa.inning === inning
  )
}

function formatResult(result) {
  return RESULT_MAP[result] || result
}

function bases(result) {
  if (result === 'single') return 1
  if (result === 'double') return 2
  if (result === 'triple') return 3
  if (result === 'homerun') return 4
  return 0
}

function pathColor(result) {
  if (result === 'homerun') return '#ffdd00'
  return '#4caf50'
}

function diamondStroke(result) {
  if (HIT_TYPES.has(result)) return pathColor(result)
  if (result === 'walk') return '#64b5f6'
  return '#555'
}

function resultClass(result) {
  if (result === 'homerun') return 'sc-hr'
  if (HIT_TYPES.has(result)) return 'sc-hit'
  if (result === 'walk') return 'sc-bb'
  return 'sc-out'
}
</script>

<style scoped>
.scorecard {
  background: #0f0f23;
  border: 1px solid #333;
  border-radius: 6px;
  padding: 10px;
  margin-bottom: 16px;
}

.scorecard-header {
  font-size: 13px;
  color: #ffdd00;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin: 0 0 8px 0;
}

.scorecard-scroll {
  overflow-x: auto;
}

.scorecard-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  font-family: 'Courier New', monospace;
}

.scorecard-table th {
  color: #888;
  font-size: 11px;
  text-transform: uppercase;
  padding: 4px 6px;
  border-bottom: 1px solid #333;
  text-align: center;
}

.scorecard-table td {
  padding: 4px 4px;
  border-bottom: 1px solid #1a1a2e;
  color: #ccc;
  text-align: center;
  white-space: nowrap;
  vertical-align: middle;
}

.sc-name {
  text-align: left !important;
  min-width: 120px;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sc-inning {
  min-width: 48px;
}

.sc-cell {
  min-width: 48px;
}

.sc-diamond-wrap {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
}

.sc-diamond-svg {
  width: 28px;
  height: 28px;
}

.sc-label {
  font-size: 9px;
  font-weight: bold;
  line-height: 1;
}

.sc-hit {
  color: #4caf50;
}

.sc-hr {
  color: #ffdd00;
}

.sc-bb {
  color: #64b5f6;
}

.sc-out {
  color: #888;
}
</style>
