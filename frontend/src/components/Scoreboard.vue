<template>
  <!--
    Scoreboard — a traditional baseball line score display.

    Shows a grid with:
      - Header row: inning numbers + R H E (runs, hits, errors) columns
      - Away team row: runs scored per inning + R H E totals
      - Home team row: runs scored per inning + R H E totals

    Below the grid, three info panels show:
      - Count (balls-strikes)
      - Outs (visual dots)
      - Current inning with top/bottom arrow

    The grid dynamically sizes its columns based on the number of innings,
    which is important for extra-inning games that go beyond the standard 9.
  -->
  <div class="scoreboard">
    <!--
      Score Grid — uses CSS Grid with dynamic column count.
      The gridStyle computed property generates the grid-template-columns value
      so extra innings automatically get new columns without any layout changes.
    -->
    <div class="score-grid" :style="gridStyle">
      <!-- Header row: empty team-name cell, then one cell per inning, then "R" for total -->
      <div class="cell team-col header"></div>
      <!--
        Inning number headers (1, 2, 3, ...).
        The 'active' class highlights the current inning's column header
        so players can quickly see which inning is being played.
      -->
      <div
        v-for="(_, i) in totalInnings"
        :key="'h' + i"
        class="cell header"
        :class="{ active: i === inning - 1 }"
      >
        {{ i + 1 }}
      </div>
      <!-- R H E column headers -->
      <div class="cell header total-col">R</div>
      <div class="cell header total-col">H</div>
      <div class="cell header total-col">E</div>

      <!--
        Away team row.
        Team name (or "AWAY" fallback) followed by runs scored in each inning.

        The display logic for each cell:
        - Show the runs value if that inning has been completed (i < inning)
        - Also show it for the current inning IF it's the top half (away team batting)
        - Otherwise show empty string (inning hasn't been played yet)

        This prevents "spoiling" future innings in the scoreboard.
      -->
      <div class="cell team-col">
        <img v-if="awayTeamId" :src="logoUrl(awayTeamId)" class="scoreboard-logo" />
        {{ awayTeamName || 'AWAY' }}
      </div>
      <div
        v-for="(runs, i) in awayScore"
        :key="'a' + i"
        class="cell"
        :class="{ active: i === inning - 1 && isTop }"
      >
        {{ i < inning || (i === inning - 1 && isTop) ? runs : '' }}
      </div>
      <!-- Away team R H E totals — always visible -->
      <div class="cell total-col">{{ awayTotal }}</div>
      <div class="cell total-col">{{ awayHits }}</div>
      <div class="cell total-col">{{ awayErrors }}</div>

      <!--
        Home team row.
        Same structure as away row, but the display logic differs slightly:
        - Show runs for completed innings (i < inning - 1, because the home team
          bats in the bottom half, so their inning completes one half-inning later)
        - Show current inning's runs only if it's the bottom half (!isTop)
      -->
      <div class="cell team-col">
        <img v-if="homeTeamId" :src="logoUrl(homeTeamId)" class="scoreboard-logo" />
        {{ homeTeamName || 'HOME' }}
      </div>
      <div
        v-for="(runs, i) in homeScore"
        :key="'hm' + i"
        class="cell"
        :class="{ active: i === inning - 1 && !isTop }"
      >
        {{ i < inning - 1 || (i === inning - 1 && !isTop) ? runs : '' }}
      </div>
      <!-- Home team R H E totals — always visible -->
      <div class="cell total-col">{{ homeTotal }}</div>
      <div class="cell total-col">{{ homeHits }}</div>
      <div class="cell total-col">{{ homeErrors }}</div>
    </div>

    <!--
      Game Info Bar — displays count, outs, and inning below the score grid.
      These are the three pieces of information a viewer needs at a glance
      to understand the current game situation.
    -->
    <div class="game-info">
      <!--
        Ball-Strike Count display.
        Shows as "B-S" format (e.g., "3-2" for a full count).
        Balls are green (positive for batter) and strikes are red (negative for batter).
      -->
      <div class="count-display">
        <div class="info-label">COUNT</div>
        <div class="count-numbers">
          <span class="balls-val">{{ balls }}</span>
          <span class="separator">-</span>
          <span class="strikes-val">{{ strikes }}</span>
        </div>
        <!-- Labels below the numbers for clarity -->
        <div class="count-labels">
          <span>B</span><span></span><span>S</span>
        </div>
      </div>

      <!--
        Outs display — two circular dots that fill in as outs are recorded.
        Only two dots because three outs ends the half-inning (so you never
        see three filled dots — the display resets on the third out).
        The 'filled' class fills the dot with red to indicate an out.
      -->
      <div class="outs-display">
        <div class="info-label">OUTS</div>
        <div class="out-dots">
          <span class="out-dot" :class="{ filled: outs >= 1 }"></span>
          <span class="out-dot" :class="{ filled: outs >= 2 }"></span>
        </div>
      </div>

      <!--
        Inning display — shows the current inning number with an arrow
        indicating top (up arrow = away batting) or bottom (down arrow = home batting).
        This follows the universal baseball convention.
      -->
      <div class="inning-display">
        <div class="info-label">INNING</div>
        <div class="inning-number">
          <!-- ▲ = top of inning (away bats), ▼ = bottom of inning (home bats) -->
          <span class="arrow">{{ isTop ? '▲' : '▼' }}</span>
          {{ inning }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

/**
 * Component props — all game state data is passed in from the parent (InteractiveGame).
 * This component is purely presentational (no API calls, no mutations).
 */
const props = defineProps({
  /** Array of runs scored per inning by the away team, e.g. [0, 1, 0, 0, 2, ...] */
  awayScore: { type: Array, default: () => [] },
  /** Array of runs scored per inning by the home team */
  homeScore: { type: Array, default: () => [] },
  /** Total runs for the away team (sum of awayScore) */
  awayTotal: { type: Number, default: 0 },
  /** Total runs for the home team (sum of homeScore) */
  homeTotal: { type: Number, default: 0 },
  /** Current inning number (1-indexed: 1 = first inning) */
  inning: { type: Number, default: 1 },
  /** Whether it's the top of the inning (true = away batting, false = home batting) */
  isTop: { type: Boolean, default: true },
  /** Current ball count (0-3, resets on 4 = walk) */
  balls: { type: Number, default: 0 },
  /** Current strike count (0-2, resets on 3 = strikeout) */
  strikes: { type: Number, default: 0 },
  /** Current out count (0-2, resets on 3 = half-inning ends) */
  outs: { type: Number, default: 0 },
  /** Away team abbreviation for display (e.g., "NYY") */
  awayTeamName: { type: String, default: '' },
  /** Home team abbreviation for display (e.g., "BOS") */
  homeTeamName: { type: String, default: '' },
  /** Name of the current batter (not currently displayed in scoreboard, but available) */
  currentBatterName: { type: String, default: '' },
  /** Away team numeric ID — used to load the team logo from the MLB CDN */
  awayTeamId: { type: Number, default: 0 },
  /** Home team numeric ID — used to load the team logo from the MLB CDN */
  homeTeamId: { type: Number, default: 0 },
  /** Total hits for the away team */
  awayHits: { type: Number, default: 0 },
  /** Total hits for the home team */
  homeHits: { type: Number, default: 0 },
  /** Total errors for the away team */
  awayErrors: { type: Number, default: 0 },
  /** Total errors for the home team */
  homeErrors: { type: Number, default: 0 },
})

/** Build the MLB CDN URL for a team's logo SVG. */
function logoUrl(teamId) {
  if (teamId >= 1000) return `${import.meta.env.BASE_URL}negro-leagues-logo.svg`
  return `https://www.mlbstatic.com/team-logos/${teamId}.svg`
}

/**
 * Total number of innings to display in the scoreboard.
 * Derived from the length of the away score array, which the game engine
 * extends automatically for extra innings beyond the standard 9.
 * This means the grid automatically grows columns for extras — no hardcoded 9.
 */
const totalInnings = computed(() => props.awayScore.length)

/**
 * Dynamic CSS Grid column definition.
 *
 * WHY DYNAMIC: A standard 9-inning game needs 9 columns, but extra-inning games
 * need more. Rather than hardcoding "repeat(9, 1fr)", we compute the column count
 * from the actual data so the grid grows automatically.
 *
 * Layout: 60px team name | N x 1fr inning columns | 40px total column
 * - 60px is enough for 3-4 letter team abbreviations
 * - 1fr columns share remaining space equally (each inning gets the same width)
 * - 40px total column is slightly wider for emphasis
 */
const gridStyle = computed(() => ({
  gridTemplateColumns: `minmax(50px, 80px) repeat(${totalInnings.value}, 1fr) repeat(3, minmax(30px, 40px))`,
}))
</script>

<style scoped>
/* ========== Scoreboard Container ========== */
/*
  Dark background with red accent border — mimics the look of a stadium
  electronic scoreboard. The border-radius softens the industrial look
  slightly for a web-friendly aesthetic.
*/
.scoreboard {
  background: #0f0f23;
  border: 2px solid #e94560;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 16px;
}

/* ========== Score Grid ========== */
/*
  CSS Grid for the line score table.
  overflow-x: auto allows horizontal scrolling if there are many extra innings
  and the container is narrow (e.g., on mobile).
  Monospace font ensures all numbers align perfectly in columns.
*/
.score-grid {
  display: grid;
  gap: 0;
  overflow-x: auto;
  font-family: 'Courier New', monospace;
}

/*
  Base cell styling — flex centering ensures numbers are perfectly centered
  in each grid cell. The bottom border creates subtle row dividers.
  min-width: 0 is needed to prevent grid cells from overflowing their track
  (a common CSS Grid gotcha with content wider than the track).
*/
.cell {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px 4px;
  font-size: 14px;
  color: #e0e0e0;
  border-bottom: 1px solid #1a1a2e;
  min-width: 0;
}

/* Header cells (inning numbers) — smaller and grayed out to be less prominent */
.cell.header {
  color: #888;
  font-size: 12px;
  border-bottom: 1px solid #333;
}

/* Team name column — left-aligned and styled in the app's accent red */
.cell.team-col {
  justify-content: flex-start;
  font-weight: bold;
  color: #e94560;
  font-size: 13px;
  padding-left: 6px;
  gap: 4px;
}

.scoreboard-logo {
  width: 18px;
  height: 18px;
  object-fit: contain;
}

/* Team column in the header row should be gray, not red */
.cell.team-col.header {
  color: #888;
}

/*
  Total runs column — bold yellow to draw the eye to the most important number.
  Left border separates the total from the per-inning scores visually.
*/
.cell.total-col {
  font-weight: bold;
  color: #ffdd00;
  border-left: 2px solid #333;
}

/*
  Active cell highlight — subtle red background tint on the current inning's cell.
  This helps the user instantly see which inning and half-inning is being played.
*/
.cell.active {
  background: rgba(233, 69, 96, 0.15);
}

/* ========== Game Info Bar ========== */
/*
  Horizontal layout for count, outs, and inning displays.
  Separated from the score grid by a top border for visual grouping.
*/
.game-info {
  display: flex;
  justify-content: space-around;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #333;
}

/* Tiny uppercase label above each info panel (COUNT, OUTS, INNING) */
.info-label {
  font-size: 10px;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 4px;
  text-align: center;
}

/* ========== Count Display ========== */
/* Centers the ball-strike count vertically */
.count-display {
  text-align: center;
}

/* Large monospace numbers for the count (e.g., "3-2") */
.count-numbers {
  font-size: 24px;
  font-weight: bold;
  font-family: 'Courier New', monospace;
}

/* Balls shown in green — positive for the batter (closer to a walk) */
.balls-val {
  color: #4caf50;
}

/* Strikes shown in red — negative for the batter (closer to strikeout) */
.strikes-val {
  color: #e94560;
}

/* Dash separator between balls and strikes, subdued gray */
.separator {
  color: #666;
  margin: 0 2px;
}

/* "B" and "S" labels below the count numbers */
.count-labels {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: #666;
  padding: 0 4px;
}

/* ========== Outs Display ========== */
/* Centers the out dots vertically */
.outs-display {
  text-align: center;
}

/* Horizontal row of out indicator dots with spacing */
.out-dots {
  display: flex;
  gap: 8px;
  justify-content: center;
  margin-top: 6px;
}

/*
  Individual out dot — a 16px circle with a red border.
  When empty, it's just an outline. When filled, it gets a solid red background.
  This is a common baseball UI pattern seen on TV broadcasts and stadium boards.
*/
.out-dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid #e94560;
  display: inline-block;
}

/* Filled state: solid red background indicates an out has been recorded */
.out-dot.filled {
  background: #e94560;
}

/* ========== Inning Display ========== */
/* Centers the inning number and arrow */
.inning-display {
  text-align: center;
}

/* Large monospace inning number with the top/bottom arrow */
.inning-number {
  font-size: 24px;
  font-weight: bold;
  font-family: 'Courier New', monospace;
  color: #e0e0e0;
}

/* The triangle arrow (▲/▼) shown smaller and in red next to the inning number */
.arrow {
  font-size: 14px;
  color: #e94560;
}

/* ========== Mobile Responsive ========== */
@media (max-width: 600px) {
  .scoreboard {
    padding: 8px;
  }

  .cell {
    padding: 4px 2px;
    font-size: 12px;
  }

  .cell.header {
    font-size: 10px;
  }

  .cell.team-col {
    font-size: 11px;
    padding-left: 2px;
  }

  .scoreboard-logo {
    width: 14px;
    height: 14px;
  }

  .count-numbers {
    font-size: 20px;
  }

  .inning-number {
    font-size: 20px;
  }

  .out-dot {
    width: 12px;
    height: 12px;
  }
}
</style>
