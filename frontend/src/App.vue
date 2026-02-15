<template>
  <div id="app">
    <header class="app-header" v-if="!(activeTab === 'play' && gameRef?.isPlaying)">
      <div class="header-inner">
        <div class="header-logo">
          <svg viewBox="0 0 32 32" class="baseball-icon">
            <circle cx="16" cy="16" r="14" fill="none" stroke="#e94560" stroke-width="2"/>
            <path d="M8 6 Q16 16 8 26" fill="none" stroke="#e94560" stroke-width="1.5"/>
            <path d="M24 6 Q16 16 24 26" fill="none" stroke="#e94560" stroke-width="1.5"/>
            <line x1="7" y1="9" x2="10" y2="10" stroke="#e94560" stroke-width="1" stroke-linecap="round"/>
            <line x1="6.5" y1="13" x2="9.5" y2="13" stroke="#e94560" stroke-width="1" stroke-linecap="round"/>
            <line x1="7" y1="17" x2="10" y2="17" stroke="#e94560" stroke-width="1" stroke-linecap="round"/>
            <line x1="7" y1="21" x2="10" y2="20" stroke="#e94560" stroke-width="1" stroke-linecap="round"/>
            <line x1="25" y1="9" x2="22" y2="10" stroke="#e94560" stroke-width="1" stroke-linecap="round"/>
            <line x1="25.5" y1="13" x2="22.5" y2="13" stroke="#e94560" stroke-width="1" stroke-linecap="round"/>
            <line x1="25" y1="17" x2="22" y2="17" stroke="#e94560" stroke-width="1" stroke-linecap="round"/>
            <line x1="25" y1="21" x2="22" y2="20" stroke="#e94560" stroke-width="1" stroke-linecap="round"/>
          </svg>
          <div class="header-text">
            <h1>Basebald</h1>
            <span class="header-subtitle">Powered by real MLB rosters &amp; stats</span>
          </div>
        </div>
        <nav class="nav-tabs">
          <button
            v-if="activeTab === 'play' && gameRef?.showBackButton"
            class="nav-tab"
            @click="gameRef.handleBack()"
          >&larr; Back</button>
          <button
            class="nav-tab"
            :class="{ active: activeTab === 'play' }"
            @click="activeTab = 'play'"
          >Play</button>
          <button
            class="nav-tab"
            :class="{ active: activeTab === 'live' }"
            @click="activeTab = 'live'"
          >Live Games</button>
        </nav>
      </div>
    </header>
    <main class="app-main">
      <InteractiveGame v-if="activeTab === 'play'" ref="gameRef" />
      <GameView v-else-if="activeTab === 'live'" />
    </main>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import InteractiveGame from './components/InteractiveGame.vue'
import GameView from './components/GameView.vue'

const activeTab = ref('play')
const gameRef = ref(null)
</script>

<style>
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #1a1a2e;
  color: #e0e0e0;
}

#app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-header {
  background: linear-gradient(180deg, #0f0f23 0%, #1a1a2e 100%);
  border-bottom: 2px solid #e94560;
  padding: 16px 20px;
  position: sticky;
  top: 0;
  z-index: 20;
}

.header-inner {
  max-width: 900px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.header-logo {
  display: flex;
  align-items: center;
  gap: 12px;
}

.baseball-icon {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
}

.header-text {
  display: flex;
  flex-direction: column;
}

.header-text h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: #ffffff;
  letter-spacing: 0.5px;
  line-height: 1.2;
}

.header-subtitle {
  font-size: 11px;
  color: #888;
  letter-spacing: 1px;
  text-transform: uppercase;
}

.nav-tabs {
  display: flex;
  gap: 8px;
}

.nav-tab {
  background: transparent;
  border: 2px solid #e94560;
  color: #e94560;
  padding: 6px 14px;
  min-width: 90px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  transition: all 0.2s;
  text-align: center;
}

.nav-tab:hover:not(.active) {
  background: rgba(233, 69, 96, 0.15);
}

.nav-tab.active {
  background: #e94560;
  color: white;
}

.app-main {
  max-width: 900px;
  width: 100%;
  margin: 0 auto;
  padding: 20px;
  box-sizing: border-box;
  flex: 1;
}

@media (max-width: 600px) {
  .header-inner {
    flex-direction: column;
    gap: 10px;
  }

  .header-logo {
    justify-content: center;
  }

  .nav-tabs {
    justify-content: center;
  }
}
</style>
