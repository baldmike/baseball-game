<template>
  <!--
    TeamSelector — displays all MLB teams grouped by league (AL / NL).
    The user clicks a team card to select it, which emits the 'teamSelected'
    event with that team's ID. This component is used in Step 1 of the
    InteractiveGame setup wizard.
  -->
  <div class="team-selector">
    <h2>Choose Your Team</h2>
    <p class="subtitle">Select an MLB team to play as</p>

    <!-- Loading state: shown while the API call to fetch teams is in progress -->
    <div v-if="loading" class="loading">Loading teams...</div>

    <!-- Error state: shown if the API call fails (game can still proceed without team selection) -->
    <div v-if="error" class="error">{{ error }}</div>

    <!--
      Team grid: organized by league sections (AL, NL, and optionally Other).
      Only rendered once teams have been successfully loaded from the API.
    -->
    <div v-if="teams.length" class="league-sections">
      <!-- Loop through each league group (American League, National League, etc.) -->
      <div v-for="league in leagues" :key="league.name" class="league-section">
        <!-- League header (e.g., "AMERICAN LEAGUE") styled with uppercase + letter-spacing -->
        <h3 class="league-header">{{ league.label }}</h3>
        <!-- Responsive grid of team cards within this league -->
        <div class="team-grid">
          <!--
            Each team card is clickable and emits 'teamSelected' with the team's ID.
            The parent (InteractiveGame) listens for this event to advance the wizard.
          -->
          <div
            v-for="team in league.teams"
            :key="team.id"
            class="team-card"
            @click="$emit('teamSelected', team.id)"
          >
            <img :src="logoUrl(team.id)" :alt="team.name" class="team-logo" />
            <div class="team-abbr">{{ team.abbreviation }}</div>
            <div class="team-name">{{ team.name }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { getAllTeams } from '../services/mlbApi.js'

/**
 * Declare the events this component can emit.
 * 'teamSelected' is fired when a user clicks a team card,
 * passing the team's numeric ID as the payload.
 */
defineEmits(['teamSelected'])

/** Build the MLB CDN URL for a team's logo SVG using their numeric team ID. */
function logoUrl(teamId) {
  return `https://www.mlbstatic.com/team-logos/${teamId}.svg`
}

/**
 * Reactive array holding all teams fetched from the API.
 * Each team object has: id, name, abbreviation, league (AL/NL).
 */
const teams = ref([])

/**
 * Loading flag — true while the API call is in flight.
 * Controls whether the "Loading teams..." message is shown.
 */
const loading = ref(false)

/**
 * Error message — set if the API call to fetch teams fails.
 * Displayed as a red error banner in the template.
 */
const error = ref(null)

/**
 * Computed property that groups the flat teams array into league sections.
 *
 * WHY: The UI displays teams organized by league (American League, National League)
 * rather than a flat alphabetical list. This makes it easier for baseball fans
 * to find their team since they already know which league it belongs to.
 *
 * The "Other" bucket handles any edge-case teams that don't have a league set,
 * though in practice all MLB teams should be AL or NL.
 *
 * @returns {Array} Array of { name, label, teams } objects for each league group
 */
const leagues = computed(() => {
  const al = teams.value.filter(t => t.league === 'AL')     // American League teams
  const nl = teams.value.filter(t => t.league === 'NL')     // National League teams
  const other = teams.value.filter(t => t.league !== 'AL' && t.league !== 'NL')  // Fallback bucket
  const result = []
  if (al.length) result.push({ name: 'AL', label: 'American League', teams: al })
  if (nl.length) result.push({ name: 'NL', label: 'National League', teams: nl })
  if (other.length) result.push({ name: 'other', label: 'Other', teams: other })
  return result
})

/**
 * On mount, fetch all teams from the backend API.
 * Uses try/catch/finally to ensure loading state is always cleaned up,
 * even if the request fails. A failed load still allows the user to
 * proceed via the "Skip" button in the parent component.
 */
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
/* ========== Container ========== */
/* Centers all content and adds vertical padding around the team picker */
.team-selector {
  text-align: center;
  padding: 20px 0;
}

/* Main heading styled in the app's accent red color */
.team-selector h2 {
  color: #e94560;
  font-size: 28px;
  margin-bottom: 8px;
}

/* Subdued subtitle text below the heading */
.subtitle {
  color: #888;
  margin-bottom: 24px;
  font-size: 14px;
}

/* ========== League Sections Container ========== */
/*
  Scrollable container for all league sections.
  max-height + overflow-y: auto prevents the team list from pushing the page
  too tall — important on smaller screens where 30 teams would overflow.
*/
.league-sections {
  max-height: 500px;
  overflow-y: auto;
  padding: 4px;
}

/* Spacing between league groups (e.g., gap between AL and NL sections) */
.league-section {
  margin-bottom: 20px;
}

/*
  League name header (e.g., "AMERICAN LEAGUE").
  Styled with uppercase + letter-spacing for a sports-scoreboard aesthetic.
  Bottom border provides visual separation from the team grid below.
*/
.league-header {
  color: #ffdd00;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 2px;
  margin-bottom: 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid #333;
}

/* ========== Team Grid ========== */
/*
  Responsive grid that auto-fills columns at a minimum of 140px wide.
  This means the grid will show ~4 columns on desktop, ~2 on tablet,
  and ~1 on mobile — no media queries needed.
*/
.team-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
}

/*
  Individual team card — dark blue background with a subtle border.
  Cursor: pointer and transition provide interactive feedback.
*/
.team-card {
  background: #3a3a4a;
  border: 2px solid #555;
  border-radius: 8px;
  padding: 14px 8px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
}

/*
  Hover state: border turns red, background lightens slightly,
  and card lifts up 2px to create a "raised" tactile effect.
*/
.team-card:hover {
  border-color: #e94560;
  background: #4a4a5a;
  transform: translateY(-2px);
}

/*
  Team abbreviation (e.g., "NYY") — displayed large and bold in monospace
  to mimic a scoreboard font. Yellow color makes it pop against the dark card.
*/
.team-logo {
  width: 40px;
  height: 40px;
  object-fit: contain;
  margin-bottom: 6px;
}

.team-abbr {
  font-size: 22px;
  font-weight: bold;
  color: #ffdd00;
  font-family: 'Courier New', monospace;
  margin-bottom: 4px;
}

/* Full team name displayed small and gray below the abbreviation */
.team-name {
  font-size: 12px;
  color: #ccc;
  line-height: 1.2;
}

/* ========== Loading & Error States ========== */
/* Loading spinner placeholder text — centered with generous padding */
.loading {
  color: #888;
  padding: 40px;
}

/* Error message in red to draw attention */
.error {
  color: #e94560;
  padding: 20px;
}

/* ========== Custom Scrollbar ========== */
/*
  Thin, dark scrollbar that matches the app's dark theme.
  Without these overrides, the default browser scrollbar would look
  jarring against the dark background.
*/
.league-sections::-webkit-scrollbar {
  width: 6px;
}

.league-sections::-webkit-scrollbar-track {
  background: #0f0f23;
}

.league-sections::-webkit-scrollbar-thumb {
  background: #333;
  border-radius: 3px;
}
</style>
