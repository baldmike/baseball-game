<template>
  <!--
    InteractiveGame — the main game component that orchestrates the entire experience.

    This component serves two purposes:
    1. A 5-step setup wizard (steps 1-5) where players configure their matchup
    2. The live game UI with scoreboard, diamond, controls, and play log

    The `setupStep` ref drives which step is shown. Once a game is created
    (game ref is non-null), the setup wizard hides and the game UI appears.
  -->
  <div class="interactive-game">
    <!--
      ==================== STEP 1: PICK SEASON + TEAM ====================
      The landing screen with three paths forward:
      1. Pick a season, then click a team in the grid (advances to step 2)
      2. Click a Classic Matchup button (jumps to step 4 with pre-filled teams)
      3. Click "Skip" to start with random teams (creates game immediately)

      Shown when: no game exists AND we're on step 1
    -->
    <div v-if="!game && setupStep === 1">
      <div class="season-hero">
        <h2 class="season-hero-title">Pick a Season</h2>
        <p class="season-hero-sub">Choose an era, then select your team</p>
        <select id="home-season" v-model="selectedSeason" class="season-hero-dropdown">
          <option v-for="year in availableSeasons" :key="year" :value="year">{{ year }}</option>
        </select>
        <span v-if="loadingHomeTeams" class="season-hero-loading">Loading teams...</span>
      </div>
      <TeamSelector :teams="homeTeams" @teamSelected="onTeamSelected" />

      <!--
        Classic Matchups — pre-configured historical matchups that skip
        the manual team/season selection process.

        WHY CLASSIC MODE EXISTS:
        Selecting two teams, two seasons, and two pitchers is 5 steps.
        Classic matchups let users jump straight to a fun, themed game
        with a single click. They also showcase the historical roster
        feature by pairing iconic teams from different eras.

        When a classic matchup is selected, classicMode is set to true,
        which changes step 6's behavior to show BOTH pitcher lists
        (since the user didn't go through steps 3 and 5 separately).
      -->
      <div class="classic-matchups">
        <h3 class="classic-header">Historic Games</h3>
        <div class="matchup-grid">
          <button
            v-for="(m, i) in historicalMatchups"
            :key="'h' + i"
            class="matchup-card"
            @click="selectClassicMatchup(m)"
          >
            <div class="matchup-logos">
              <img :src="teamLogoUrl(m.away.id)" class="matchup-logo" />
              <span class="matchup-vs">vs</span>
              <img :src="teamLogoUrl(m.home.id)" class="matchup-logo" />
            </div>
            <div class="matchup-label">{{ m.label }}</div>
            <div class="matchup-date">{{ m.date }} — {{ m.stadium }}</div>
            <div class="matchup-teams">{{ m.away.name }} @ {{ m.home.name }}</div>
            <div class="matchup-pitchers">{{ m.away.pitcherName }} vs {{ m.home.pitcherName }}</div>
            <div class="matchup-decision"><span class="decision-w">W: {{ m.winningPitcher }}</span> · <span class="decision-l">L: {{ m.losingPitcher }}</span></div>
          </button>
        </div>

        <h3 class="classic-header" style="margin-top: 20px">Fantasy Matchups</h3>
        <div class="matchup-grid">
          <button
            v-for="(m, i) in fantasyMatchups"
            :key="'f' + i"
            class="matchup-card"
            @click="selectClassicMatchup(m)"
          >
            <div class="matchup-logos">
              <img :src="teamLogoUrl(m.away.id)" class="matchup-logo" />
              <span class="matchup-vs">vs</span>
              <img :src="teamLogoUrl(m.home.id)" class="matchup-logo" />
            </div>
            <div class="matchup-label">{{ m.label }}</div>
            <div class="matchup-teams">{{ m.away.season }} {{ m.away.name }} vs {{ m.home.season }} {{ m.home.name }}</div>
            <div class="matchup-pitchers">{{ m.away.pitcherName }} vs {{ m.home.pitcherName }}</div>
          </button>
        </div>
      </div>

      <!-- Skip button: bypasses all team selection and starts with random teams -->
      <div class="skip-select">
        <button class="skip-btn" @click="startGame()">Skip — Play without teams</button>
      </div>
    </div>

    <!--
      ==================== STEP 2: PICK YOUR PITCHER ====================
      Shows the list of pitchers from the selected team+season roster.
      Pitchers are fetched from the API when entering this step.
    -->
    <div v-if="!game && setupStep === 2" class="start-screen">
      <div class="step-header">
        <button class="back-btn" @click="goBack">&larr; Back</button>
        <h3 class="step-label">{{ homeTeamName }} ({{ selectedSeason }})</h3>
      </div>

      <div v-if="loadingPitchers" class="pitcher-loading">Loading pitchers...</div>

      <div v-else-if="pitcherList.length > 0" class="pitcher-selection">
        <p>Choose your starting pitcher:</p>
        <div class="pitcher-list">
          <button
            v-for="p in pitcherList"
            :key="p.id"
            class="pitcher-option"
            :class="{ selected: selectedPitcherId === p.id }"
            @click="selectedPitcherId = p.id"
          >
            <span class="pitcher-opt-name">{{ p.name }}</span>
            <span class="pitcher-opt-stats">ERA {{ p.stats.era.toFixed(2) }} | K/9 {{ p.stats.k_per_9.toFixed(1) }}</span>
          </button>
        </div>
      </div>

      <div v-else-if="!loadingPitchers">
        <p>No pitchers found — one will be assigned automatically.</p>
      </div>

      <button class="play-btn" @click="goToStep(3)" :disabled="loadingPitchers">Next</button>
    </div>

    <!--
      ==================== STEP 3: PICK OPPONENT SEASON + TEAM ====================
      Season dropdown above the opponent team grid. Teams update when season changes.
    -->
    <div v-if="!game && setupStep === 3" class="start-screen">
      <div class="step-header">
        <button class="back-btn" @click="goBack">&larr; Back</button>
        <h3 class="step-label">Now pick the opponent</h3>
      </div>
      <div class="season-select pregame-season" style="margin-bottom: 16px; text-align: center;">
        <label for="away-season" style="color: #aaa; font-size: 14px; margin-right: 8px;">Season:</label>
        <select id="away-season" v-model="selectedAwaySeason" class="season-dropdown">
          <option v-for="year in availableSeasons" :key="year" :value="year">{{ year }}</option>
        </select>
        <span v-if="loadingAwayTeams" style="color: #888; margin-left: 12px; font-size: 13px;">Loading teams...</span>
      </div>
      <div class="opponent-leagues">
        <div v-for="league in opponentLeagues" :key="league.name" class="opponent-league-section">
          <h4 class="league-header">{{ league.label }}</h4>
          <div class="opponent-grid">
            <div
              v-for="team in league.teams"
              :key="team.id"
              class="opponent-card"
              :class="{ selected: selectedOpponentId === team.id }"
              @click="selectedOpponentId = team.id"
            >
              <img :src="teamLogoUrl(team.id)" :alt="team.name" class="opponent-logo" />
              <div class="opponent-abbr">{{ team.abbreviation }}</div>
              <div class="opponent-name">{{ team.name }}</div>
            </div>
          </div>
        </div>
      </div>
      <button class="play-btn" @click="goToStep(4)" :disabled="!selectedOpponentId" style="margin-top: 20px">Next</button>
    </div>

    <!--
      ==================== STEP 4: PICK OPPONENT PITCHER ====================
      Select the opponent's starting pitcher (and home pitcher in classic mode).

      NORMAL MODE (classicMode = false):
        Shows only the AWAY pitcher list, because the home pitcher was already
        selected in step 2.

      CLASSIC MODE (classicMode = true):
        Shows BOTH home and away pitcher lists, because the user skipped steps 2-3
        by selecting a classic matchup.
    -->
    <div v-if="!game && setupStep === 4" class="start-screen">
      <div class="step-header">
        <button class="back-btn" @click="goBack">&larr; Back</button>
        <h3 class="step-label" v-if="!classicMode">{{ awayTeamName }} ({{ selectedAwaySeason }})</h3>
        <h3 class="step-label" v-else>{{ homeTeamName }} ({{ selectedSeason }}) vs {{ awayTeamName }} ({{ selectedAwaySeason }})</h3>
      </div>

      <!-- Loading state while pitcher lists are being fetched -->
      <div v-if="loadingPitchers || loadingAwayPitchers" class="pitcher-loading">Loading pitchers...</div>

      <template v-else>
        <!--
          Home pitcher selection — ONLY shown in classic mode because in normal mode
          the home pitcher was already picked in step 3.
        -->
        <div v-if="classicMode && pitcherList.length > 0" class="pitcher-selection">
          <p>Choose your starting pitcher ({{ homeTeamName }}):</p>
          <div class="pitcher-list">
            <button
              v-for="p in pitcherList"
              :key="p.id"
              class="pitcher-option"
              :class="{ selected: selectedPitcherId === p.id }"
              @click="selectedPitcherId = p.id"
            >
              <span class="pitcher-opt-name">{{ p.name }}</span>
              <span class="pitcher-opt-stats">ERA {{ p.stats.era.toFixed(2) }} | K/9 {{ p.stats.k_per_9.toFixed(1) }}</span>
            </button>
          </div>
        </div>

        <!-- Away pitcher selection — shown in both normal and classic modes -->
        <div v-if="awayPitcherList.length > 0" class="pitcher-selection">
          <p>Choose the opponent's starting pitcher ({{ awayTeamName }}):</p>
          <div class="pitcher-list">
            <button
              v-for="p in awayPitcherList"
              :key="p.id"
              class="pitcher-option"
              :class="{ selected: selectedAwayPitcherId === p.id }"
              @click="selectedAwayPitcherId = p.id"
            >
              <span class="pitcher-opt-name">{{ p.name }}</span>
              <span class="pitcher-opt-stats">ERA {{ p.stats.era.toFixed(2) }} | K/9 {{ p.stats.k_per_9.toFixed(1) }}</span>
            </button>
          </div>
        </div>

        <!-- Fallback when no pitchers are available for either team -->
        <div v-if="!awayPitcherList.length && (!classicMode || !pitcherList.length)">
          <p>No pitchers found — they will be assigned automatically.</p>
        </div>

      </template>

      <button class="play-btn" @click="goToStep(5)" :disabled="loadingPitchers || loadingAwayPitchers" style="margin-top: 20px">Next</button>
    </div>

    <!--
      ==================== STEP 5: WEATHER + START GAME ====================
      Weather picker and action buttons to start the game.
      For historical matchups, the real weather is auto-selected but can be overridden.
      For custom/fantasy games, defaults to "Clear Skies".
    -->
    <div v-if="!game && setupStep === 5" class="start-screen">
      <div class="step-header">
        <button class="back-btn" @click="goBack">&larr; Back</button>
        <h3 class="step-label">Game Day Weather</h3>
      </div>

      <div class="weather-selection">
        <p>Choose the conditions:</p>
        <div class="weather-grid">
          <button
            v-for="key in weatherKeys"
            :key="key"
            class="weather-card"
            :class="{ selected: selectedWeather === key }"
            @click="selectedWeather = key"
          >
            <span class="weather-icon">{{ WEATHER_CONDITIONS[key].icon }}</span>
            <span class="weather-label">{{ WEATHER_CONDITIONS[key].label }}</span>
            <span class="weather-detail">{{ WEATHER_CONDITIONS[key].temp }} · {{ WEATHER_CONDITIONS[key].wind }}</span>
          </button>
        </div>
      </div>

      <div class="start-actions">
        <button class="play-btn" @click="startGame()" :disabled="loading">
          {{ loading ? 'Loading rosters...' : 'Play Ball!' }}
        </button>
        <button class="play-btn simulate-btn" @click="startSimulation()" :disabled="loading">
          {{ loading ? 'Loading...' : 'Simulate' }}
        </button>
      </div>
    </div>

    <!--
      ==================== ACTIVE GAME UI ====================
      Everything below is shown once game ref is non-null (game has been created).
      This includes: sound toggle, game-over overlay, scoreboard, field layout
      (diamond + player headshots), last play banner, controls, and play log.
    -->
    <div v-if="game">
      <!--
        Sound Toggle — positioned absolutely in the top-right corner.
        Toggles the global mute state from the useSoundEffects composable.
        The emoji changes between speaker and muted-speaker icons.
      -->
      <button class="sound-toggle" @click="onToggleSound" :title="soundMuted ? 'Unmute' : 'Mute'">
        {{ soundMuted ? '🔇' : '🔊' }}
      </button>

      <!--
        Game Over Overlay — a semi-transparent dark overlay that covers
        the entire game UI when game_status is 'final'.
        Shows the final score and a win/lose message.
        The overlay uses position: absolute + z-index to sit on top of all game content.
      -->
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
              <!-- "(You)" label reminds the player which team they controlled -->
              <span class="label">{{ game.home_abbreviation || 'HOME' }} (You)</span>
              <span class="score">{{ game.home_total }}</span>
            </div>
          </div>
          <!-- Simple win/lose determination based on run totals -->
          <p class="result-text">{{ game.home_total > game.away_total ? 'You Win!' : 'You Lose!' }}</p>
          <!-- Resets all state and returns to step 1 -->
          <button class="play-btn" @click="resetGame">New Game</button>
        </div>
      </div>

      <!--
        Scoreboard component — displays the line score grid with per-inning runs,
        ball-strike count, outs, and current inning. All data is passed as props.
      -->
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
        :away-team-id="selectedOpponentId || 0"
        :home-team-id="teamSelected || 0"
      />

      <!-- Weather banner — shows the current weather condition during the game -->
      <div v-if="game.weather && WEATHER_CONDITIONS[game.weather]" class="weather-banner">
        <span class="weather-banner-icon">{{ WEATHER_CONDITIONS[game.weather].icon }}</span>
        <span class="weather-banner-text">{{ WEATHER_CONDITIONS[game.weather].label }} · {{ WEATHER_CONDITIONS[game.weather].temp }}</span>
      </div>

      <!--
        Field Layout — a horizontal flex row with:
          Left: Pitcher headshot + name
          Center: Baseball diamond SVG
          Right: Batter headshot + name

        This layout mimics the real pitcher-batter confrontation view.
      -->
      <div class="field-layout">
        <!-- Pitcher card (left side) — shows who is currently on the mound -->
        <div class="player-card pitcher-side">
          <div class="headshot-wrapper">
            <img
              v-if="currentPitcher?.id"
              :src="headshotUrl(currentPitcher.id)"
              :alt="currentPitcherName"
              class="player-headshot"
            />
            <img :src="teamLogoUrl(currentPitcherTeamId)" class="player-team-badge" />
          </div>
          <div class="player-card-info">
            <span class="player-card-label">PITCHING</span>
            <span class="player-card-name pitcher-name">{{ currentPitcherName }}</span>
          </div>
          <div class="fatigue-meter">
            <span class="pitch-count">{{ currentPitchCount }} pitches</span>
            <div class="fatigue-bar">
              <div class="fatigue-fill" :style="{ width: fatiguePercent + '%' }" :class="fatigueLevel"></div>
            </div>
          </div>
        </div>

        <!-- Baseball diamond SVG — shows base occupancy with runner dots -->
        <BaseballDiamond :bases="game.bases" />

        <!-- Batter card (right side) — shows who is currently at bat -->
        <div class="player-card batter-side">
          <div class="headshot-wrapper">
            <img
              v-if="currentBatter?.id"
              :src="headshotUrl(currentBatter.id)"
              :alt="game.current_batter_name"
              class="player-headshot"
            />
            <img :src="teamLogoUrl(currentBatterTeamId)" class="player-team-badge" />
          </div>
          <div class="player-card-info">
            <span class="player-card-label">AT BAT</span>
            <span class="player-card-name batter-name-text">{{ game.current_batter_name }}</span>
          </div>
        </div>
      </div>

      <!--
        Last Play Banner — shows the most recent play description from the backend.
        Styled prominently in yellow on a dark background so the user can see
        what just happened at a glance.
      -->
      <div class="last-play" v-if="game.last_play">
        <p>{{ game.last_play }}</p>
      </div>

      <!--
        ==================== SIMULATION SPEED CONTROLS ====================
        Shown only during an automated simulation replay (simulating = true).

        SIMULATION REPLAY MECHANISM:
        When the user clicks "Simulate", the backend runs the entire game at once
        and returns an array of snapshot objects (simSnapshots). Each snapshot
        represents the game state after one play. The frontend replays these
        snapshots on a setInterval timer, advancing simReplayIndex each tick
        and updating the game ref with the next snapshot.

        Speed buttons control the interval between snapshots:
        - Slow:   2000ms (2 seconds per play — good for reading play descriptions)
        - Normal: 1000ms (1 second per play — balanced viewing speed)
        - Fast:   300ms  (0.3 seconds per play — quick overview)
        - Skip:   Jumps to the final snapshot immediately (shows just the result)

        Changing speed restarts the timer with the new interval.
      -->
      <div v-if="simulating" class="sim-controls">
        <div class="mode-label">Simulation in progress</div>
        <div class="button-group">
          <!-- Each speed button highlights when it matches the current simSpeed -->
          <button class="action-btn speed-btn" :class="{ active: simSpeed === 2000 }" @click="setSimSpeed(2000)">Slow</button>
          <button class="action-btn speed-btn" :class="{ active: simSpeed === 1000 }" @click="setSimSpeed(1000)">Normal</button>
          <button class="action-btn speed-btn" :class="{ active: simSpeed === 300 }" @click="setSimSpeed(300)">Fast</button>
          <!-- Skip to End: stops the timer and jumps to the last snapshot -->
          <button class="action-btn speed-btn skip" @click="skipToEnd()">Skip to End</button>
        </div>
      </div>

      <!--
        ==================== INTERACTIVE GAME CONTROLS ====================
        Shown only when the game is active (not final) and not simulating.
        The backend's `player_role` field determines whether the user is
        currently pitching or batting.

        - Pitching: user is the home team's pitcher (top of inning, away team bats)
        - Batting: user is a home team batter (bottom of inning, home team bats)
      -->
      <div class="controls" v-if="game.game_status === 'active' && !simulating">
        <!--
          Pitching Mode — shown when game.player_role === 'pitching'.
          The user chooses a pitch type (fastball, curveball, slider, changeup),
          which is sent to the backend to resolve the at-bat.
        -->
        <div v-if="game.player_role === 'pitching'" class="pitch-controls">
          <div class="mode-label">You're Pitching — Choose your pitch:</div>
          <div class="button-group">
            <!-- One button per pitch type from the pitchTypes array -->
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
          <div class="bullpen-controls">
            <button v-if="game.home_bullpen.length" class="change-pitcher-btn" @click="showBullpen = true">
              Change Pitcher ({{ currentPitchCount }})
            </button>
          </div>
          <!-- Bullpen modal -->
          <div v-if="showBullpen" class="bullpen-overlay" @click.self="showBullpen = false">
            <div class="bullpen-modal">
              <h3 class="bullpen-title">Bullpen</h3>
              <div class="bullpen-list">
                <button
                  v-for="p in game.home_bullpen"
                  :key="p.id"
                  class="bullpen-option"
                  @click="doSwitchPitcher(p)"
                >
                  <span class="bullpen-name">{{ p.name }}</span>
                  <span class="bullpen-stats" v-if="p.stats">ERA {{ p.stats.era.toFixed(2) }} | K/9 {{ p.stats.k_per_9.toFixed(1) }}</span>
                </button>
              </div>
              <button class="bullpen-cancel" @click="showBullpen = false">Cancel</button>
            </div>
          </div>
        </div>

        <!--
          Batting Mode — shown when game.player_role === 'batting'.
          The user chooses to swing at the pitch or take (let it go by).
          The backend determines if the pitch was a ball or strike and
          resolves contact/miss outcomes for swings.
        -->
        <div v-if="game.player_role === 'batting'" class="bat-controls">
          <div class="mode-label">You're Batting — Swing or take?</div>
          <div class="button-group">
            <!-- Swing: attempt to hit the pitch -->
            <button class="action-btn swing-btn" @click="doBat('swing')" :disabled="loading">
              Swing!
            </button>
            <!-- Take: watch the pitch go by (hoping for a ball call) -->
            <button class="action-btn take-btn" @click="doBat('take')" :disabled="loading">
              Take
            </button>
          </div>
        </div>
      </div>

      <!--
        ==================== BOX SCORE ====================
        Running box score showing per-player batting stats and pitcher stats
        for both teams. Updates after every play.
      -->
      <div class="box-score-section">
        <!-- Away team batting -->
        <div class="box-team">
          <h3 class="box-team-header">{{ game.away_abbreviation || 'AWAY' }} Batting</h3>
          <table class="box-table">
            <thead>
              <tr>
                <th class="box-name">Player</th>
                <th>POS</th>
                <th>AB</th>
                <th>R</th>
                <th>H</th>
                <th>RBI</th>
                <th>BB</th>
                <th>SO</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(p, i) in game.away_box_score"
                :key="p.id"
                :class="{ 'active-batter': game.is_top && i === game.current_batter_index }"
              >
                <td class="box-name">{{ p.name }}</td>
                <td>{{ p.pos }}</td>
                <td>{{ p.ab }}</td>
                <td>{{ p.r }}</td>
                <td>{{ p.h }}</td>
                <td>{{ p.rbi }}</td>
                <td>{{ p.bb }}</td>
                <td>{{ p.so }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Home team batting -->
        <div class="box-team">
          <h3 class="box-team-header">{{ game.home_abbreviation || 'HOME' }} Batting</h3>
          <table class="box-table">
            <thead>
              <tr>
                <th class="box-name">Player</th>
                <th>POS</th>
                <th>AB</th>
                <th>R</th>
                <th>H</th>
                <th>RBI</th>
                <th>BB</th>
                <th>SO</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(p, i) in game.home_box_score"
                :key="p.id"
                :class="{ 'active-batter': !game.is_top && i === game.current_batter_index }"
              >
                <td class="box-name">{{ p.name }}</td>
                <td>{{ p.pos }}</td>
                <td>{{ p.ab }}</td>
                <td>{{ p.r }}</td>
                <td>{{ p.h }}</td>
                <td>{{ p.rbi }}</td>
                <td>{{ p.bb }}</td>
                <td>{{ p.so }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pitching summary -->
        <div class="box-team" v-if="game.away_pitcher_stats || game.home_pitcher_stats">
          <h3 class="box-team-header">Pitching</h3>
          <table class="box-table">
            <thead>
              <tr>
                <th class="box-name">Pitcher</th>
                <th>IP</th>
                <th>H</th>
                <th>R</th>
                <th>ER</th>
                <th>BB</th>
                <th>SO</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="game.away_pitcher_stats">
                <td class="box-name">{{ game.away_pitcher_stats.name }} ({{ game.away_abbreviation || 'AWAY' }})</td>
                <td>{{ formatIP(game.away_pitcher_stats.ip_outs) }}</td>
                <td>{{ game.away_pitcher_stats.h }}</td>
                <td>{{ game.away_pitcher_stats.r }}</td>
                <td>{{ game.away_pitcher_stats.er }}</td>
                <td>{{ game.away_pitcher_stats.bb }}</td>
                <td>{{ game.away_pitcher_stats.so }}</td>
              </tr>
              <tr v-if="game.home_pitcher_stats">
                <td class="box-name">{{ game.home_pitcher_stats.name }} ({{ game.home_abbreviation || 'HOME' }})</td>
                <td>{{ formatIP(game.home_pitcher_stats.ip_outs) }}</td>
                <td>{{ game.home_pitcher_stats.h }}</td>
                <td>{{ game.home_pitcher_stats.r }}</td>
                <td>{{ game.home_pitcher_stats.er }}</td>
                <td>{{ game.home_pitcher_stats.bb }}</td>
                <td>{{ game.home_pitcher_stats.so }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { createNewGame, simulateGame, processPitch, processAtBat, switchPitcher } from '../services/gameEngine.js'
import { getAllTeams, getTeamPitchers } from '../services/mlbApi.js'
import { WEATHER_CONDITIONS } from '../services/weather.js'
import { useSoundEffects } from '../composables/useSoundEffects.js'
import BaseballDiamond from './BaseballDiamond.vue'
import Scoreboard from './Scoreboard.vue'
import TeamSelector from './TeamSelector.vue'

// ============================================================
// CORE GAME STATE
// ============================================================

/**
 * The main game state object from the backend.
 * null when no game is active (setup wizard is shown instead).
 * Contains everything: scores, bases, count, lineups, play log, etc.
 */
const game = ref(null)

/**
 * Loading flag — true while an API call is in flight.
 * Disables action buttons to prevent double-submission.
 */
const loading = ref(false)


// ============================================================
// SETUP WIZARD STATE
// Drives the 4-step pre-game configuration flow.
// ============================================================

/**
 * Current step in the setup wizard (1-4).
 * Each step corresponds to a v-if block in the template:
 *   1 = Pick season + home team (or classic matchup, or skip)
 *   2 = Pick home team's starting pitcher
 *   3 = Pick opponent season + team
 *   4 = Pick opponent's pitcher + start game
 */
const setupStep = ref(1)

/**
 * The MLB team ID of the user's selected home team (e.g., 147 for Yankees).
 * Set in step 1 when a team card is clicked.
 */
const teamSelected = ref(null)

/**
 * The season year for the home team's roster (e.g., 2024, 1927).
 * Defaults to 2024 (most recent complete season).
 */
const selectedSeason = ref(2024)

/**
 * Array of all available season years for the dropdown.
 * Generated as [2025, 2024, 2023, ..., 1921, 1920] — descending so the
 * most recent (and most complete data) seasons appear first.
 * Spans from 1920 (start of the "live ball era") to 2025.
 */
const availableSeasons = Array.from({ length: 2025 - 1920 + 1 }, (_, i) => 2025 - i)

/**
 * Loading flag for the home team's pitcher list API call.
 * Controls the "Loading pitchers..." message in steps 3 and 6.
 */
const loadingPitchers = ref(false)

/**
 * Array of pitcher objects for the home team.
 * Each object has id, name, and stats (era, k_per_9, etc.).
 * Populated when entering step 3 (or step 6 in classic mode).
 */
const pitcherList = ref([])

/**
 * The MLB player ID of the selected home starting pitcher.
 * null means the backend will auto-assign a pitcher.
 */
const selectedPitcherId = ref(null)

/** Era-appropriate teams for the home season, fetched via getAllTeams(season). */
const homeTeams = ref([])
/** Era-appropriate teams for the opponent season, fetched via getAllTeams(season). */
const awayTeams = ref([])
/** Loading flag while home teams are being fetched. */
const loadingHomeTeams = ref(false)
/** Loading flag while away teams are being fetched. */
const loadingAwayTeams = ref(false)

/**
 * The MLB team ID of the selected opponent (away) team.
 * Set in step 4 when an opponent card is clicked.
 */
const selectedOpponentId = ref(null)

/**
 * The season year for the away team's roster.
 * Independent from selectedSeason so you can create cross-era matchups.
 */
const selectedAwaySeason = ref(2024)

/**
 * Loading flag for the away team's pitcher list API call.
 */
const loadingAwayPitchers = ref(false)

/**
 * Array of pitcher objects for the away team.
 * Same structure as pitcherList but for the opponent.
 */
const awayPitcherList = ref([])

/**
 * The MLB player ID of the selected away starting pitcher.
 */
const selectedAwayPitcherId = ref(null)

/**
 * Whether the user entered setup via a "Classic Matchup" button.
 *
 * WHY THIS EXISTS:
 * In normal flow, the user picks their home pitcher in step 3 and the away
 * pitcher in step 6. In classic mode, the user skips steps 2-5 and jumps
 * directly to step 6, so step 6 needs to show BOTH pitcher lists.
 *
 * classicMode also affects the goBack() behavior — from step 6 in classic
 * mode, "Back" returns to step 1 (not step 5) since steps 2-5 were skipped.
 */
const classicMode = ref(false)

/**
 * Selected weather condition key (e.g., 'clear', 'hot', 'rain').
 * Auto-set from historical matchup data or manually chosen on step 6.
 */
const selectedWeather = ref('clear')

/**
 * All weather condition keys for the weather picker UI.
 */
const weatherKeys = Object.keys(WEATHER_CONDITIONS)

// ============================================================
// SIMULATION REPLAY STATE
// Used when the user clicks "Simulate" instead of "Play Ball!"
// ============================================================

/**
 * Whether a simulation replay is currently running.
 * When true, the speed controls are shown and game controls are hidden.
 */
const simulating = ref(false)

/**
 * Array of game state snapshot objects from the backend's simulation.
 * Each snapshot represents the game state after one play (pitch result,
 * at-bat outcome, etc.). The replay timer steps through these one by one
 * to animate the game.
 */
const simSnapshots = ref([])

/**
 * Current index into simSnapshots being displayed.
 * Incremented by the replay timer on each tick.
 * When it reaches simSnapshots.length, the replay stops.
 */
const simReplayIndex = ref(0)

/**
 * Milliseconds between snapshot advances during simulation replay.
 * Controls the "speed" of the simulation animation:
 *   2000 = Slow (2 seconds per play — easy to read)
 *   1000 = Normal (1 second per play — default)
 *   300  = Fast (0.3 seconds per play — quick scan)
 */
const simSpeed = ref(1000)

/**
 * The setInterval timer ID for the simulation replay.
 * Stored so we can clearInterval() when changing speed, stopping, or unmounting.
 */
const simTimer = ref(null)

/** Whether the bullpen selection modal is visible. */
const showBullpen = ref(false)

// ============================================================
// COMPUTED PROPERTIES
// ============================================================

/**
 * All away-era teams except the user's home team — used for the opponent selection grid.
 */
const opponentTeams = computed(() => {
  return awayTeams.value.filter(t => t.id !== teamSelected.value)
})

/**
 * Opponent teams grouped by league (AL, NL, Other).
 * Same grouping logic as TeamSelector's leagues computed, but operating
 * on the filtered opponentTeams list.
 */
const opponentLeagues = computed(() => {
  const teams = opponentTeams.value
  const al = teams.filter(t => t.league === 'AL')
  const nl = teams.filter(t => t.league === 'NL')
  const nlb = teams.filter(t => t.league === 'NLB')
  const other = teams.filter(t => t.league !== 'AL' && t.league !== 'NL' && t.league !== 'NLB')
  const result = []
  if (al.length) result.push({ name: 'AL', label: 'American League', teams: al })
  if (nl.length) result.push({ name: 'NL', label: 'National League', teams: nl })
  if (nlb.length) result.push({ name: 'NLB', label: 'Negro Leagues', teams: nlb })
  if (other.length) result.push({ name: 'other', label: 'Other', teams: other })
  return result
})

const homeTeamName = computed(() => {
  const team = homeTeams.value.find(t => t.id === teamSelected.value)
  return team?.name || 'Your Team'
})

const awayTeamName = computed(() => {
  const team = awayTeams.value.find(t => t.id === selectedOpponentId.value)
  return team?.name || 'Opponent'
})

// ============================================================
// SOUND EFFECTS
// ============================================================

/**
 * Destructure the sound composable to get the auto-play function and mute controls.
 * playForLastPlay is called by the watcher whenever game.last_play changes.
 */
const { playForLastPlay, toggleMute, isMuted } = useSoundEffects()

/**
 * Local reactive ref tracking the mute state for the template's emoji toggle.
 * Kept in sync with the composable's module-level muted flag via onToggleSound().
 */
const soundMuted = ref(false)

/**
 * Toggle sound mute and sync the local ref with the composable's state.
 * The composable uses a module-level variable (not reactive), so we
 * read it back after toggling to update the reactive soundMuted ref.
 */
function onToggleSound() {
  toggleMute()
  soundMuted.value = isMuted()
}

// ============================================================
// STATIC DATA
// ============================================================

/**
 * Pre-configured classic matchups — historical team pairings for quick starts.
 * Each entry has a descriptive label and home/away objects with team ID, name, and season.
 *
 * These matchups are curated to showcase interesting cross-era and rivalry games:
 * - "Crosstown Classic": Chicago White Sox vs Cubs (both from their championship years)
 * - "Murder's Row vs Big Red Machine": two of the greatest teams ever, from different eras
 * - "Curse Breakers": 2004 Red Sox (broke the Bambino curse) vs 2004 Cardinals
 * - etc.
 */
const historicalMatchups = [
  { label: "Babe Ruth's Called Shot", date: 'Oct 1, 1932', stadium: 'Wrigley Field', weather: 'cold', winningPitcher: 'George Pipgras', losingPitcher: 'Charlie Root', home: { id: 112, name: 'Cubs', season: 1932, pitcherId: 121440, pitcherName: 'Charlie Root' }, away: { id: 147, name: 'Yankees', season: 1932, pitcherId: 120593, pitcherName: 'George Pipgras' } },
  { label: "Don Larsen's Perfect Game", date: 'Oct 8, 1956', stadium: 'Yankee Stadium', weather: 'clear', winningPitcher: 'Don Larsen', losingPitcher: 'Sal Maglie', home: { id: 147, name: 'Yankees', season: 1956, pitcherId: 117514, pitcherName: 'Don Larsen' }, away: { id: 119, name: 'Dodgers', season: 1956, pitcherId: 118140, pitcherName: 'Sal Maglie' } },
  { label: "Hank Aaron's 715th Home Run", date: 'Apr 8, 1974', stadium: 'Atlanta-Fulton County Stadium', weather: 'clear', winningPitcher: 'Ron Reed', losingPitcher: 'Al Downing', home: { id: 144, name: 'Braves', season: 1974, pitcherId: 121001, pitcherName: 'Ron Reed' }, away: { id: 119, name: 'Dodgers', season: 1974, pitcherId: 113515, pitcherName: 'Al Downing' } },
  { label: "Mr. October — Reggie's 3HR World Series", date: 'Oct 18, 1977', stadium: 'Yankee Stadium', weather: 'clear', winningPitcher: 'Mike Torrez', losingPitcher: 'Burt Hooton', home: { id: 147, name: 'Yankees', season: 1977, pitcherId: 123416, pitcherName: 'Mike Torrez' }, away: { id: 119, name: 'Dodgers', season: 1977, pitcherId: 116131, pitcherName: 'Burt Hooton' } },
  { label: "Buckner's Demise", date: 'Oct 25, 1986', stadium: 'Shea Stadium', weather: 'cold', winningPitcher: 'Rick Aguilera', losingPitcher: 'Calvin Schiraldi', home: { id: 121, name: 'Mets', season: 1986, pitcherId: 119964, pitcherName: 'Bob Ojeda' }, away: { id: 111, name: 'Red Sox', season: 1986, pitcherId: 112388, pitcherName: 'Roger Clemens' } },
  { label: "McGwire's 62nd Home Run", date: 'Sep 8, 1998', stadium: 'Busch Stadium', weather: 'hot', winningPitcher: 'Kent Mercker', losingPitcher: 'Steve Trachsel', home: { id: 138, name: 'Cardinals', season: 1998, pitcherId: 118967, pitcherName: 'Kent Mercker' }, away: { id: 112, name: 'Cubs', season: 1998, pitcherId: 123431, pitcherName: 'Steve Trachsel' } },
  { label: 'Sammy Sosa Corked Bat Game', date: 'Jun 3, 2003', stadium: 'Wrigley Field', weather: 'wind_out', winningPitcher: 'Mike Remlinger', losingPitcher: 'Al Levine', home: { id: 112, name: 'Cubs', season: 2003, pitcherId: 407578, pitcherName: 'Mark Prior' }, away: { id: 139, name: 'Devil Rays', season: 2003, pitcherId: 114928, pitcherName: 'Geremi Gonzalez' } },
  { label: 'Game 4 World Series Sweep', date: 'Oct 26, 2005', stadium: 'Minute Maid Park', weather: 'dome', winningPitcher: 'Freddy Garcia', losingPitcher: 'Brad Lidge', home: { id: 117, name: 'Astros', season: 2005, pitcherId: 407840, pitcherName: 'Brandon Backe' }, away: { id: 145, name: 'White Sox', season: 2005, pitcherId: 150119, pitcherName: 'Freddy Garcia' } },
  { label: "Buehrle's Perfect Game", date: 'Jul 23, 2009', stadium: 'U.S. Cellular Field', weather: 'hot', winningPitcher: 'Mark Buehrle', losingPitcher: 'Scott Kazmir', home: { id: 145, name: 'White Sox', season: 2009, pitcherId: 279824, pitcherName: 'Mark Buehrle' }, away: { id: 139, name: 'Rays', season: 2009, pitcherId: 431148, pitcherName: 'Scott Kazmir' } },
]

const fantasyMatchups = [
  { label: 'Crosstown Classic', home: { id: 145, name: 'White Sox', season: 2005, pitcherId: 279824, pitcherName: 'Mark Buehrle' }, away: { id: 112, name: 'Cubs', season: 2016, pitcherId: 543294, pitcherName: 'Kyle Hendricks' } },
  { label: "Murder's Row vs Big Red Machine", home: { id: 147, name: 'Yankees', season: 1927, pitcherId: 116241, pitcherName: 'Waite Hoyt' }, away: { id: 113, name: 'Reds', season: 1975, pitcherId: 115239, pitcherName: 'Don Gullett' } },
  { label: 'Curse Breakers', home: { id: 111, name: 'Red Sox', season: 2004, pitcherId: 121811, pitcherName: 'Curt Schilling' }, away: { id: 138, name: 'Cardinals', season: 2004, pitcherId: 452764, pitcherName: 'Chris Carpenter' } },
  { label: 'Dynasty vs 116 Wins', home: { id: 147, name: 'Yankees', season: 1998, pitcherId: 112552, pitcherName: 'David Cone' }, away: { id: 136, name: 'Mariners', season: 2001, pitcherId: 114587, pitcherName: 'Freddy Garcia' } },
  { label: 'Subway Series', home: { id: 147, name: 'Yankees', season: 2000, pitcherId: 112388, pitcherName: 'Roger Clemens' }, away: { id: 121, name: 'Mets', season: 1969, pitcherId: 121961, pitcherName: 'Tom Seaver' } },
  { label: 'Angels in the Outfield', home: { id: 108, name: 'Angels', season: 2002, pitcherId: 132220, pitcherName: 'Jarrod Washburn' }, away: { id: 147, name: 'Yankees', season: 2001, pitcherId: 119608, pitcherName: 'Mike Mussina' } },
  { label: 'Coast to Coast', home: { id: 119, name: 'Dodgers', season: 2020, pitcherId: 621111, pitcherName: 'Walker Buehler' }, away: { id: 117, name: 'Astros', season: 2017, pitcherId: 434378, pitcherName: 'Justin Verlander' } },
  { label: 'Bay Bridge Series', home: { id: 137, name: 'Giants', season: 2010, pitcherId: 453311, pitcherName: 'Tim Lincecum' }, away: { id: 133, name: 'Athletics', season: 1972, pitcherId: 116334, pitcherName: 'Catfish Hunter' } },
  { label: 'Amazin\' vs Magnificent', home: { id: 121, name: 'Mets', season: 1986, pitcherId: 114947, pitcherName: 'Dwight Gooden' }, away: { id: 111, name: 'Red Sox', season: 1986, pitcherId: 112388, pitcherName: 'Roger Clemens' } },
  { label: 'Small Market Royalty', home: { id: 118, name: 'Royals', season: 2015, pitcherId: 450172, pitcherName: 'Edinson Volquez' }, away: { id: 134, name: 'Pirates', season: 1979, pitcherId: 111952, pitcherName: 'John Candelaria' } },
  { label: "Bizarro '69 World Series", home: { id: 158, name: 'Pilots', season: 1969, pitcherId: 111279, pitcherName: 'Jim Bouton' }, away: { id: 121, name: 'Mets', season: 1969, pitcherId: 121961, pitcherName: 'Tom Seaver' } },
  { label: 'Freeway Series', home: { id: 119, name: 'Dodgers', season: 1988, pitcherId: 115861, pitcherName: 'Orel Hershiser' }, away: { id: 108, name: 'Angels', season: 2002, pitcherId: 132220, pitcherName: 'Jarrod Washburn' } },
  { label: 'Braves vs Twins', home: { id: 144, name: 'Braves', season: 1995, pitcherId: 118120, pitcherName: 'Greg Maddux' }, away: { id: 142, name: 'Twins', season: 1991, pitcherId: 119399, pitcherName: 'Jack Morris' } },
]

/**
 * Available pitch types for the pitching controls.
 * Each has a display label and a value string sent to the backend API.
 * The four types represent the core pitch repertoire in baseball.
 */
const pitchTypes = [
  { label: 'Fastball', value: 'fastball' },
  { label: 'Curveball', value: 'curveball' },
  { label: 'Slider', value: 'slider' },
  { label: 'Changeup', value: 'changeup' },
]

// ============================================================
// DERIVED GAME STATE (COMPUTED)
// ============================================================

/**
 * The pitcher currently on the mound.
 *
 * WHY THE CONDITIONAL: In baseball, the home team pitches during the top
 * of the inning (when the away team bats), and vice versa.
 * - is_top = true  -> home_pitcher is on the mound
 * - is_top = false -> away_pitcher is on the mound
 */
const currentPitcher = computed(() => {
  if (!game.value) return null
  return game.value.is_top ? game.value.home_pitcher : game.value.away_pitcher
})

/** Convenience computed for the current pitcher's display name */
const currentPitcherName = computed(() => currentPitcher.value?.name || '')

/**
 * The batter currently at the plate.
 *
 * Looks up the current batter from the appropriate team's lineup array
 * using the current_batter_index from the game state. The lineup is the
 * away lineup when it's the top of the inning, home lineup for the bottom.
 */
const currentBatter = computed(() => {
  if (!game.value) return null
  // Pick the correct lineup based on which half of the inning it is
  const lineup = game.value.is_top ? game.value.away_lineup : game.value.home_lineup
  const idx = game.value.current_batter_index || 0
  return lineup?.[idx] || null
})

/** Pitch count for the current pitcher on the mound. */
const currentPitchCount = computed(() => {
  if (!game.value) return 0
  return game.value.is_top ? game.value.home_pitch_count : game.value.away_pitch_count
})

/** Fatigue bar width percentage (0 at 0 pitches, 100% at 120). */
const fatiguePercent = computed(() => {
  return Math.min(100, (currentPitchCount.value / 120) * 100)
})

/** Fatigue level class for color coding the bar. */
const fatigueLevel = computed(() => {
  const pc = currentPitchCount.value
  if (pc >= 100) return 'gassed'
  if (pc >= 85) return 'tired'
  return 'fresh'
})

/** Team ID of the current pitcher (for team logo badge). */
const currentPitcherTeamId = computed(() =>
  game.value?.is_top ? teamSelected.value : selectedOpponentId.value
)

/** Team ID of the current batter (for team logo badge). */
const currentBatterTeamId = computed(() =>
  game.value?.is_top ? selectedOpponentId.value : teamSelected.value
)

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Construct the URL for a player's headshot photo from MLB's CDN.
 *
 * HOW THE URL WORKS:
 * MLB hosts player headshots at img.mlbstatic.com. The URL format includes:
 * - d_people:generic:headshot:67:current.png — fallback image if the player's photo doesn't exist
 * - w_213,q_auto:best — image width (213px) and auto quality optimization
 * - v1/people/{playerId}/headshot/67/current — the actual player photo path
 *
 * The "67" refers to the image style/size variant. "current" means the
 * most recent photo available (players' photos update each season).
 *
 * @param {number} playerId - The MLB player ID (same ID used in the roster data)
 * @returns {string} Full URL to the player's headshot image
 */
function headshotUrl(playerId) {
  if (!playerId) return ''
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${playerId}/headshot/67/current`
}

/** Build the MLB CDN URL for a team's logo SVG. */
function teamLogoUrl(teamId) {
  if (teamId >= 1000) return '/negro-leagues-logo.svg'
  return `https://www.mlbstatic.com/team-logos/${teamId}.svg`
}

/**
 * Format ip_outs (total outs recorded) into traditional IP display.
 * e.g., 7 outs = "2.1", 9 outs = "3.0", 10 outs = "3.1"
 */
function formatIP(ipOuts) {
  if (ipOuts == null) return '0.0'
  const full = Math.floor(ipOuts / 3)
  const partial = ipOuts % 3
  return `${full}.${partial}`
}

// ============================================================
// SETUP WIZARD NAVIGATION
// ============================================================

/**
 * Handle a classic matchup selection from the step 1 UI.
 *
 * This function pre-fills all team/season selections and jumps directly
 * to step 6, loading BOTH pitcher lists in parallel. This is the fast
 * path that skips steps 2-5 entirely.
 *
 * @param {Object} matchup - Classic matchup config with home/away team data
 */
async function selectClassicMatchup(matchup) {
  classicMode.value = true
  selectedWeather.value = matchup.weather || 'clear'
  teamSelected.value = matchup.home.id
  selectedSeason.value = matchup.home.season
  selectedOpponentId.value = matchup.away.id
  selectedAwaySeason.value = matchup.away.season

  // Jump directly to step 5 (weather + start), loading pitchers along the way
  setupStep.value = 5
  loadingPitchers.value = true
  loadingAwayPitchers.value = true
  selectedPitcherId.value = null
  selectedAwayPitcherId.value = null
  pitcherList.value = []
  awayPitcherList.value = []

  try {
    // Fetch pitcher lists and era-appropriate team lists in parallel
    const [homePitchers, awayPitchers, hTeams, aTeams] = await Promise.all([
      getTeamPitchers(matchup.home.id, matchup.home.season),
      getTeamPitchers(matchup.away.id, matchup.away.season),
      getAllTeams(matchup.home.season),
      getAllTeams(matchup.away.season),
    ])
    homeTeams.value = hTeams
    awayTeams.value = aTeams
    pitcherList.value = homePitchers
    awayPitcherList.value = awayPitchers
    if (matchup.home.pitcherId && homePitchers.some(p => p.id === matchup.home.pitcherId)) {
      selectedPitcherId.value = matchup.home.pitcherId
    } else if (homePitchers.length > 0) {
      selectedPitcherId.value = homePitchers[0].id
    }
    if (matchup.away.pitcherId && awayPitchers.some(p => p.id === matchup.away.pitcherId)) {
      selectedAwayPitcherId.value = matchup.away.pitcherId
    } else if (awayPitchers.length > 0) {
      selectedAwayPitcherId.value = awayPitchers[0].id
    }
  } finally {
    loadingPitchers.value = false
    loadingAwayPitchers.value = false
  }
}

/**
 * Handle team selection from the TeamSelector component.
 * Sets the home team and advances to step 2 (pitcher selection).
 */
function onTeamSelected(teamId) {
  teamSelected.value = teamId
  goToStep(2)
}

/**
 * Navigate to a specific wizard step, fetching any data needed for that step.
 *
 * Steps 3 and 6 require API calls (pitcher lists), so this function handles
 * those fetches before or as the step is displayed. Other steps just set
 * the setupStep value directly.
 *
 * @param {number} step - The step number to navigate to (1-6)
 */
async function goToStep(step) {
  // When entering step 2, fetch the home team's pitchers for the selected season
  if (step === 2) {
    loadingPitchers.value = true
    selectedPitcherId.value = null
    pitcherList.value = []
    setupStep.value = step
    try {
      const pitchers = await getTeamPitchers(teamSelected.value, selectedSeason.value)
      pitcherList.value = pitchers
      if (pitcherList.value.length > 0) {
        selectedPitcherId.value = pitcherList.value[0].id
      }
    } finally {
      loadingPitchers.value = false
    }
    return
  }

  // When entering step 3, fetch away teams for the default away season
  if (step === 3) {
    setupStep.value = step
    if (!awayTeams.value.length) {
      loadingAwayTeams.value = true
      try {
        awayTeams.value = await getAllTeams(selectedAwaySeason.value)
      } finally {
        loadingAwayTeams.value = false
      }
    }
    return
  }

  // When entering step 4, fetch the away team's pitchers for the selected season
  if (step === 4) {
    loadingAwayPitchers.value = true
    selectedAwayPitcherId.value = null
    awayPitcherList.value = []
    setupStep.value = step
    try {
      awayPitcherList.value = await getTeamPitchers(selectedOpponentId.value, selectedAwaySeason.value)
      if (awayPitcherList.value.length > 0) {
        selectedAwayPitcherId.value = awayPitcherList.value[0].id
      }
    } finally {
      loadingAwayPitchers.value = false
    }
    return
  }

  setupStep.value = step
}

/**
 * Navigate backward in the wizard.
 *
 * Special cases:
 * - From classic mode step 6: go all the way back to step 1 (since steps 2-5 were skipped)
 * - From step 2: go to step 1 and clear the team selection
 * - All other steps: go to the previous step number
 */
function goBack() {
  if (classicMode.value && setupStep.value === 5) {
    // Classic mode skipped steps 2-4, so "back" from weather returns to step 1
    classicMode.value = false
    teamSelected.value = null
    setupStep.value = 1
  } else if (setupStep.value === 2) {
    // Going back from step 2 means un-selecting the team
    teamSelected.value = null
    setupStep.value = 1
  } else {
    setupStep.value = setupStep.value - 1
  }
}

// ============================================================
// GAME LIFECYCLE FUNCTIONS
// ============================================================

/**
 * Create a new interactive game via the API and start playing.
 * Sends all the configuration from the setup wizard (teams, seasons, pitchers)
 * to the backend, which returns the initial game state.
 *
 * If called without any team selection (the "Skip" path), createNewGame
 * receives undefined values and the backend assigns random teams.
 */
async function startGame() {
  loading.value = true
  try {
    game.value = await createNewGame({
      homeTeamId: teamSelected.value,
      season: selectedSeason.value,
      homePitcherId: selectedPitcherId.value,
      awayTeamId: selectedOpponentId.value,
      awaySeason: selectedAwaySeason.value,
      awayPitcherId: selectedAwayPitcherId.value,
      weather: selectedWeather.value,
    })
  } finally {
    loading.value = false
  }
}

/**
 * Create a game and immediately simulate the entire thing on the backend.
 *
 * SIMULATION REPLAY MECHANISM:
 * 1. Create the game (same as startGame)
 * 2. Call simulateGame() which runs every at-bat on the backend
 * 3. Backend returns an array of "snapshots" — one game state per play
 * 4. Store snapshots in simSnapshots ref
 * 5. Show the first snapshot as the current game state
 * 6. Start a setInterval timer that advances to the next snapshot each tick
 * 7. When all snapshots have been shown, stop the timer
 *
 * This creates an animated replay of the full game, as if watching
 * the plays happen one by one, but without any network requests during playback.
 */
async function startSimulation() {
  loading.value = true
  try {
    // Step 1: Create the game with the configured teams/pitchers
    const newGame = await createNewGame({
      homeTeamId: teamSelected.value,
      season: selectedSeason.value,
      homePitcherId: selectedPitcherId.value,
      awayTeamId: selectedOpponentId.value,
      awaySeason: selectedAwaySeason.value,
      awayPitcherId: selectedAwayPitcherId.value,
      weather: selectedWeather.value,
    })
    // Step 2: Run the full simulation locally
    const result = simulateGame(newGame)
    // Step 3: Store the snapshot array for replay
    simSnapshots.value = result.snapshots || []
    simReplayIndex.value = 0
    simulating.value = true
    // Step 4: Show the first snapshot merged with the initial game state
    if (simSnapshots.value.length > 0) {
      game.value = { ...newGame, ...simSnapshots.value[0] }
    }
    // Step 5: Start the replay timer
    startReplayTimer()
  } finally {
    loading.value = false
  }
}

/**
 * Start (or restart) the simulation replay timer.
 * First stops any existing timer to avoid duplicate intervals,
 * then creates a new one at the current simSpeed interval.
 *
 * On each tick: advance the replay index and update the game state
 * with the next snapshot. When all snapshots are exhausted, stop.
 */
function startReplayTimer() {
  stopReplayTimer()  // Clear any existing timer first
  simTimer.value = setInterval(() => {
    simReplayIndex.value++
    // Check if we've reached the end of the snapshots
    if (simReplayIndex.value >= simSnapshots.value.length) {
      stopReplayTimer()
      simulating.value = false  // Exit simulation mode
      return
    }
    // Merge the next snapshot into the current game state.
    // Spread operator preserves fields that don't change between snapshots
    // (like team names, lineup arrays, etc.) while updating the ones that do
    // (score, bases, count, play_log, etc.).
    game.value = { ...game.value, ...simSnapshots.value[simReplayIndex.value] }
  }, simSpeed.value)
}

/**
 * Stop the simulation replay timer.
 * Called when: changing speed (before restarting), skipping to end,
 * resetting the game, or when the component unmounts.
 */
function stopReplayTimer() {
  if (simTimer.value) {
    clearInterval(simTimer.value)
    simTimer.value = null
  }
}

/**
 * Change the simulation replay speed.
 * Updates the simSpeed ref and restarts the timer with the new interval.
 *
 * @param {number} ms - Milliseconds between snapshot advances.
 *                      2000 = slow, 1000 = normal, 300 = fast.
 */
function setSimSpeed(ms) {
  simSpeed.value = ms
  // Only restart the timer if a simulation is currently running
  if (simulating.value) {
    startReplayTimer()
  }
}

/**
 * Skip to the end of the simulation replay.
 * Stops the timer and jumps directly to the last snapshot,
 * showing the final game state (game over screen).
 */
function skipToEnd() {
  stopReplayTimer()
  simulating.value = false
  if (simSnapshots.value.length > 0) {
    // Jump to the very last snapshot
    simReplayIndex.value = simSnapshots.value.length - 1
    game.value = { ...game.value, ...simSnapshots.value[simReplayIndex.value] }
  }
}

/**
 * Clean up the replay timer when the component is unmounted.
 * Prevents memory leaks from orphaned setInterval timers
 * if the user navigates away during a simulation.
 */
onUnmounted(() => {
  stopReplayTimer()
})

/**
 * Reset all game and wizard state to return to the initial landing screen.
 * Called from the "New Game" button on the game-over overlay.
 *
 * Resets every single ref to its initial value so the user gets a
 * completely fresh experience without any leftover state from the
 * previous game.
 */
async function resetGame() {
  stopReplayTimer()
  simulating.value = false
  simSnapshots.value = []
  simReplayIndex.value = 0
  classicMode.value = false
  game.value = null
  setupStep.value = 1
  teamSelected.value = null
  selectedSeason.value = 2024
  pitcherList.value = []
  selectedPitcherId.value = null
  selectedOpponentId.value = null
  selectedAwaySeason.value = 2024
  awayPitcherList.value = []
  selectedAwayPitcherId.value = null
  selectedWeather.value = 'clear'
  awayTeams.value = []
  loadingHomeTeams.value = false
  loadingAwayTeams.value = false
  // Re-fetch teams for default season
  homeTeams.value = await getAllTeams(2024)
}

// ============================================================
// GAME ACTION FUNCTIONS
// ============================================================

/**
 * Send a pitch to the backend (used when the player is pitching).
 * Updates the game state with the pitch outcome (ball, strike, hit, etc.).
 *
 * @param {string} pitchType - One of 'fastball', 'curveball', 'slider', 'changeup'
 */
function doPitch(pitchType) {
  processPitch(game.value, pitchType)
  game.value = { ...game.value }
}

/**
 * Send a batting action to the backend (used when the player is batting).
 * Updates the game state with the at-bat outcome.
 *
 * @param {string} action - Either 'swing' (attempt to hit) or 'take' (let pitch pass)
 */
function doBat(action) {
  processAtBat(game.value, action)
  game.value = { ...game.value }
}

/**
 * Handle the user selecting a relief pitcher from the bullpen modal.
 */
function doSwitchPitcher(reliever) {
  const idx = game.value.home_bullpen.findIndex((p) => p.id === reliever.id)
  if (idx !== -1) game.value.home_bullpen.splice(idx, 1)
  switchPitcher(game.value, 'home', reliever)
  showBullpen.value = false
  game.value = { ...game.value }
}

// ============================================================
// WATCHERS
// ============================================================

/**
 * Watch for changes to game.last_play and play the appropriate sound effect.
 *
 * WHY A WATCHER: The game state is updated as a whole object from the API,
 * so we watch the specific last_play field to detect when a new play happens.
 * The old/new comparison prevents replaying the same sound on unrelated
 * game state updates.
 *
 * The playForLastPlay function (from useSoundEffects) does keyword matching
 * on the play description to pick the right sound (crack, cheer, buzz, etc.).
 */
watch(
  () => game.value?.last_play,
  (newPlay, oldPlay) => {
    if (newPlay && newPlay !== oldPlay) {
      playForLastPlay(newPlay)
    }
  }
)

// When home season changes (step 1), re-fetch era-appropriate teams
watch(selectedSeason, async (newSeason) => {
  if (setupStep.value !== 1) return
  loadingHomeTeams.value = true
  try {
    homeTeams.value = await getAllTeams(newSeason)
  } finally {
    loadingHomeTeams.value = false
  }
})

// When away season changes (step 3), re-fetch era-appropriate opponent teams
watch(selectedAwaySeason, async (newSeason) => {
  if (setupStep.value !== 3) return
  loadingAwayTeams.value = true
  selectedOpponentId.value = null // Clear selection since team list is changing
  try {
    awayTeams.value = await getAllTeams(newSeason)
  } finally {
    loadingAwayTeams.value = false
  }
})

// Fetch teams for the default season on mount
onMounted(async () => {
  homeTeams.value = await getAllTeams(selectedSeason.value)
})

</script>

<style scoped>
/* ========== Root Container ========== */
/* position: relative is needed so the game-over overlay can use position: absolute
   to cover the entire game area */
.interactive-game {
  position: relative;
}

/* ========== Title / Landing Screen ========== */
/* Main heading on the step 1 landing page, styled in the app's accent red */
.game-title {
  text-align: center;
  font-size: 32px;
  color: #e94560;
  margin-bottom: 4px;
}

/* Large baseball emoji used as decorative hero art on the landing page */
.title-art {
  font-size: 72px;
  margin-bottom: 16px;
  text-align: center;
}

/* ========== Season Select Dropdown ========== */
/* Container for the season year dropdown used in steps 2 and 5 */
.season-select {
  text-align: center;
  margin-top: 16px;
}

/* Label text next to the season dropdown (subdued gray) */
.season-select label {
  color: #aaa;
  font-size: 14px;
  margin-right: 8px;
}

/* The dropdown itself — dark blue background to match the app theme */
.season-select select {
  background: #3a3a4a;
  color: #e0e0e0;
  border: 1px solid #555;
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 14px;
  cursor: pointer;
}

/* Red border highlight on hover for the season dropdown */
.season-select select:hover {
  border-color: #e94560;
}

/* ========== Season Hero (Step 1) ========== */
.season-hero {
  text-align: center;
  padding: 28px 20px 20px;
  margin-bottom: 12px;
  background: linear-gradient(180deg, #1a1a2e 0%, transparent 100%);
  border-bottom: 1px solid #333;
}

.season-hero-title {
  font-size: 28px;
  color: #ffdd00;
  margin: 0 0 4px 0;
  letter-spacing: 1px;
}

.season-hero-sub {
  font-size: 14px;
  color: #aaa;
  margin: 0 0 16px 0;
}

.season-hero-dropdown {
  background: #0f3460;
  color: #ffdd00;
  border: 2px solid #ffdd00;
  border-radius: 8px;
  padding: 12px 24px;
  font-size: 24px;
  font-weight: bold;
  font-family: 'Courier New', monospace;
  cursor: pointer;
  min-width: 160px;
  text-align: center;
  transition: all 0.2s;
}

.season-hero-dropdown:hover {
  background: #1a4a7a;
  border-color: #e94560;
  color: #fff;
}

.season-hero-loading {
  display: block;
  color: #888;
  font-size: 13px;
  margin-top: 8px;
}

/* ========== Skip Button ========== */
/* Container for the "Skip — Play without teams" button */
.skip-select {
  text-align: center;
  margin-top: 16px;
}

/* Skip button: subtle/ghost style since it's a secondary action */
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

/* Skip button hover: becomes more visible to confirm interactivity */
.skip-btn:hover {
  border-color: #e94560;
  color: #e0e0e0;
}

/* ========== Start Screen (Steps 2-6) ========== */
/* Common container for all wizard steps after step 1.
   Generous padding creates visual breathing room for the form elements. */
.start-screen {
  text-align: center;
  padding: 60px 20px;
}

/* Heading within wizard steps */
.start-screen h2 {
  font-size: 32px;
  color: #e94560;
  margin-bottom: 12px;
}

/* Instructional text within wizard steps */
.start-screen p {
  color: #aaa;
  margin-bottom: 24px;
}

/* ========== Step Header (Back button + Step Label) ========== */
/* Flex row containing the back button and current step description */
.step-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-bottom: 20px;
}

/* Step label text (e.g., "Your Team: Yankees") — yellow for emphasis */
.step-label {
  color: #ffdd00;
  font-size: 16px;
  margin: 0;
}

/* Back navigation button — ghost style with arrow character */
.back-btn {
  background: none;
  border: 1px solid #555;
  color: #aaa;
  padding: 6px 14px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

/* Back button hover: red border to match app accent */
.back-btn:hover {
  border-color: #e94560;
  color: #e0e0e0;
}

/* Bottom margin on the season dropdown when used in the pre-game wizard */
.pregame-season {
  margin-bottom: 20px;
}

/* Larger version of the season dropdown for the wizard steps */
.season-dropdown {
  background: #3a3a4a;
  color: #e0e0e0;
  border: 1px solid #555;
  border-radius: 6px;
  padding: 8px 14px;
  font-size: 16px;
  cursor: pointer;
  min-width: 120px;
}

/* Red border on hover for the season dropdown */
.season-dropdown:hover {
  border-color: #e94560;
}

/* ========== Opponent Selection (Step 4) ========== */
/* Scrollable container for the opponent team grid — same scroll pattern as TeamSelector */
.opponent-leagues {
  max-height: 400px;
  overflow-y: auto;
  padding: 4px;
}

/* Spacing between AL and NL sections in the opponent grid */
.opponent-league-section {
  margin-bottom: 16px;
}

/* League header for opponent sections (same style as TeamSelector) */
.league-header {
  color: #ffdd00;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 2px;
  margin-bottom: 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid #333;
}

/* Responsive grid for opponent team cards */
.opponent-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
}

/* Individual opponent team card — same visual style as TeamSelector cards */
.opponent-card {
  background: #3a3a4a;
  border: 2px solid #555;
  border-radius: 8px;
  padding: 14px 8px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
}

/* Hover state: red border + slight lift */
.opponent-card:hover {
  border-color: #e94560;
  background: #4a4a5a;
  transform: translateY(-2px);
}

/* Selected state: persistent red border + darker background (no lift needed) */
.opponent-card.selected {
  border-color: #e94560;
  background: #4a4a5a;
}

/* Opponent team abbreviation — yellow monospace to match team card style */
.opponent-logo {
  width: 36px;
  height: 36px;
  object-fit: contain;
  margin-bottom: 4px;
}

.opponent-abbr {
  font-size: 22px;
  font-weight: bold;
  color: #ffdd00;
  font-family: 'Courier New', monospace;
  margin-bottom: 4px;
}

/* Opponent team full name */
.opponent-name {
  font-size: 12px;
  color: #ccc;
  line-height: 1.2;
}

/* ========== Pitcher Selection (Steps 3 & 6) ========== */
/* Loading state message for pitcher API calls */
.pitcher-loading {
  color: #888;
  text-align: center;
  margin: 20px 0;
}

/* Container for the pitcher list with bottom margin before the Next button */
.pitcher-selection {
  margin-bottom: 24px;
}

/* Scrollable vertical list of pitcher buttons */
.pitcher-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 280px;
  overflow-y: auto;
  padding: 4px;
}

/* Individual pitcher button — shows name and stats side by side */
.pitcher-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #3a3a4a;
  border: 2px solid #333;
  border-radius: 6px;
  padding: 10px 16px;
  color: #e0e0e0;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
  font-size: 14px;
}

/* Pitcher button hover: red border feedback */
.pitcher-option:hover {
  border-color: #e94560;
}

/* Selected pitcher: persistent red border + slightly different background */
.pitcher-option.selected {
  border-color: #e94560;
  background: #4a4a5a;
}

/* Pitcher name — bold for readability */
.pitcher-opt-name {
  font-weight: bold;
}

/* Pitcher stats (ERA, K/9) — smaller and gray to be secondary to the name */
.pitcher-opt-stats {
  font-size: 12px;
  color: #888;
}

/* ========== Play Ball / Action Buttons ========== */
/* Primary action button used for "Next", "Play Ball!", and "New Game" */
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

/* Lighter red on hover for the primary button */
.play-btn:hover:not(:disabled) {
  background: #ff6b81;
}

/* Disabled state: reduced opacity and not-allowed cursor */
.play-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ========== Field Layout with Player Headshots ========== */
/*
  Horizontal flex layout: [Pitcher Card] [Diamond SVG] [Batter Card]
  This creates the classic pitcher-vs-batter visual that frames the diamond.
  gap: 12px provides spacing between the three elements.
*/
.field-layout {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin: 8px 0;
}

/* Player card container (used for both pitcher and batter) */
.player-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100px;
  min-height: 120px;
}

/*
  Player headshot image — circular crop with a themed border.
  object-fit: cover ensures the face fills the circle without distortion.
  Background color prevents a flash of white while the image loads.
*/
.player-headshot {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  border: 2px solid #333;
  object-fit: cover;
  background: #3a3a4a;
}

/* Pitcher headshot border: red to match the app's "danger/power" color for pitchers */
.pitcher-side .player-headshot {
  border-color: #e94560;
}

/* Batter headshot border: yellow to match the app's "highlight/action" color for batters */
.batter-side .player-headshot {
  border-color: #ffdd00;
}

/* Info section below the headshot (role label + player name) */
.player-card-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 6px;
}

/* Role label (e.g., "PITCHING", "AT BAT") — tiny uppercase text */
.player-card-label {
  font-size: 9px;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 1px;
}

/* Player name — bold and centered below the role label */
.player-card-name {
  font-size: 11px;
  font-weight: bold;
  text-align: center;
  line-height: 1.2;
  margin-top: 2px;
}

/* Pitcher name in red to match the pitcher-side theme */
.player-card-name.pitcher-name {
  color: #e94560;
}

/* Batter name in yellow to match the batter-side theme */
.player-card-name.batter-name-text {
  color: #ffdd00;
}

/* ========== Game Over Overlay ========== */
/*
  Full-coverage dark overlay that sits on top of all game content.
  position: absolute + all edges at 0 makes it cover the entire
  .interactive-game container. z-index: 10 ensures it's above everything.
  The 85% opacity darkens the game behind it while keeping it slightly visible.
*/
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

/* Card containing the game-over content, centered within the overlay */
.game-over-card {
  text-align: center;
  padding: 40px;
}

/* "Game Over!" heading */
.game-over-card h2 {
  font-size: 36px;
  color: #e94560;
  margin-bottom: 20px;
}

/* Horizontal layout for the final score display: AWAY - vs - HOME */
.final-score {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
  margin-bottom: 16px;
}

/* Individual team column in the final score (label above, score below) */
.final-team {
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* Team name label in the final score */
.final-team .label {
  font-size: 12px;
  color: #888;
  text-transform: uppercase;
}

/* Large score number in the final score display — yellow monospace for scoreboard feel */
.final-team .score {
  font-size: 48px;
  font-weight: bold;
  color: #ffdd00;
  font-family: 'Courier New', monospace;
}

/* Dash separator between the two teams' scores */
.vs {
  font-size: 24px;
  color: #666;
}

/* Win/Lose result text — green color (always says "You Win!" or "You Lose!") */
.result-text {
  font-size: 24px;
  font-weight: bold;
  color: #4caf50;
  margin-bottom: 24px;
}

/* ========== Last Play Banner ========== */
/*
  Highlighted banner showing the most recent play description.
  Yellow text on dark blue with a red border makes it stand out
  as the most important piece of real-time information.
*/
.last-play {
  background: #3a3a4a;
  border: 1px solid #e94560;
  border-radius: 6px;
  padding: 10px 16px;
  margin: 12px 0;
  text-align: center;
  font-size: 15px;
  color: #ffdd00;
  font-weight: 500;
}

/* ========== Interactive Controls (Pitch/Bat Buttons) ========== */
/* Container with vertical margin around the control buttons */
.controls {
  margin: 16px 0;
}

/* Instructional label above the control buttons (e.g., "You're Pitching") */
.mode-label {
  text-align: center;
  font-size: 14px;
  color: #aaa;
  margin-bottom: 10px;
  text-transform: uppercase;
  letter-spacing: 1px;
}

/* Horizontal row of action buttons with wrapping for small screens */
.button-group {
  display: flex;
  gap: 10px;
  justify-content: center;
  flex-wrap: wrap;
}

/* Base style for all action buttons (pitch types, swing, take, speed) */
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

/* Disabled action buttons: reduced opacity and blocked cursor */
.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Pitch type buttons — dark background with red border (ghost style) */
.pitch-btn {
  background: #3a3a4a;
  color: #e0e0e0;
  border-color: #e94560;
}

/* Pitch button hover: fills with red to confirm the selection */
.pitch-btn:hover:not(:disabled) {
  background: #e94560;
  color: white;
}

/* Swing button — solid red, the primary batting action */
.swing-btn {
  background: #e94560;
  color: white;
  border-color: #e94560;
  min-width: 140px;
}

/* Swing button hover: lighter red */
.swing-btn:hover:not(:disabled) {
  background: #ff6b81;
}

/* Take button — green border/text to contrast with the red swing button.
   Green = passive/safe (letting the pitch go by) vs red = aggressive (swinging). */
.take-btn {
  background: #3a3a4a;
  color: #4caf50;
  border-color: #4caf50;
  min-width: 140px;
}

/* Take button hover: fills with green */
.take-btn:hover:not(:disabled) {
  background: #4caf50;
  color: white;
}

/* ========== Box Score ========== */
.box-score-section {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.box-team {
  background: #0f0f23;
  border: 1px solid #333;
  border-radius: 6px;
  padding: 10px;
  overflow-x: auto;
}

.box-team-header {
  font-size: 13px;
  color: #ffdd00;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin: 0 0 8px 0;
}

.box-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  font-family: 'Courier New', monospace;
}

.box-table th {
  color: #888;
  font-size: 11px;
  text-transform: uppercase;
  padding: 4px 6px;
  border-bottom: 1px solid #333;
  text-align: center;
}

.box-table td {
  padding: 4px 6px;
  color: #ccc;
  text-align: center;
  border-bottom: 1px solid #1a1a2e;
}

.box-table th.box-name,
.box-table td.box-name {
  text-align: left;
  min-width: 120px;
  white-space: nowrap;
}

.box-table tr.active-batter {
  background: rgba(233, 69, 96, 0.15);
}

.box-table tr.active-batter td {
  color: #ffdd00;
  font-weight: bold;
}

/* ========== Simulation Controls ========== */
/* Container for the "Play Ball!" and "Simulate" buttons side by side */
.start-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
  margin-top: 32px;
}

/*
  Simulate button — darker background than "Play Ball!" to visually
  communicate that it's a secondary/alternative action.
  Red border keeps it connected to the app's color scheme.
*/
.simulate-btn {
  background: #0f3460;
  border: 2px solid #e94560;
}

/* Simulate button hover: slightly lighter blue */
.simulate-btn:hover:not(:disabled) {
  background: #1a4a7a;
}

/* Margin around the simulation speed controls during replay */
.sim-controls {
  margin: 16px 0;
}

/* Speed control buttons — smaller than action buttons, neutral gray */
.speed-btn {
  background: #3a3a4a;
  color: #e0e0e0;
  border-color: #555;
  min-width: 80px;
  padding: 8px 16px;
  font-size: 14px;
}

/* Active speed button: filled red to indicate which speed is currently selected */
.speed-btn.active {
  border-color: #e94560;
  background: #e94560;
  color: white;
}

/* Speed button hover: red border feedback */
.speed-btn:hover:not(:disabled) {
  border-color: #e94560;
}

/* "Skip to End" button — yellow border/text to differentiate from speed buttons.
   Yellow = caution/attention, appropriate for an action that skips content. */
.speed-btn.skip {
  border-color: #ffdd00;
  color: #ffdd00;
}

/* Skip button hover: fills with yellow, text goes dark for contrast */
.speed-btn.skip:hover:not(:disabled) {
  background: #ffdd00;
  color: #0a0a1a;
}

/* ========== Sound Toggle ========== */
/*
  Positioned absolutely in the top-right corner of the game container.
  z-index: 5 keeps it above normal game content but below the game-over
  overlay (z-index: 10), so it's hidden when the game ends.
*/
.sound-toggle {
  position: absolute;
  top: 8px;
  right: 8px;
  background: none;
  border: 1px solid #555;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 18px;
  cursor: pointer;
  z-index: 5;
  transition: border-color 0.2s;
}

/* Sound toggle hover: red border to confirm interactivity */
.sound-toggle:hover {
  border-color: #e94560;
}

/* ========== Classic Matchups Section ========== */
/* Container for the classic matchups grid on step 1.
   Top border separates it from the team selector above. */
.classic-matchups {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid #333;
}

/* "Classic Matchups" heading — yellow uppercase to match league headers */
.classic-header {
  color: #ffdd00;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 2px;
  text-align: center;
  margin-bottom: 12px;
}

/*
  Responsive grid for matchup cards — min 200px wide per card.
  Wider than team cards because matchup labels are longer text.
  max-height + overflow prevents the matchup list from pushing the
  page too far down (scrollable if there are many matchups).
*/
.matchup-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;
  max-height: 260px;
  overflow-y: auto;
  padding: 4px;
}

/* Individual matchup card — left-aligned text for readability of longer labels */
.matchup-card {
  background: #ffffff;
  border: 2px solid #555;
  border-radius: 8px;
  padding: 12px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
  color: #222;
}

/* Matchup card hover: red border + subtle lift */
.matchup-card:hover {
  border-color: #e94560;
  background: #f0f0f0;
  transform: translateY(-1px);
}

/* Matchup name label (e.g., "Crosstown Classic") — red for emphasis */
.matchup-logos {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.matchup-logo {
  width: 28px;
  height: 28px;
  object-fit: contain;
}

.matchup-vs {
  font-size: 11px;
  color: #999;
  text-transform: uppercase;
}

.matchup-label {
  font-size: 13px;
  font-weight: bold;
  color: #e94560;
  margin-bottom: 4px;
}

/* Matchup date and stadium for historical games */
.matchup-date {
  font-size: 11px;
  color: #666;
  margin-bottom: 2px;
}

/* Matchup teams description (e.g., "2005 White Sox vs 2016 Cubs") — gray secondary text */
.matchup-teams {
  font-size: 12px;
  color: #555;
}

/* Starting pitcher names on matchup cards */
.matchup-pitchers {
  font-size: 11px;
  color: #c0392b;
  margin-top: 2px;
}

.matchup-decision {
  font-size: 10px;
  color: #666;
  margin-top: 3px;
}

.decision-w {
  color: #4caf50;
}

.decision-l {
  color: #ef5350;
}

/* ========== Headshot Wrapper + Team Badge ========== */
.headshot-wrapper {
  position: relative;
  display: inline-block;
}

.player-team-badge {
  position: absolute;
  bottom: -2px;
  right: -2px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid #1a1a2e;
  background: #1a1a2e;
}

/* ========== Fatigue Meter ========== */
.fatigue-meter {
  width: 100%;
  margin-top: 4px;
  text-align: center;
}

.pitch-count {
  font-size: 10px;
  color: #aaa;
}

.fatigue-bar {
  width: 100%;
  height: 4px;
  background: #333;
  border-radius: 2px;
  margin-top: 2px;
  overflow: hidden;
}

.fatigue-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s, background 0.3s;
}

.fatigue-fill.fresh {
  background: #4caf50;
}

.fatigue-fill.tired {
  background: #ff9800;
}

.fatigue-fill.gassed {
  background: #e94560;
}

/* ========== Bullpen Controls ========== */
.bullpen-controls {
  margin-top: 10px;
  text-align: center;
}

.change-pitcher-btn {
  background: #3a3a4a;
  color: #ff9800;
  border: 1px solid #ff9800;
  padding: 6px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.change-pitcher-btn:hover {
  background: #ff9800;
  color: #0a0a1a;
}

.bullpen-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20;
}

.bullpen-modal {
  background: #1a1a2e;
  border: 1px solid #333;
  border-radius: 10px;
  padding: 20px;
  min-width: 280px;
  max-width: 400px;
  max-height: 80vh;
  overflow-y: auto;
}

.bullpen-title {
  color: #ff9800;
  font-size: 16px;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin: 0 0 12px 0;
  text-align: center;
}

.bullpen-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.bullpen-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #3a3a4a;
  border: 2px solid #333;
  border-radius: 6px;
  padding: 10px 14px;
  color: #e0e0e0;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
  font-size: 14px;
}

.bullpen-option:hover {
  border-color: #ff9800;
  background: #4a4a5a;
}

.bullpen-name {
  font-weight: bold;
}

.bullpen-stats {
  font-size: 12px;
  color: #888;
}

.bullpen-cancel {
  display: block;
  margin: 12px auto 0;
  background: none;
  border: 1px solid #555;
  color: #aaa;
  padding: 6px 20px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}

.bullpen-cancel:hover {
  border-color: #e94560;
  color: #e0e0e0;
}

/* ========== Mobile Responsive ========== */
@media (max-width: 600px) {
  /* Tighter padding on wizard screens */
  .start-screen {
    padding: 30px 10px;
  }

  /* Stack field layout vertically: pitcher on top, diamond, batter below */
  .field-layout {
    flex-direction: column;
    gap: 4px;
  }

  .player-card {
    flex-direction: row;
    width: auto;
    min-height: auto;
    gap: 8px;
  }

  .player-headshot {
    width: 48px;
    height: 48px;
  }

  .player-card-info {
    margin-top: 0;
    align-items: flex-start;
  }

  /* Smaller action buttons on mobile */
  .action-btn {
    padding: 10px 16px;
    font-size: 14px;
    min-width: 80px;
  }

  .swing-btn,
  .take-btn {
    min-width: 110px;
  }

  .play-btn {
    padding: 12px 28px;
    font-size: 17px;
  }

  /* Box score: compact for small screens */
  .box-team {
    padding: 6px;
  }

  .box-table {
    font-size: 11px;
  }

  .box-table th {
    font-size: 9px;
    padding: 3px 3px;
  }

  .box-table td {
    padding: 3px 3px;
  }

  .box-table th.box-name,
  .box-table td.box-name {
    min-width: 0;
    max-width: 90px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Opponent grid: fewer columns on small screens */
  .opponent-grid {
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: 6px;
  }

  .opponent-card {
    padding: 8px 4px;
  }

  /* Matchup grid: single column on small screens */
  .matchup-grid {
    grid-template-columns: 1fr;
  }

  /* Speed buttons: smaller */
  .speed-btn {
    min-width: 60px;
    padding: 6px 10px;
    font-size: 12px;
  }

  /* Last play banner: smaller text */
  .last-play {
    font-size: 13px;
    padding: 8px 10px;
  }

  .weather-grid {
    grid-template-columns: repeat(3, 1fr);
  }

  .weather-card {
    padding: 6px 4px;
  }

  .weather-icon {
    font-size: 18px;
  }
}

/* ========== Weather Picker (Step 5) ========== */
.weather-selection {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 32px auto 40px;
  padding: 0 16px;
}

.weather-selection p {
  margin-bottom: 16px;
  font-weight: bold;
  color: #ccc;
  font-size: 15px;
}

.weather-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  max-width: 640px;
  width: 100%;
}

.weather-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 14px 8px;
  background: #1a1a2e;
  border: 2px solid #333;
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
  color: #ccc;
}

.weather-card:hover {
  border-color: #666;
  background: #222244;
}

.weather-card.selected {
  border-color: #e94560;
  background: #2a1a2e;
}

.weather-icon {
  font-size: 24px;
}

.weather-label {
  font-size: 13px;
  font-weight: bold;
  color: #eee;
}

.weather-detail {
  font-size: 11px;
  color: #999;
  text-align: center;
}

/* ========== Weather Banner (Active Game) ========== */
.weather-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 4px 12px;
  background: #1a1a2e;
  border-radius: 6px;
  margin-bottom: 8px;
  font-size: 13px;
  color: #ccc;
}

.weather-banner-icon {
  font-size: 16px;
}

.weather-banner-text {
  font-size: 13px;
}
</style>
