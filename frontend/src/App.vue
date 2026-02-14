<template>
  <div id="app">
    <h1>Baseball Game</h1>
    <InteractiveGame />
  </div>
</template>

<script setup>
import InteractiveGame from './components/InteractiveGame.vue'
</script>

<style>
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #1a1a2e;
  color: #e0e0e0;
}

#app {
  max-width: 900px;
  margin: 0 auto;
  padding: 20px;
}

h1 {
  text-align: center;
  color: #e94560;
}
</style>
