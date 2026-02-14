<template>
  <div class="team-selector">
    <h2>Choose Your Team</h2>
    <p class="subtitle">Select an MLB team to play as (opponent will be randomly assigned)</p>

    <div v-if="loading" class="loading">Loading teams...</div>
    <div v-if="error" class="error">{{ error }}</div>

    <div v-if="teams.length" class="team-grid">
      <div
        v-for="team in teams"
        :key="team.id"
        class="team-card"
        @click="$emit('teamSelected', team.id)"
      >
        <div class="team-abbr">{{ team.abbreviation }}</div>
        <div class="team-name">{{ team.name }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { getAllTeams } from '../services/gameApi.js'

defineEmits(['teamSelected'])

const teams = ref([])
const loading = ref(false)
const error = ref(null)

onMounted(async () => {
  loading.value = true
  try {
    teams.value = await getAllTeams()
  } catch (e) {
    error.value = 'Failed to load teams. You can still play without team selection.'
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.team-selector {
  text-align: center;
  padding: 20px 0;
}

.team-selector h2 {
  color: #e94560;
  font-size: 28px;
  margin-bottom: 8px;
}

.subtitle {
  color: #888;
  margin-bottom: 24px;
  font-size: 14px;
}

.team-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
  max-height: 500px;
  overflow-y: auto;
  padding: 4px;
}

.team-card {
  background: #16213e;
  border: 2px solid #0f3460;
  border-radius: 8px;
  padding: 14px 8px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
}

.team-card:hover {
  border-color: #e94560;
  background: #1a2a4e;
  transform: translateY(-2px);
}

.team-abbr {
  font-size: 22px;
  font-weight: bold;
  color: #ffdd00;
  font-family: 'Courier New', monospace;
  margin-bottom: 4px;
}

.team-name {
  font-size: 12px;
  color: #ccc;
  line-height: 1.2;
}

.loading {
  color: #888;
  padding: 40px;
}

.error {
  color: #e94560;
  padding: 20px;
}

.team-grid::-webkit-scrollbar {
  width: 6px;
}

.team-grid::-webkit-scrollbar-track {
  background: #0f0f23;
}

.team-grid::-webkit-scrollbar-thumb {
  background: #333;
  border-radius: 3px;
}
</style>
