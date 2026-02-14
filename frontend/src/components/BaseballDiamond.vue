<template>
  <div class="diamond-container">
    <svg viewBox="0 0 200 200" class="diamond-svg">
      <!-- Grass background -->
      <rect x="0" y="0" width="200" height="200" fill="#2d5a27" rx="8" />

      <!-- Infield dirt diamond -->
      <polygon points="100,30 170,100 100,170 30,100" fill="#c4956a" stroke="#8b6914" stroke-width="1" />

      <!-- Base paths -->
      <line x1="100" y1="30" x2="170" y2="100" stroke="white" stroke-width="1.5" />
      <line x1="170" y1="100" x2="100" y2="170" stroke="white" stroke-width="1.5" />
      <line x1="100" y1="170" x2="30" y2="100" stroke="white" stroke-width="1.5" />
      <line x1="30" y1="100" x2="100" y2="30" stroke="white" stroke-width="1.5" />

      <!-- Home plate -->
      <polygon points="100,168 94,174 100,180 106,174" fill="white" />

      <!-- Pitcher's mound -->
      <circle cx="100" cy="100" r="5" fill="#c4956a" stroke="#8b6914" stroke-width="1" />
      <rect x="97" y="98" width="6" height="1.5" fill="white" />

      <!-- 1st base -->
      <rect
        :x="165" :y="95" width="10" height="10"
        :fill="bases[0] ? '#ffdd00' : 'white'"
        :stroke="bases[0] ? '#ff8800' : '#ccc'"
        stroke-width="1.5"
        transform="rotate(45, 170, 100)"
      />

      <!-- 2nd base -->
      <rect
        :x="95" :y="25" width="10" height="10"
        :fill="bases[1] ? '#ffdd00' : 'white'"
        :stroke="bases[1] ? '#ff8800' : '#ccc'"
        stroke-width="1.5"
        transform="rotate(45, 100, 30)"
      />

      <!-- 3rd base -->
      <rect
        :x="25" :y="95" width="10" height="10"
        :fill="bases[2] ? '#ffdd00' : 'white'"
        :stroke="bases[2] ? '#ff8800' : '#ccc'"
        stroke-width="1.5"
        transform="rotate(45, 30, 100)"
      />

      <!-- Runner dots -->
      <circle v-if="bases[0]" cx="170" cy="100" r="7" fill="#ff4444" stroke="#cc0000" stroke-width="1" />
      <circle v-if="bases[1]" cx="100" cy="30" r="7" fill="#ff4444" stroke="#cc0000" stroke-width="1" />
      <circle v-if="bases[2]" cx="30" cy="100" r="7" fill="#ff4444" stroke="#cc0000" stroke-width="1" />

      <!-- Labels -->
      <text x="182" y="104" font-size="8" fill="white" font-weight="bold">1B</text>
      <text x="100" y="17" font-size="8" fill="white" font-weight="bold" text-anchor="middle">2B</text>
      <text x="8" y="104" font-size="8" fill="white" font-weight="bold">3B</text>
    </svg>
  </div>
</template>

<script setup>
defineProps({
  bases: {
    type: Array,
    default: () => [false, false, false],
  },
})
</script>

<style scoped>
.diamond-container {
  display: flex;
  justify-content: center;
}

.diamond-svg {
  width: 220px;
  height: 220px;
}
</style>
