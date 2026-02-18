<template>
  <!--
    InteractiveGame — the main game component that orchestrates the entire experience.

    This component serves two purposes:
    1. A 5-step setup wizard (steps 1-5) where players configure their matchup
    2. The live game UI with scoreboard, diamond, controls, and play log

    The `setupStep` ref drives which step is shown. Once a game is created
    (game ref is non-null), the setup wizard hides and the game UI appears.

    ╔══════════════════════════════════════════════════════════════════╗
    ║                  FREE vs PREMIUM FEATURES                       ║
    ╠══════════════════════════════════════════════════════════════════╣
    ║  FEATURE                    │  FREE           │  PREMIUM        ║
    ║  ─────────────────────────  │  ──────────     │  ──────────     ║
    ║  Season range               │  2000-2025      │  1900-2025      ║
    ║  Historic matchups          │  6 games        │  15 games       ║
    ║  Fantasy matchups           │  6 games        │  15 games       ║
    ║  Opponent season selection  │  Locked to home │  Any season     ║
    ║  Time of day picker         │  Hidden         │  Visible        ║
    ║  ─────────────────────────  │  ──────────     │  ──────────     ║
    ║  ALL in-game mechanics      │  Full access    │  Full access    ║
    ║  (pitching, batting, steals,│                 │                 ║
    ║   double plays, bullpen,    │                 │                 ║
    ║   weather effects, etc.)    │                 │                 ║
    ╚══════════════════════════════════════════════════════════════════╝

    Premium is unlocked via a code entered in any of the upgrade CTA sections.
    The unlock state is persisted in localStorage('premiumUnlocked').
  -->
  <div class="interactive-game" :class="{ 'ellis-melting': ellisMelting, 'ellis-fade-in': ellisFadeIn }">
    <!--
      ==================== STEP 1: PICK SEASON + TEAM ====================
      The landing screen with three paths forward:
      1. Pick a season, then click a team in the grid (advances to step 2)
      2. Click a Classic Matchup button (jumps to step 4 with pre-filled teams)
      3. Click "Skip" to start with random teams (creates game immediately)

      Shown when: no game exists AND we're on step 1
    -->
    <div v-if="!game && setupStep === 1">
      <!-- Mode picker: three paths forward -->
      <div v-if="!gameMode" class="mode-picker">
        <div class="mode-picker-grid">
          <button class="mode-card" @click="gameMode = 'season'">
            <span class="mode-icon">&#9918;</span>
            <span class="mode-label">Pick a Season</span>
            <span class="mode-desc">Choose an era and build your matchup</span>
          </button>
          <button class="mode-card" @click="gameMode = 'historic'">
            <span class="mode-icon">&#127942;</span>
            <span class="mode-label">Historic Games</span>
            <span class="mode-desc">Replay legendary real-world matchups</span>
          </button>
          <button class="mode-card" @click="gameMode = 'fantasy'">
            <span class="mode-icon">&#9889;</span>
            <span class="mode-label">Fantasy Matchups</span>
            <span class="mode-desc">Dream matchups across eras</span>
          </button>
        </div>
      </div>

      <!-- SEASON MODE: pick era + season + team -->
      <div v-if="gameMode === 'season'">
        <div class="season-hero">
          <h2 class="season-hero-title">Pick a Season</h2>
          <div class="era-grid">
            <div v-for="era in availableEras" :key="era.label" class="era-card"
                 :class="{ selected: selectedEra.label === era.label }">
              <span class="era-label">{{ era.label }}</span>
              <select
                class="era-select"
                :value="selectedEra.label === era.label ? selectedSeason : ''"
                @change="selectEra(era); selectedSeason = Number($event.target.value)"
              >
                <option value="" disabled>{{ era.start }}–{{ era.end }}</option>
                <option v-for="y in (era.end - era.start + 1)" :key="era.end - y + 1" :value="era.end - y + 1">
                  {{ era.end - y + 1 }}
                </option>
              </select>
            </div>
          </div>
          <span v-if="loadingHomeTeams" class="season-hero-loading">Loading teams...</span>
        </div>
        <p class="selected-year-label">{{ selectedSeason }}</p>
        <TeamSelector :teams="homeTeams" @teamSelected="onTeamSelected" />
        <!-- PREMIUM GATE: Era upgrade CTA -->
        <div v-if="!premiumUnlocked" class="unlock-section">
          <a href="https://baldmike.gumroad.com/l/basebald" target="_blank" rel="noopener" class="unlock-btn">
            Upgrade to Premium to unlock all eras back to 1900! — Just $3!
          </a>
          <div class="unlock-code-row">
            <input
              v-model="unlockCode"
              type="text"
              placeholder="Enter Code to Unlock Premium"
              class="unlock-input"
              @keyup.enter="tryUnlock"
            />
            <button class="unlock-submit" @click="tryUnlock">Unlock</button>
          </div>
          <p v-if="unlockError" class="unlock-error">Invalid code. Please try again.</p>
        </div>
      </div>

      <!-- HISTORIC MODE: classic historical matchups -->
      <div v-if="gameMode === 'historic'">
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
              <div class="matchup-label">
                <a v-if="m.article" :href="m.article" target="_blank" rel="noopener" class="matchup-wiki" @click.stop>{{ m.label }}</a>
                <template v-else>{{ m.label }}</template>
              </div>
              <div class="matchup-subtitle" v-if="m.subtitle">{{ m.subtitle }}</div>
              <div class="matchup-date">{{ m.date }} — {{ m.stadium }}</div>
              <div class="matchup-teams">{{ m.away.name }} @ {{ m.home.name }}</div>
              <div class="matchup-pitchers">{{ m.away.pitcherName }} vs {{ m.home.pitcherName }}</div>
              <div class="matchup-decision"><span class="decision-w">W: {{ m.winningPitcher }}</span> · <span class="decision-l">L: {{ m.losingPitcher }}</span></div>
            </button>
          </div>
          <!-- PREMIUM GATE: Historic matchups upgrade CTA (free: 6 games, premium: 15 games) -->
          <div v-if="!premiumUnlocked" class="unlock-section">
            <a href="https://baldmike.gumroad.com/l/basebald" target="_blank" rel="noopener" class="unlock-btn">
              Unlock 9 more Historic and 9 more Fantasy Games — Only $3!
            </a>
            <div class="unlock-code-row">
              <input
                v-model="unlockCode"
                type="text"
                placeholder="Enter Code to Unlock Premium"
                class="unlock-input"
                @keyup.enter="tryUnlock"
              />
              <button class="unlock-submit" @click="tryUnlock">Unlock</button>
            </div>
            <p v-if="unlockError" class="unlock-error">Invalid code. Please try again.</p>
          </div>
        </div>
      </div>

      <!-- FANTASY MODE: fantasy matchups -->
      <div v-if="gameMode === 'fantasy'">
        <div class="classic-matchups">
          <h3 class="classic-header">Fantasy Matchups</h3>
          <div class="matchup-grid">
            <button
              v-for="(m, i) in fantasyMatchups"
              :key="'f' + i"
              class="matchup-card"
              @click="selectClassicMatchup(m)"
            >
              <span class="matchup-number">#{{ i + 1 }}</span>
              <div class="matchup-logos">
                <img :src="teamLogoUrl(m.away.id)" class="matchup-logo" />
                <span class="matchup-vs">vs</span>
                <img :src="teamLogoUrl(m.home.id)" class="matchup-logo" />
              </div>
              <div class="matchup-label">{{ m.label }}</div>
              <div class="matchup-subtitle" v-if="m.subtitle">{{ m.subtitle }}</div>
              <div class="matchup-teams">{{ m.away.season }} {{ m.away.name }} vs {{ m.home.season }} {{ m.home.name }}</div>
              <div class="matchup-pitchers">{{ m.away.pitcherName }} vs {{ m.home.pitcherName }}</div>
            </button>
          </div>
          <!-- PREMIUM GATE: Fantasy matchups upgrade CTA (free: 6 games, premium: 15 games) -->
          <div v-if="!premiumUnlocked" class="unlock-section">
            <a href="https://baldmike.gumroad.com/l/basebald" target="_blank" rel="noopener" class="unlock-btn">
              Unlock 9 more Historic and 9 more Fantasy Games — Only $3!
            </a>
            <div class="unlock-code-row">
              <input
                v-model="unlockCode"
                type="text"
                placeholder="Enter Code to Unlock Premium"
                class="unlock-input"
                @keyup.enter="tryUnlock"
              />
              <button class="unlock-submit" @click="tryUnlock">Unlock</button>
            </div>
            <p v-if="unlockError" class="unlock-error">Invalid code. Please try again.</p>
          </div>
        </div>
      </div>
    </div>

    <!--
      ==================== STEP 2: PICK YOUR PITCHER ====================
      Shows the list of pitchers from the selected team+season roster.
      Pitchers are fetched from the API when entering this step.
    -->
    <div v-if="!game && setupStep === 2" class="start-screen">
      <div class="step-header">
        <h3 class="step-label">{{ homeTeamName }} ({{ selectedSeason }})</h3>
      </div>

      <div v-if="loadingPitchers" class="pitcher-loading">Loading pitchers...</div>

      <div v-else-if="starterList.length > 0" class="pitcher-selection">
        <p>Choose your starting pitcher:</p>
        <div class="pitcher-list">
          <button
            v-for="p in starterList"
            :key="p.id"
            class="pitcher-option"
            :class="{ selected: selectedPitcherId === p.id }"
            @click="selectedPitcherId = p.id; goToStep(3)"
          >
            <span class="pitcher-opt-name">{{ p.name }} <span class="pitcher-role-tag">{{ p.role || 'P' }}</span></span>
            <span class="pitcher-opt-stats">ERA {{ p.stats.era.toFixed(2) }} | K/9 {{ p.stats.k_per_9.toFixed(1) }}</span>
          </button>
        </div>
      </div>

      <div v-else-if="!loadingPitchers">
        <p>No pitchers found — one will be assigned automatically.</p>
        <button class="play-btn" @click="goToStep(3)">Next</button>
      </div>
    </div>

    <!--
      ==================== STEP 3: PICK OPPONENT SEASON + TEAM ====================
      Season dropdown above the opponent team grid. Teams update when season changes.
    -->
    <div v-if="!game && setupStep === 3" class="start-screen">
      <div class="step-header">
        <h3 class="step-label">Pick your opponent</h3>
      </div>
      <!-- PREMIUM GATE: Opponent season — premium users get era selector,
           free users are locked to the same season as their home team -->
      <div v-if="premiumUnlocked" class="season-hero">
        <div class="era-grid">
          <div v-for="era in availableEras" :key="era.label" class="era-card"
               :class="{ selected: selectedAwayEra.label === era.label }">
            <span class="era-label">{{ era.label }}</span>
            <select
              class="era-select"
              :value="selectedAwayEra.label === era.label ? selectedAwaySeason : ''"
              @change="selectAwayEra(era); selectedAwaySeason = Number($event.target.value)"
            >
              <option value="" disabled>{{ era.start }}–{{ era.end }}</option>
              <option v-for="y in (era.end - era.start + 1)" :key="era.end - y + 1" :value="era.end - y + 1">
                {{ era.end - y + 1 }}
              </option>
            </select>
          </div>
        </div>
        <span v-if="loadingAwayTeams" class="season-hero-loading">Loading teams...</span>
      </div>
      <div v-else style="margin-bottom: 4px; text-align: center;">
        <span style="color: #ccc; font-size: 15px;">{{ selectedSeason }}</span>
        <span v-if="loadingAwayTeams" style="color: #888; margin-left: 12px; font-size: 13px;">Loading teams...</span>
      </div>
      <p class="selected-year-label">{{ selectedAwaySeason }}</p>
      <div class="opponent-leagues">
        <div v-for="league in opponentLeagues" :key="league.name" class="opponent-league-section">
          <h4 class="league-header">{{ league.label }}</h4>
          <div class="opponent-grid">
            <div
              v-for="team in league.teams"
              :key="team.id"
              class="opponent-card"
              :class="{ selected: selectedOpponentId === team.id }"
              @click="selectedOpponentId = team.id; goToStep(4)"
            >
              <img :src="teamLogoUrl(team.id)" :alt="team.name" class="opponent-logo" />
              <div class="opponent-abbr">{{ team.abbreviation }}</div>
              <div class="opponent-name">{{ team.name }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- PREMIUM GATE: Cross-season opponent selection upgrade CTA -->
      <div v-if="!premiumUnlocked" class="unlock-section">
        <a href="https://baldmike.gumroad.com/l/basebald" target="_blank" rel="noopener" class="unlock-btn">
          Upgrade to Premium to unlock the ability to choose opponents from ANY season — just $3!
        </a>
        <div class="unlock-code-row">
          <input
            v-model="unlockCode"
            type="text"
            placeholder="Enter Code to Unlock Premium"
            class="unlock-input"
            @keyup.enter="tryUnlock"
          />
          <button class="unlock-submit" @click="tryUnlock">Unlock</button>
        </div>
        <p v-if="unlockError" class="unlock-error">Invalid code. Please try again.</p>
      </div>
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
        <div v-if="classicMode && starterList.length > 0" class="pitcher-selection">
          <p>Choose your starting pitcher ({{ homeTeamName }}):</p>
          <div class="pitcher-list">
            <button
              v-for="p in starterList"
              :key="p.id"
              class="pitcher-option"
              :class="{ selected: selectedPitcherId === p.id }"
              @click="selectedPitcherId = p.id"
            >
              <span class="pitcher-opt-name">{{ p.name }} <span class="pitcher-role-tag">{{ p.role || 'P' }}</span></span>
              <span class="pitcher-opt-stats">ERA {{ p.stats.era.toFixed(2) }} | K/9 {{ p.stats.k_per_9.toFixed(1) }}</span>
            </button>
          </div>
        </div>

        <!-- Away pitcher selection — shown in both normal and classic modes -->
        <div v-if="awayStarterList.length > 0" class="pitcher-selection">
          <p>Choose the opponent's starting pitcher ({{ awayTeamName }}):</p>
          <div class="pitcher-list">
            <button
              v-for="p in awayStarterList"
              :key="p.id"
              class="pitcher-option"
              :class="{ selected: selectedAwayPitcherId === p.id }"
              @click="selectedAwayPitcherId = p.id; goToStep(5)"
            >
              <span class="pitcher-opt-name">{{ p.name }} <span class="pitcher-role-tag">{{ p.role || 'P' }}</span></span>
              <span class="pitcher-opt-stats">ERA {{ p.stats.era.toFixed(2) }} | K/9 {{ p.stats.k_per_9.toFixed(1) }}</span>
            </button>
          </div>
        </div>

        <!-- Fallback when no pitchers are available for either team -->
        <div v-if="!awayStarterList.length && (!classicMode || !starterList.length)">
          <p>No pitchers found — they will be assigned automatically.</p>
          <button class="play-btn" @click="goToStep(5)">Next</button>
        </div>

      </template>
    </div>

    <!--
      ==================== STEP 5: WEATHER + START GAME ====================
      Weather picker and action buttons to start the game.
      For historical matchups, the real weather is auto-selected but can be overridden.
      For custom/fantasy games, defaults to "Clear Skies".
    -->
    <div v-if="!game && setupStep === 5" class="start-screen">
      <!-- Historic mode: pick your team (stadium is fixed) -->
      <div v-if="classicMode && classicMatchupData?.stadium" class="venue-selection">
        <p>Play as:</p>
        <div class="venue-grid">
          <button class="venue-card" :class="{ selected: playerSide === 'home' }"
                  @click="playerSide = 'home'">
            <span class="venue-team">{{ homeTeamName }} ({{ selectedSeason }})</span>
          </button>
          <button class="venue-card" :class="{ selected: playerSide === 'away' }"
                  @click="playerSide = 'away'">
            <span class="venue-team">{{ awayTeamName }} ({{ selectedAwaySeason }})</span>
          </button>
        </div>
        <p class="venue-name">{{ classicMatchupData.stadium }}</p>
      </div>

      <!-- Fantasy mode: pick your team, then home/away -->
      <div v-else-if="classicMode" class="venue-selection">
        <p>Play as:</p>
        <div class="venue-grid">
          <button class="venue-card" :class="{ selected: fantasyTeamId === classicMatchupData.home.id }"
                  @click="fantasyTeamId = classicMatchupData.home.id; applyFantasySelection()">
            <span class="venue-team">{{ classicMatchupData.home.name }} ({{ classicMatchupData.home.season }})</span>
          </button>
          <button class="venue-card" :class="{ selected: fantasyTeamId === classicMatchupData.away.id }"
                  @click="fantasyTeamId = classicMatchupData.away.id; applyFantasySelection()">
            <span class="venue-team">{{ classicMatchupData.away.name }} ({{ classicMatchupData.away.season }})</span>
          </button>
        </div>
        <p>Home or Away?</p>
        <div class="venue-grid">
          <button class="venue-card" :class="{ selected: fantasySidePreference === 'home' }"
                  @click="fantasySidePreference = 'home'; applyFantasySelection()">
            <span class="venue-side-label">Home</span>
          </button>
          <button class="venue-card" :class="{ selected: fantasySidePreference === 'away' }"
                  @click="fantasySidePreference = 'away'; applyFantasySelection()">
            <span class="venue-side-label">Away</span>
          </button>
        </div>
        <p v-if="homeVenue" class="venue-name">{{ homeVenue.name }}</p>
      </div>

      <!-- Season mode: home/away picker (team already chosen) -->
      <div v-else class="venue-selection">
        <p>Home or Away?</p>
        <div class="venue-grid">
          <button class="venue-card" :class="{ selected: playerSide === 'home' }"
                  @click="playerSide = 'home'; selectedVenue = homeVenue?.name || ''">
            <span class="venue-side-label">Home</span>
            <span class="venue-name" v-if="homeVenue">{{ homeVenue.name }}</span>
          </button>
          <button class="venue-card" :class="{ selected: playerSide === 'away' }"
                  @click="playerSide = 'away'; selectedVenue = awayVenue?.name || ''">
            <span class="venue-side-label">Away</span>
            <span class="venue-name" v-if="awayVenue">{{ awayVenue.name }}</span>
          </button>
        </div>
      </div>

      <div class="weather-selection" :class="{ 'ellis-weather': isDockEllis }">
        <p>Choose the conditions:</p>
        <div class="weather-grid">
          <button
            v-for="key in weatherKeys.slice(0, 4)"
            :key="key"
            class="weather-card"
            :class="{ selected: selectedWeather === key, 'ellis-ripple': isDockEllis && selectedWeather !== key }"
            @click="selectedWeather = key"
          >
            <span class="weather-icon">{{ isDockEllis ? ellisWeatherIcon(key) : WEATHER_CONDITIONS[key].icon }}</span>
            <span class="weather-label">{{ isDockEllis ? ellisWeatherLabel[key] : WEATHER_CONDITIONS[key].label }}</span>
            <span class="weather-detail">{{ WEATHER_CONDITIONS[key].temp }} · {{ WEATHER_CONDITIONS[key].wind }}</span>
          </button>
        </div>
        <div class="weather-grid tod-grid">
          <button
            v-for="key in weatherKeys.slice(4)"
            :key="key"
            class="weather-card"
            :class="{ selected: selectedWeather === key, 'ellis-ripple': isDockEllis && selectedWeather !== key }"
            @click="selectedWeather = key"
          >
            <span class="weather-icon">{{ isDockEllis ? ellisWeatherIcon(key) : WEATHER_CONDITIONS[key].icon }}</span>
            <span class="weather-label">{{ isDockEllis ? ellisWeatherLabel[key] : WEATHER_CONDITIONS[key].label }}</span>
            <span class="weather-detail">{{ WEATHER_CONDITIONS[key].temp }} · {{ WEATHER_CONDITIONS[key].wind }}</span>
          </button>
        </div>
      </div>

      <!-- PREMIUM GATE: Time of day selection — only visible to premium users.
           Affects error chance probabilities (day=4%, twilight=6%, night=2%).
           Free users get no time-of-day (null → baseline 2% error chance). -->
      <div v-if="premiumUnlocked" class="weather-selection" :class="{ 'ellis-weather': isDockEllis }">
        <p>Time of day:</p>
        <div class="weather-grid tod-grid">
          <button
            v-for="key in timeOfDayKeys"
            :key="key"
            class="weather-card"
            :class="{ selected: selectedTimeOfDay === key, 'ellis-ripple': isDockEllis && selectedTimeOfDay !== key, 'ellis-disabled': isDockEllis && (key === 'day' || key === 'night') }"
            @click="!(isDockEllis && (key === 'day' || key === 'night')) && (selectedTimeOfDay = key)"
          >
            <span class="weather-icon">{{ isDockEllis ? ellisTodIcon(key) : TIME_OF_DAY[key].icon }}</span>
            <span class="weather-label">{{ isDockEllis ? ellisTodLabel[key] : TIME_OF_DAY[key].label }}</span>
          </button>
        </div>
      </div>

      <div class="start-actions">
        <button class="play-btn" @click="startGame()" :disabled="loading"
          @mouseenter="isDockEllis && startScramble('playBall')" @mouseleave="isDockEllis && stopScramble('playBall')">
          <span v-if="loading">Loading rosters...</span>
          <span v-else-if="isDockEllis" class="scramble-text">
            <span v-for="(ch, i) in scrambleLetters.playBall" :key="i"
              class="scramble-letter" :class="[ch.effect, { 'letter-hidden': !ch.visible }]">{{ ch.char }}</span>
          </span>
          <span v-else>Play Ball!</span>
        </button>
        <button class="play-btn simulate-btn" @click="startSimulation()" :disabled="loading"
          @mouseenter="isDockEllis && startScramble('simulate')" @mouseleave="isDockEllis && stopScramble('simulate')">
          <span v-if="loading">Loading...</span>
          <span v-else-if="isDockEllis" class="scramble-text">
            <span v-for="(ch, i) in scrambleLetters.simulate" :key="i"
              class="scramble-letter" :class="[ch.effect, { 'letter-hidden': !ch.visible }]">{{ ch.char }}</span>
          </span>
          <span v-else>Simulate</span>
        </button>
      </div>
    </div>

    <!--
      ==================== ACTIVE GAME UI ====================
      Everything below is shown once game ref is non-null (game has been created).
      This includes: sound toggle, game-over overlay, scoreboard, field layout
      (diamond + player headshots), last play banner, controls, and play log.
    -->
    <div v-if="game" class="game-container" :class="{ 'called-shot-bg': isCalledShot }">

      <!--
        Game Over Overlay — a semi-transparent dark overlay that covers
        the entire game UI when game_status is 'final'.
        Shows the final score and a win/lose message.
        The overlay uses position: absolute + z-index to sit on top of all game content.
      -->
      <div v-if="game.game_status === 'final' && !gameOverDismissed" class="game-over-overlay">
        <div class="game-over-card">
          <h2>Game Over!</h2>
          <div class="final-score">
            <div class="final-team">
              <span class="label">{{ game.away_abbreviation || 'AWAY' }}{{ !isPlayerHome ? ' (You)' : '' }}</span>
              <span class="score">{{ game.away_total }}</span>
            </div>
            <div class="vs">—</div>
            <div class="final-team">
              <span class="label">{{ game.home_abbreviation || 'HOME' }}{{ isPlayerHome ? ' (You)' : '' }}</span>
              <span class="score">{{ game.home_total }}</span>
            </div>
          </div>
          <p class="result-text">{{ game[myPrefix + '_total'] > game[theirPrefix + '_total'] ? 'You Win!' : 'You Lose!' }}</p>
          <div class="game-over-actions">
            <button class="play-btn" @click="showPostGame('boxscore')">Box Score</button>
            <button class="play-btn" @click="showPostGame('scorecard')">Scorecard</button>
          </div>
          <button class="play-btn new-game-btn" @click="resetGame">New Game</button>
        </div>
      </div>

      <!-- Disco Demolition Night end-of-game video -->
      <div v-if="showDiscoVideo" class="game-over-overlay">
        <div class="aaron-overlay-content">
          <p class="disco-blurb">..and then this happened</p>
          <div class="aaron-video">
            <iframe
              src="https://www.youtube.com/embed/a1zN-oLCKo4?autoplay=1"
              allow="autoplay; encrypted-media"
              allowfullscreen
              frameborder="0"
            ></iframe>
          </div>
          <div class="aaron-card">
            <h2>Disco Demolition Night!</h2>
            <button class="play-btn" @click="showDiscoVideo = false">Close</button>
          </div>
        </div>
      </div>

      <!-- Dock Ellis no-hitter celebration -->
      <div v-if="showEllisNoNo" class="game-over-overlay">
        <div class="ellis-nono-card">
          <div class="ellis-smiley">&#9786;</div>
          <h2 class="ellis-message">You did it. Far out, man.</h2>
          <button class="play-btn" @click="showEllisNoNo = false">Groovy</button>
        </div>
      </div>

      <!-- The Apex Duel pre-game banner -->
      <div v-if="apexDuelBanner" class="game-over-overlay">
        <div class="apex-duel-card">
          <h2 class="apex-duel-title">The Apex Duel</h2>
          <div class="apex-duel-pitcher">
            <div class="apex-duel-name">Sandy Koufax</div>
            <div class="apex-duel-era">2.04 ERA</div>
            <div class="apex-duel-accolade">Cy Young, Perfect Game</div>
          </div>
          <div class="apex-duel-vs">vs</div>
          <div class="apex-duel-pitcher">
            <div class="apex-duel-name">Pedro Martinez</div>
            <div class="apex-duel-era">1.74 ERA</div>
            <div class="apex-duel-accolade">Multiple 1-hit outings, Dominated the steroid era</div>
          </div>
          <p class="apex-duel-luck">Good Luck.</p>
          <button class="play-btn apex-duel-btn" @click="dismissApexDuel">Let's Go</button>
        </div>
      </div>

      <!-- Babe Ruth's Called Shot cinematic -->
      <div v-if="calledShotActive" class="game-over-overlay">
        <div class="called-shot-card">
          <p
            v-for="(msg, i) in calledShotMessages"
            :key="i"
            class="called-shot-line"
            :class="{ visible: i <= calledShotIndex }"
          >{{ msg }}</p>
          <button
            v-if="calledShotIndex >= calledShotMessages.length - 1"
            class="play-btn called-shot-btn"
            @click="dismissCalledShot"
          >Throw the pitch</button>
        </div>
      </div>

      <!-- Babe Ruth Called Shot HR confirmation -->
      <div v-if="calledShotHRBanner" class="game-over-overlay">
        <div class="called-shot-card">
          <p class="called-shot-line visible called-shot-hr-text">The Babe called his home run!</p>
          <button class="play-btn called-shot-btn" @click="dismissCalledShotHR">Continue Game</button>
        </div>
      </div>

      <!-- Aaron 715 announcement overlay -->
      <div v-if="aaronAnnouncement" class="game-over-overlay">
        <div class="aaron-overlay-content">
          <div class="aaron-video">
            <iframe
              src="https://www.youtube.com/embed/QjqYThEVoSQ?autoplay=1"
              allow="autoplay; encrypted-media"
              allowfullscreen
              frameborder="0"
            ></iframe>
          </div>
          <div class="aaron-card">
            <h2>Hank Aaron has just broken Babe Ruth's record with 715 Home Runs!</h2>
            <button class="play-btn" @click="dismissAaronAnnouncement">Continue Game</button>
          </div>
        </div>
      </div>

      <!-- Inning transition banner -->
      <div
        v-if="inningBannerActive"
        class="game-over-overlay inning-banner-overlay"
        :class="{ 'banner-exiting': inningBannerExiting }"
        @click="dismissInningBanner"
      >
        <div class="inning-banner-card" :class="{ 'banner-exiting': inningBannerExiting }">
          <p class="inning-banner-ended">End of the {{ inningBannerData.endedHalf }} of the {{ inningBannerData.endedInning }}</p>
          <div class="inning-banner-score">
            <span>{{ inningBannerData.awayAbbr }} {{ inningBannerData.awayTotal }}</span>
            <span class="inning-banner-dash">&mdash;</span>
            <span>{{ inningBannerData.homeAbbr }} {{ inningBannerData.homeTotal }}</span>
          </div>
          <p class="inning-banner-coming">Coming up: {{ inningBannerData.comingHalf }} of the {{ inningBannerData.comingInning }}</p>
        </div>
      </div>

      <!--
        Scoreboard component — displays the line score grid with per-inning runs,
        ball-strike count, outs, and current inning. All data is passed as props.
      -->
      <div class="matchup-title">
        <span v-if="classicLabel" class="classic-label">{{ classicLabel }}</span>
        <span class="matchup-teams-line">{{ resolvedAwaySeason }} {{ game.away_team || 'Away' }} @ {{ resolvedHomeSeason }} {{ game.home_team || 'Home' }}</span>
        <span v-if="classicMatchupData?.date" class="matchup-date-line">{{ classicMatchupData.date }}</span>
      </div>
      <div class="venue-label" v-if="selectedVenue">
        {{ selectedVenue }}
        <span v-if="game.weather && WEATHER_CONDITIONS[game.weather]" class="venue-weather"> · {{ WEATHER_CONDITIONS[game.weather].icon }} {{ WEATHER_CONDITIONS[game.weather].temp }}</span>
      </div>

      <Scoreboard
        :away-score="game.away_score"
        :home-score="game.home_score"
        :away-total="game.away_total"
        :home-total="game.home_total"
        :away-hits="game.away_hits || 0"
        :home-hits="game.home_hits || 0"
        :away-errors="game.away_errors || 0"
        :home-errors="game.home_errors || 0"
        :inning="game.inning"
        :is-top="game.is_top"
        :balls="game.balls"
        :strikes="game.strikes"
        :outs="game.outs"
        :away-team-name="game.away_abbreviation"
        :home-team-name="game.home_abbreviation"
        :current-batter-name="game.current_batter_name"
        :away-team-id="resolvedAwayTeamId || 0"
        :home-team-id="resolvedHomeTeamId || 0"
        :play-log="game.play_log || []"
        :play-log-index="playLogIndex"
        @update:play-log-index="playLogIndex = $event"
      />

      <!--
        Field Layout — a horizontal flex row with:
          Left: Away team player
          Center: Baseball diamond SVG
          Right: Home team player

        Teams stay on the same side throughout the game. The role label
        (PITCHING / AT BAT) changes based on which half of the inning it is.
      -->
      <div class="field-layout">
        <!-- Away team card (left side) -->
        <div class="player-card pitcher-side" :class="{ 'your-team': game.player_side === 'away' }">
          <div class="headshot-wrapper">
            <img
              v-if="awayFieldPlayer?.id"
              :src="headshotUrl(awayFieldPlayer.id)"
              :alt="awayFieldPlayer.name"
              class="player-headshot"
            />
            <img :src="teamLogoUrl(resolvedAwayTeamId)" class="player-team-badge" />
          </div>
          <div class="player-card-info">
            <span class="player-card-label">{{ game.is_top ? 'AT BAT' : 'PITCHING' }}</span>
            <span class="player-card-name" :class="game.is_top ? 'batter-name-text' : 'pitcher-name'">{{ awayFieldPlayer?.name || '' }}</span>
          </div>
          <div v-if="!game.is_top" class="fatigue-meter">
            <span class="pitch-count">{{ game.away_pitch_count }} pitches</span>
            <div class="fatigue-bar">
              <div class="fatigue-fill" :style="{ width: (100 - awayFatiguePercent) + '%' }" :class="awayFatigueLevel"></div>
            </div>
            <span class="fatigue-label">Arm-O-Meter</span>
          </div>
        </div>

        <!-- Baseball diamond SVG — shows base occupancy with runner dots -->
        <BaseballDiamond :bases="game.bases" :leadoffs="runnerLeadoffs" />

        <!-- Home team card (right side) -->
        <div class="player-card batter-side" :class="{ 'your-team': game.player_side === 'home' }">
          <div class="headshot-wrapper">
            <img
              v-if="homeFieldPlayer?.id"
              :src="headshotUrl(homeFieldPlayer.id)"
              :alt="homeFieldPlayer.name"
              class="player-headshot"
            />
            <img :src="teamLogoUrl(resolvedHomeTeamId)" class="player-team-badge" />
          </div>
          <div class="player-card-info">
            <span class="player-card-label">{{ game.is_top ? 'PITCHING' : 'AT BAT' }}</span>
            <span class="player-card-name" :class="game.is_top ? 'pitcher-name' : 'batter-name-text'">{{ homeFieldPlayer?.name || '' }}</span>
          </div>
          <div v-if="game.is_top" class="fatigue-meter">
            <span class="pitch-count">{{ game.home_pitch_count }} pitches</span>
            <div class="fatigue-bar">
              <div class="fatigue-fill" :style="{ width: (100 - homeFatiguePercent) + '%' }" :class="homeFatigueLevel"></div>
            </div>
            <span class="fatigue-label">Arm-O-Meter</span>
          </div>
        </div>
      </div>

      <!--
        ==================== SIMULATION SPEED CONTROLS ====================
        Shown only during an automated simulation replay (simulating = true).

        SIMULATION REPLAY MECHANISM:
        When the user clicks "Simulate", the game engine runs the entire game at once
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
        <div class="tape-deck">
          <button class="deck-btn" :class="{ active: simSpeed === 2000 }" @click="setSimSpeed(2000)" title="Slow">&#9664;</button>
          <button class="deck-btn" :class="{ active: simSpeed === 1000 }" @click="setSimSpeed(1000)" title="Normal">&#9654;</button>
          <button class="deck-btn" :class="{ active: simSpeed === 300 }" @click="setSimSpeed(300)" title="Fast">&#9654;&#9654;</button>
          <button class="deck-btn deck-pause" :class="{ active: simPaused }" @click="toggleSimPause()" title="Pause / Resume"></button>
          <button class="deck-btn deck-stop" @click="skipToEnd()" title="Skip to End"></button>
          <button class="deck-btn deck-takeover" @click="takeOverGame()" title="Take Over &amp; Play">&#9654;|</button>
        </div>
      </div>

      <!--
        ==================== INTERACTIVE GAME CONTROLS ====================
        Shown only when the game is active (not final) and not simulating.
        The engine's `player_role` field determines whether the user is
        currently pitching or batting.

        - Pitching: user is the home team's pitcher (top of inning, away team bats)
        - Batting: user is a home team batter (bottom of inning, home team bats)
      -->
      <div class="controls" v-if="game.game_status === 'active' && !simulating">
        <div class="action-bar" :class="{ pitching: game.player_role === 'pitching' }">
          <!-- Left-justified change pitcher button (pitching only) -->
          <button
            v-if="game.player_role === 'pitching' && game[myPrefix + '_bullpen'].length"
            class="action-btn change-pitcher-action-btn"
            @click="showBullpen = true"
            :disabled="loading"
          >Change Pitcher ({{ Math.max(0, 100 - Math.round(fatiguePercent)) }}%)</button>

          <!-- Pitching buttons -->
          <template v-if="game.player_role === 'pitching'">
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
          </template>

          <!-- Batting buttons -->
          <template v-if="game.player_role === 'batting'">
            <button class="action-btn swing-btn" @click="doBat('swing')" :disabled="loading">
              Swing!
            </button>
            <button class="action-btn bunt-btn" @click="doBat('bunt')" :disabled="loading">
              Bunt
            </button>
            <button class="action-btn take-btn" @click="doBat('take')" :disabled="loading">
              Take
            </button>
            <button
              v-if="game.bases[2]"
              class="action-btn bunt-btn"
              @click="doBat('squeeze')"
              :disabled="loading"
            >Squeeze</button>
          </template>

          <!-- Right-justified sim button -->
          <button class="action-btn sim-btn" @click="simulateRest()" :disabled="loading">Start Sim</button>
        </div>

        <!-- Pickoff buttons (pitching only) — shown when at least one runner on base -->
        <div v-if="game.player_role === 'pitching' && (game.bases[0] || game.bases[1] || game.bases[2])" class="pickoff-bar">
          <button class="action-btn pickoff-btn" @click="doPickoff(0)" :disabled="loading || !game.bases[0]">Throw to 1st</button>
          <button class="action-btn pickoff-btn" @click="doPickoff(1)" :disabled="loading || !game.bases[1]">Throw to 2nd</button>
          <button class="action-btn pickoff-btn" @click="doPickoff(2)" :disabled="loading || !game.bases[2]">Throw to 3rd</button>
        </div>

        <!-- Leadoff buttons (batting only) — shown when runners are on base -->
        <div v-if="game.player_role === 'batting' && (game.bases[0] || game.bases[1] || game.bases[2])" class="leadoff-bar">
          <button
            v-if="game.bases[0]"
            class="action-btn leadoff-btn"
            :class="{ active: runnerLeadoffs[0] }"
            @click="toggleLeadoff(0)"
            :disabled="loading"
          >Lead off 1st</button>
          <button
            v-if="game.bases[1]"
            class="action-btn leadoff-btn"
            :class="{ active: runnerLeadoffs[1] }"
            @click="toggleLeadoff(1)"
            :disabled="loading"
          >Lead off 2nd</button>
          <button
            v-if="game.bases[2]"
            class="action-btn leadoff-btn"
            :class="{ active: runnerLeadoffs[2] }"
            @click="toggleLeadoff(2)"
            :disabled="loading"
          >Lead off 3rd</button>
        </div>

        <!-- Steal controls (batting only) -->
        <div v-if="game.player_role === 'batting' && pendingSteal != null" class="button-group steal-group">
          <span class="steal-pending-label">Runner going! Pick your action...</span>
          <button class="action-btn steal-btn cancel-steal" @click="pendingSteal = null" :disabled="loading">Cancel</button>
        </div>
        <div v-else-if="game.player_role === 'batting' && canSteal" class="button-group steal-group">
          <button
            v-if="game.bases[0] && !game.bases[1]"
            class="action-btn steal-btn"
            @click="doSteal(0)"
            :disabled="loading"
          >Steal 2nd</button>
          <button
            v-if="game.bases[1] && !game.bases[2]"
            class="action-btn steal-btn"
            @click="doSteal(1)"
            :disabled="loading"
          >Steal 3rd</button>
          <button
            v-if="game.bases[2]"
            class="action-btn steal-btn"
            @click="doSteal(2)"
            :disabled="loading"
          >Steal Home</button>
        </div>

        <button v-if="lastSnapshot && showDoOver" class="action-btn doover-btn" @click="doOver()" :disabled="loading">Do Over!</button>


        <!-- Bullpen modal -->
        <div v-if="showBullpen" class="bullpen-overlay" @click.self="showBullpen = false">
          <div class="bullpen-modal">
            <h3 class="bullpen-title">Bullpen</h3>
            <div class="bullpen-list">
              <div v-for="p in game[myPrefix + '_bullpen']" :key="p.id" class="bullpen-option">
                <div class="bullpen-info">
                  <span class="bullpen-name">{{ p.name }} <span class="pitcher-role-tag">{{ p.role || 'RP' }}</span></span>
                  <span class="bullpen-stats" v-if="p.stats">ERA {{ p.stats.era.toFixed(2) }} | K/9 {{ p.stats.k_per_9.toFixed(1) }}</span>
                </div>
                <div v-if="warmingUp[p.id]" class="warmup-status">
                  <div class="warmup-bar">
                    <div class="warmup-fill" :style="{ width: Math.min(100, (warmingUp[p.id].pitches / WARMUP_PITCHES_NEEDED) * 100) + '%' }"></div>
                  </div>
                  <span class="warmup-tally">{{ warmingUp[p.id].pitches }}/{{ WARMUP_PITCHES_NEEDED }}</span>
                  <button v-if="warmingUp[p.id].pitches >= WARMUP_PITCHES_NEEDED" class="bullpen-ready-btn" @click="doSwitchPitcher(p)">Put In</button>
                </div>
                <button v-else class="warmup-start-btn" @click="startWarmup(p); showBullpen = false">Warm Up</button>
              </div>
            </div>
            <button class="bullpen-cancel" @click="showBullpen = false">Cancel</button>
          </div>
        </div>
        <div v-if="Object.keys(warmingUp).length" class="warmup-indicator" @click="showBullpen = true">
          <span v-for="(w, id) in warmingUp" :key="id" class="warmup-chip">
            {{ w.name }}: {{ w.pitches }}/{{ WARMUP_PITCHES_NEEDED }} {{ w.pitches >= WARMUP_PITCHES_NEEDED ? '\u2713' : '' }}
          </span>
        </div>
      </div>

      <!--
        ==================== SCORE VIEW TOGGLE ====================
        Toggle between traditional box score and per-PA scorecard.
      -->
      <div class="score-view-toggle">
        <button :class="{ active: !showScorecard }" @click="showScorecard = false">Box Score</button>
        <button :class="{ active: showScorecard }" @click="showScorecard = true">Scorecard</button>
      </div>

      <!--
        ==================== SCORECARD VIEW ====================
        Traditional per-PA scorecard grid, shown when toggled on.
      -->
      <div v-if="showScorecard" class="scorecard-section">
        <Scorecard
          :scorecard="game.away_scorecard || []"
          :lineup="game.away_box_score || []"
          :team-abbr="game.away_abbreviation || 'AWAY'"
        />
        <Scorecard
          :scorecard="game.home_scorecard || []"
          :lineup="game.home_box_score || []"
          :team-abbr="game.home_abbreviation || 'HOME'"
        />
      </div>

      <!--
        ==================== BOX SCORE ====================
        Running box score showing per-player batting stats and pitcher stats
        for both teams. Updates after every play.
      -->
      <div v-show="!showScorecard" class="box-score-section">
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
                <th>2B</th>
                <th>3B</th>
                <th>HR</th>
                <th>RBI</th>
                <th>BB</th>
                <th>SO</th>
                <th>SB</th>
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
                <td>{{ p['2b'] }}</td>
                <td>{{ p['3b'] }}</td>
                <td>{{ p.hr }}</td>
                <td>{{ p.rbi }}</td>
                <td>{{ p.bb }}</td>
                <td>{{ p.so }}</td>
                <td>{{ p.sb }}</td>
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
                <th>2B</th>
                <th>3B</th>
                <th>HR</th>
                <th>RBI</th>
                <th>BB</th>
                <th>SO</th>
                <th>SB</th>
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
                <td>{{ p['2b'] }}</td>
                <td>{{ p['3b'] }}</td>
                <td>{{ p.hr }}</td>
                <td>{{ p.rbi }}</td>
                <td>{{ p.bb }}</td>
                <td>{{ p.so }}</td>
                <td>{{ p.sb }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Away pitching -->
        <div class="box-team" v-if="game.away_pitcher_stats">
          <h3 class="box-team-header">{{ game.away_abbreviation || 'AWAY' }} Pitching</h3>
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
              <tr v-for="ps in (game.away_pitcher_history || [])" :key="ps.id">
                <td class="box-name">{{ ps.name }}</td>
                <td>{{ formatIP(ps.ip_outs) }}</td>
                <td>{{ ps.h }}</td>
                <td>{{ ps.r }}</td>
                <td>{{ ps.er }}</td>
                <td>{{ ps.bb }}</td>
                <td>{{ ps.so }}</td>
              </tr>
              <tr>
                <td class="box-name">{{ game.away_pitcher_stats.name }}</td>
                <td>{{ formatIP(game.away_pitcher_stats.ip_outs) }}</td>
                <td>{{ game.away_pitcher_stats.h }}</td>
                <td>{{ game.away_pitcher_stats.r }}</td>
                <td>{{ game.away_pitcher_stats.er }}</td>
                <td>{{ game.away_pitcher_stats.bb }}</td>
                <td>{{ game.away_pitcher_stats.so }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Home pitching -->
        <div class="box-team" v-if="game.home_pitcher_stats">
          <h3 class="box-team-header">{{ game.home_abbreviation || 'HOME' }} Pitching</h3>
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
              <tr v-for="ps in (game.home_pitcher_history || [])" :key="ps.id">
                <td class="box-name">{{ ps.name }}</td>
                <td>{{ formatIP(ps.ip_outs) }}</td>
                <td>{{ ps.h }}</td>
                <td>{{ ps.r }}</td>
                <td>{{ ps.er }}</td>
                <td>{{ ps.bb }}</td>
                <td>{{ ps.so }}</td>
              </tr>
              <tr>
                <td class="box-name">{{ game.home_pitcher_stats.name }}</td>
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

      <div v-if="game.game_status === 'final' && gameOverDismissed" class="post-game-footer">
        <button class="play-btn" @click="resetGame">New Game</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { createNewGame, simulateGame, processPitch, processAtBat, switchPitcher, attemptSteal, attemptPickoff } from '../services/gameEngine.js'
import { getAllTeams, getTeamPitchers, getTeamVenue } from '../services/mlbApi.js'
import { WEATHER_CONDITIONS, TIME_OF_DAY } from '../services/weather.js'
import { useSoundEffects } from '../composables/useSoundEffects.js'
import BaseballDiamond from './BaseballDiamond.vue'
import Scoreboard from './Scoreboard.vue'
import TeamSelector from './TeamSelector.vue'
import Scorecard from './Scorecard.vue'

// ============================================================
// CORE GAME STATE
// ============================================================

/**
 * The main game state object from the game engine.
 * null when no game is active (setup wizard is shown instead).
 * Contains everything: scores, bases, count, lineups, play log, etc.
 */
const game = ref(null)

/**
 * Loading flag — true while an API call is in flight.
 * Disables action buttons to prevent double-submission.
 */
const loading = ref(false)

const showScorecard = ref(false)
const gameOverDismissed = ref(false)
const gameMode = ref(null)

/** Whether the current game is a classic matchup (historic or fantasy). */
const classicMode = ref(false)

/** Which side the player controls — 'home' or 'away'. */
const playerSide = ref('home')
const isPlayerHome = computed(() => playerSide.value === 'home')
const myPrefix = computed(() => isPlayerHome.value ? 'home' : 'away')
const theirPrefix = computed(() => isPlayerHome.value ? 'away' : 'home')

/**
 * Resolved game-time team IDs, seasons, and pitcher IDs.
 * In season mode, when the player picks "away", the teams swap: the player's team
 * becomes the away team and the opponent becomes the home team.
 * In classic mode, home/away are already correctly assigned by the matchup data,
 * so no swapping is needed — playerSide only indicates which team the player controls.
 */
const shouldSwap = computed(() => !classicMode.value && !isPlayerHome.value)
const resolvedHomeTeamId = computed(() => shouldSwap.value ? selectedOpponentId.value : teamSelected.value)
const resolvedAwayTeamId = computed(() => shouldSwap.value ? teamSelected.value : selectedOpponentId.value)
const resolvedHomeSeason = computed(() => shouldSwap.value ? selectedAwaySeason.value : selectedSeason.value)
const resolvedAwaySeason = computed(() => shouldSwap.value ? selectedSeason.value : selectedAwaySeason.value)
const resolvedHomePitcherId = computed(() => shouldSwap.value ? selectedAwayPitcherId.value : selectedPitcherId.value)
const resolvedAwayPitcherId = computed(() => shouldSwap.value ? selectedPitcherId.value : selectedAwayPitcherId.value)

/** Index into play_log for the outcome banner. Tracks the latest entry by default. */
const playLogIndex = ref(0)

// ============================================================
// PREMIUM UNLOCK
// ============================================================
//
// Premium is a one-time unlock gated by a code (sold via Gumroad for $3).
// The unlock state is persisted in localStorage so it survives page reloads.
//
// What premium unlocks (all enforced in THIS file, not in gameEngine.js):
//   1. Season range:     2000-2025 (free) → 1900-2025 (premium)
//   2. Historic matchups: 6 (free) → 15 (premium)
//   3. Fantasy matchups:  6 (free) → 15 (premium)
//   4. Opponent season:   locked to home season (free) → any season (premium)
//   5. Time of day:       hidden (free) → day/twilight/night picker (premium)
//
// All in-game mechanics (pitching, batting, steals, double plays, weather
// effects, bullpen management, etc.) are fully available to ALL users.
// ============================================================

/** Whether the user has unlocked premium features (persisted in localStorage). */
const premiumUnlocked = ref(localStorage.getItem('premiumUnlocked') === 'true')

/** Two-way bound to the unlock code input field. */
const unlockCode = ref('')

/** Shows an error message when the user enters an incorrect code. */
const unlockError = ref(false)

/**
 * Validate the unlock code and activate premium if correct.
 * Called when the user clicks "Unlock" or presses Enter in the code input.
 */
function tryUnlock() {
  if (unlockCode.value === 'BASEBALD-PREMIUM-8675309') {
    premiumUnlocked.value = true
    unlockError.value = false
    localStorage.setItem('premiumUnlocked', 'true')
  } else {
    unlockError.value = true
  }
}

/**
 * PREMIUM GATE: Historic matchups list.
 * Free users see 6 matchups; premium users see all 15.
 */
const historicalMatchups = computed(() =>
  premiumUnlocked.value
    ? [...freeHistoricalMatchups, ...premiumHistoricalMatchups]
    : freeHistoricalMatchups
)

/**
 * PREMIUM GATE: Fantasy matchups list.
 * Free users see 6 matchups; premium users see all 15.
 */
const fantasyMatchups = computed(() =>
  premiumUnlocked.value
    ? [...freeFantasyMatchups, ...premiumFantasyMatchups]
    : freeFantasyMatchups
)

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
const selectedSeason = ref(2025)

/**
 * Baseball eras for the season picker.
 * Each era has a label, year range, and whether it requires premium.
 * Free users see Moneyball + Modern; premium unlocks all 9 eras.
 */
const allEras = [
  { label: 'Dead-Ball Era', start: 1900, end: 1919, premium: true },
  { label: 'Golden Age', start: 1920, end: 1941, premium: true },
  { label: 'World War II Era', start: 1942, end: 1946, premium: true },
  { label: 'Integration Era', start: 1947, end: 1960, premium: true },
  { label: 'Expansion Era', start: 1961, end: 1975, premium: true },
  { label: 'Free Agency Era', start: 1976, end: 1993, premium: true },
  { label: 'Steroid Era', start: 1994, end: 2005, premium: true },
  { label: 'Moneyball Era', start: 2006, end: 2015, premium: false },
  { label: 'Modern Era', start: 2016, end: 2025, premium: false },
]

const availableEras = computed(() =>
  allEras.filter(e => premiumUnlocked.value || !e.premium)
)

const selectedEra = ref(allEras[allEras.length - 1])
const selectedAwayEra = ref(allEras[allEras.length - 1])

function selectAwayEra(era) {
  selectedAwayEra.value = era
}

/** All available seasons across unlocked eras (used by opponent dropdown). */
const availableSeasons = computed(() => {
  const eras = availableEras.value
  const years = []
  for (let i = eras.length - 1; i >= 0; i--) {
    for (let y = eras[i].end; y >= eras[i].start; y--) {
      years.push(y)
    }
  }
  return years
})

function selectEra(era) {
  selectedEra.value = era
}

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
 * null means the game engine will auto-assign a pitcher.
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
const selectedAwaySeason = ref(2025)

/**
 * Loading flag for the away team's pitcher list API call.
 */
const loadingAwayPitchers = ref(false)

/**
 * Array of pitcher objects for the away team.
 * Same structure as pitcherList but for the opponent.
 */
const awayPitcherList = ref([])

/** Starters only (SP) from the home pitcher list, with fallback to full list. */
const starterList = computed(() => {
  const sp = pitcherList.value.filter(p => p.role === 'SP')
  return sp.length > 0 ? sp : pitcherList.value
})

/** Starters only (SP) from the away pitcher list, with fallback to full list. */
const awayStarterList = computed(() => {
  const sp = awayPitcherList.value.filter(p => p.role === 'SP')
  return sp.length > 0 ? sp : awayPitcherList.value
})

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
const classicLabel = ref('')
const classicMatchupData = ref(null)

/**
 * Selected weather condition key (e.g., 'clear', 'hot', 'rain').
 * Auto-set from historical matchup data or manually chosen on step 6.
 */
const selectedWeather = ref('clear')
const selectedTimeOfDay = ref('day')

/** Babe Ruth's Called Shot — B&W Wrigley Field background. */
const isCalledShot = computed(() => classicLabel.value === "Babe Ruth's Called Shot")

/** The Apex Duel — Pedro vs Koufax, always low-scoring. */
const isApexDuel = computed(() => classicLabel.value === 'The Apex Duel')
const apexDuelBanner = ref(false)
let apexDuelPendingAction = null // 'play' or 'simulate'

/** Dock Ellis LSD no-hitter — special theming on the weather/time-of-day screen. */
const isDockEllis = computed(() => classicLabel.value === 'Dock Ellis: Just Say No-No')
const ellisWeatherLabel = { clear: 'Trippy Skies', hot: 'Hot & Humid', wind_out: 'Wind Out', wind_in: 'Wind In', cold: 'Lucy', rain: 'Sky', dome: 'Diamonds' }
const ellisTodLabel = { day: 'Day Game', twilight: 'Twilight Zone', night: 'Night Game' }

// Icons that cycle through tiles — Dock Ellis, Jimi Hendrix (whom he thought was there), and trippy symbols
const ellisIconPool = ['🌈', '🎸', '⚾', '💎', '🌌', '💠', '🔥', '💨', '🌬️', '👁️', '🍄', '✌️', '🎵', '💀', '🌀']
const ellisShuffledIcons = ref([...ellisIconPool.slice(0, 7)])
const ellisTodIcons = ref(['☀️', '👁️', '🌙'])
let ellisInterval = null

function shuffleEllisIcons() {
  const pool = [...ellisIconPool]
  // Fisher-Yates shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]]
  }
  ellisShuffledIcons.value = pool.slice(0, 7)
  ellisTodIcons.value = pool.slice(7, 10)
}

watch(isDockEllis, (val) => {
  if (val) {
    shuffleEllisIcons()
    ellisInterval = setInterval(shuffleEllisIcons, 5000)
  } else {
    if (ellisInterval) { clearInterval(ellisInterval); ellisInterval = null }
  }
})

function ellisWeatherIcon(key) {
  const idx = weatherKeys.indexOf(key)
  return ellisShuffledIcons.value[idx] || '🌈'
}
function ellisTodIcon(key) {
  const idx = timeOfDayKeys.indexOf(key)
  return ellisTodIcons.value[idx] || '👁️'
}

/** Letter melt/fall effect on hover for Play Ball! / Simulate buttons (Dock Ellis only).
 *  On hover: letters randomly melt or fall away until gone.
 *  On leave: letters slowly reappear in random order. */
const scrambleOriginals = { playBall: 'Play Ball!', simulate: 'Simulate' }
const scrambleIntervals = {}

function makeLetters(str) {
  return str.split('').map(ch => ({ char: ch, effect: '', visible: true }))
}

const scrambleLetters = ref({
  playBall: makeLetters('Play Ball!'),
  simulate: makeLetters('Simulate'),
})

function startScramble(key) {
  if (scrambleIntervals[key]) { clearInterval(scrambleIntervals[key]); delete scrambleIntervals[key] }
  const original = scrambleOriginals[key]
  // Build list of non-space indices, shuffled for random disappear order
  const indices = []
  for (let i = 0; i < original.length; i++) { if (original[i] !== ' ') indices.push(i) }
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]]
  }
  let removed = 0
  const letters = original.split('').map(ch => ({
    char: ch === ' ' ? '\u00A0' : ch,
    effect: '',
    visible: true,
  }))
  scrambleLetters.value = { ...scrambleLetters.value, [key]: [...letters.map(l => ({ ...l }))] }
  scrambleIntervals[key] = setInterval(() => {
    if (removed >= indices.length) {
      clearInterval(scrambleIntervals[key]); delete scrambleIntervals[key]; return
    }
    const idx = indices[removed]
    letters[idx].effect = Math.random() < 0.5 ? 'letter-melt' : 'letter-fall'
    letters[idx].visible = false
    removed++
    scrambleLetters.value = { ...scrambleLetters.value, [key]: [...letters.map(l => ({ ...l }))] }
  }, 150)
}

function stopScramble(key) {
  if (scrambleIntervals[key]) { clearInterval(scrambleIntervals[key]); delete scrambleIntervals[key] }
  const original = scrambleOriginals[key]
  const current = scrambleLetters.value[key]
  // Find which indices are still hidden
  const hidden = []
  for (let i = 0; i < current.length; i++) {
    if (original[i] !== ' ' && !current[i].visible) hidden.push(i)
  }
  // Shuffle for random reappear order
  for (let i = hidden.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [hidden[i], hidden[j]] = [hidden[j], hidden[i]]
  }
  if (hidden.length === 0) return
  let restored = 0
  const letters = current.map(l => ({ ...l }))
  scrambleIntervals[key] = setInterval(() => {
    if (restored >= hidden.length) {
      clearInterval(scrambleIntervals[key]); delete scrambleIntervals[key]; return
    }
    const idx = hidden[restored]
    letters[idx].visible = true
    letters[idx].effect = 'letter-rise'
    restored++
    scrambleLetters.value = { ...scrambleLetters.value, [key]: [...letters.map(l => ({ ...l }))] }
  }, 200)
}

/**
 * Selected venue name displayed below the matchup title during gameplay.
 * Defaults to the home team's stadium; user can switch to the away team's
 * stadium in the venue picker (step 5).
 */
const selectedVenue = ref('')

/**
 * Home and away team venue objects ({ id, name }) fetched from the MLB Stats API
 * via getTeamVenue(). For historic matchups with a hardcoded `stadium` field,
 * that value is used directly instead of fetching.
 */
const homeVenue = ref(null)
const awayVenue = ref(null)

/**
 * All weather condition keys for the weather picker UI.
 */
const weatherKeys = ['clear', 'hot', 'wind_out', 'wind_in', 'cold', 'rain', 'dome']
const timeOfDayKeys = Object.keys(TIME_OF_DAY)

// ============================================================
// SIMULATION REPLAY STATE
// Used when the user clicks "Simulate" instead of "Play Ball!"
// ============================================================

/**
 * Whether a simulation replay is currently running.
 * When true, the speed controls are shown and game controls are hidden.
 */
const simulating = ref(false)
const simPaused = ref(false)

/**
 * Array of game state snapshot objects from the game engine's simulation.
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

/** Warmup state: tracks which bullpen pitchers are warming up and their pitch tally. */
const warmingUp = ref({})  // { pitcherId: { name, pitches } }
const WARMUP_PITCHES_NEEDED = 13

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
const freeHistoricalMatchups = [
  { label: "Babe Ruth's Called Shot", article: 'https://www.nationalgeographic.com/history/article/babe-ruth-called-shot-home-run', subtitle: '1932 World Series, Game 3', date: 'Oct 1, 1932', stadium: 'Wrigley Field', weather: 'cold', winningPitcher: 'George Pipgras', losingPitcher: 'Charlie Root', home: { id: 112, name: 'Cubs', season: 1932, pitcherId: 121440, pitcherName: 'Charlie Root' }, away: { id: 147, name: 'Yankees', season: 1932, pitcherId: 120593, pitcherName: 'George Pipgras' } },
  { label: "Don Larsen's Perfect Game", article: 'https://www.si.com/mlb/2016/10/04/don-larsen-perfect-game-color-photos', subtitle: '1956 World Series, Game 5', date: 'Oct 8, 1956', stadium: 'Yankee Stadium', weather: 'clear', winningPitcher: 'Don Larsen', losingPitcher: 'Sal Maglie', home: { id: 147, name: 'Yankees', season: 1956, pitcherId: 117514, pitcherName: 'Don Larsen' }, away: { id: 119, name: 'Dodgers', season: 1956, pitcherId: 118140, pitcherName: 'Sal Maglie' } },
  { label: "Dock Ellis: Just Say No-No", article: 'https://www.rollingstone.com/culture/culture-sports/how-dock-ellis-player-who-pitched-a-no-hitter-on-lsd-is-misremembered-199528/', subtitle: '1970 Regular Season', date: 'Jun 12, 1970', stadium: 'San Diego Stadium', weather: 'clear', winningPitcher: 'Dock Ellis', losingPitcher: 'Dave Roberts', home: { id: 134, name: 'Pirates', season: 1970, pitcherId: 113815, pitcherName: 'Dock Ellis' }, away: { id: 135, name: 'Padres', season: 1970, pitcherId: 121276, pitcherName: 'Dave Roberts' } },
  { label: 'History on September 1st, 1971', article: 'https://andscape.com/features/on-this-day-in-1971-the-pittsburgh-pirates-fielded-the-first-all-black-lineup/', subtitle: '1971 Regular Season, First All-Black Lineup', date: 'Sep 1, 1971', stadium: 'Three Rivers Stadium', weather: 'clear', winningPitcher: 'Dock Ellis', losingPitcher: 'Woodie Fryman', home: { id: 134, name: 'Pirates', season: 1971, pitcherId: 113815, pitcherName: 'Dock Ellis' }, away: { id: 143, name: 'Phillies', season: 1971, pitcherId: 114466, pitcherName: 'Woodie Fryman' } },
  { label: "Hank Aaron's 715th Home Run", article: 'https://www.si.com/mlb/2020/04/08/hank-aaron-home-run-715-passes-babe-ruth', subtitle: '1974 Regular Season', date: 'Apr 8, 1974', stadium: 'Atlanta-Fulton County Stadium', weather: 'clear', winningPitcher: 'Ron Reed', losingPitcher: 'Al Downing', home: { id: 144, name: 'Braves', season: 1974, pitcherId: 121001, pitcherName: 'Ron Reed' }, away: { id: 119, name: 'Dodgers', season: 1974, pitcherId: 113515, pitcherName: 'Al Downing' } },
  { label: "3 HR from Mr. October", article: 'https://sabr.org/gamesproj/game/october-18-1977-reggie-becomes-mr-october-with-3-home-runs-in-world-series/', subtitle: '1977 World Series, Game 6', date: 'Oct 18, 1977', stadium: 'Yankee Stadium', weather: 'clear', winningPitcher: 'Mike Torrez', losingPitcher: 'Burt Hooton', home: { id: 147, name: 'Yankees', season: 1977, pitcherId: 123416, pitcherName: 'Mike Torrez' }, away: { id: 119, name: 'Dodgers', season: 1977, pitcherId: 116131, pitcherName: 'Burt Hooton' } },
]

const premiumHistoricalMatchups = [
  { label: 'Disco Demolition Night', article: 'https://www.npr.org/2016/07/16/485873750/july-12-1979-the-night-disco-died-or-didnt', subtitle: '1979 Doubleheader — Game 2 Forfeited', date: 'Jul 12, 1979', stadium: 'Comiskey Park', weather: 'hot', winningPitcher: 'Pat Underwood', losingPitcher: 'Ken Kravec', home: { id: 145, name: 'White Sox', season: 1979, pitcherId: 117300, pitcherName: 'Ken Kravec' }, away: { id: 116, name: 'Tigers', season: 1979, pitcherId: 123565, pitcherName: 'Pat Underwood' } },
  { label: "Buckner's Demise", article: 'https://sabr.org/gamesproj/game/october-25-1986-a-little-roller-up-along-first-mets-win-wild-game-six-on-buckner-error/', subtitle: '1986 World Series, Game 6', date: 'Oct 25, 1986', stadium: 'Shea Stadium', weather: 'cold', winningPitcher: 'Rick Aguilera', losingPitcher: 'Calvin Schiraldi', home: { id: 121, name: 'Mets', season: 1986, pitcherId: 119964, pitcherName: 'Bob Ojeda' }, away: { id: 111, name: 'Red Sox', season: 1986, pitcherId: 112388, pitcherName: 'Roger Clemens' } },
  { label: "Nolan Ryan's 7th No-Hitter", article: 'https://baseballhall.org/discover/inside-pitch/ryan-throws-seventh-no-hitter', subtitle: '1991 Regular Season — 44 Years Old', date: 'May 1, 1991', stadium: 'Arlington Stadium', weather: 'clear', winningPitcher: 'Nolan Ryan', losingPitcher: 'Jimmy Key', home: { id: 140, name: 'Rangers', season: 1991, pitcherId: 121597, pitcherName: 'Nolan Ryan' }, away: { id: 141, name: 'Blue Jays', season: 1991, pitcherId: 117032, pitcherName: 'Jimmy Key' } },
  { label: "McGwire's 62nd Home Run", article: 'https://vault.si.com/vault/1998/09/14/record-smasher-with-this-mighty-swing-mark-mcgwire-sent-his-62nd-home-run-over-the-fence-and-himself-into-a-special-place-in-americas-pantheon', subtitle: '1998 Regular Season', date: 'Sep 8, 1998', stadium: 'Busch Stadium', weather: 'hot', winningPitcher: 'Kent Mercker', losingPitcher: 'Steve Trachsel', home: { id: 138, name: 'Cardinals', season: 1998, pitcherId: 118967, pitcherName: 'Kent Mercker' }, away: { id: 112, name: 'Cubs', season: 1998, pitcherId: 123431, pitcherName: 'Steve Trachsel' } },
  { label: 'Sammy Sosa Corked Bat Game', article: 'https://www.espn.com/mlb/news/2003/0603/1562772.html', subtitle: '2003 Regular Season', date: 'Jun 3, 2003', stadium: 'Wrigley Field', weather: 'wind_out', winningPitcher: 'Mike Remlinger', losingPitcher: 'Al Levine', home: { id: 112, name: 'Cubs', season: 2003, pitcherId: 407578, pitcherName: 'Mark Prior' }, away: { id: 139, name: 'Devil Rays', season: 2003, pitcherId: 114928, pitcherName: 'Geremi Gonzalez' } },
  { label: 'The Bartman Game', article: 'https://www.si.com/mlb/2016/10/22/steve-bartman-incident-cubs-marlins-2003-nlcs', subtitle: '2003 NLCS, Game 6', date: 'Oct 14, 2003', stadium: 'Wrigley Field', weather: 'cold', winningPitcher: 'Josh Beckett', losingPitcher: 'Mark Prior', home: { id: 112, name: 'Cubs', season: 2003, pitcherId: 407578, pitcherName: 'Mark Prior' }, away: { id: 146, name: 'Marlins', season: 2003, pitcherId: 150230, pitcherName: 'Mark Redman' } },
  { label: 'Game 4 World Series Sweep', article: 'https://sabr.org/gamesproj/game/october-26-2005-dont-stop-believin-white-sox-complete-sweep-of-astros-to-win-first-world-series-in-88-years/', subtitle: '2005 World Series, Game 4', date: 'Oct 26, 2005', stadium: 'Minute Maid Park', weather: 'dome', winningPitcher: 'Freddy Garcia', losingPitcher: 'Brad Lidge', home: { id: 117, name: 'Astros', season: 2005, pitcherId: 407840, pitcherName: 'Brandon Backe' }, away: { id: 145, name: 'White Sox', season: 2005, pitcherId: 150119, pitcherName: 'Freddy Garcia' } },
  { label: "Buehrle's Perfect Game", article: 'https://www.chicagotribune.com/sports/white-sox/chi-24-white-sox-rays-chicago-jul24-story.html', subtitle: '2009 Regular Season', date: 'Jul 23, 2009', stadium: 'U.S. Cellular Field', weather: 'hot', winningPitcher: 'Mark Buehrle', losingPitcher: 'Scott Kazmir', home: { id: 145, name: 'White Sox', season: 2009, pitcherId: 279824, pitcherName: 'Mark Buehrle' }, away: { id: 139, name: 'Rays', season: 2009, pitcherId: 431148, pitcherName: 'Scott Kazmir' } },
  { label: 'Cubs Break the Curse — Game 7', article: 'https://www.espn.com/mlb/story/_/page/playoffs16_greatestgame7/how-did-cubs-curse-end-greatest-game-ever', subtitle: '2016 World Series, Game 7', date: 'Nov 2, 2016', stadium: 'Progressive Field', weather: 'rain', winningPitcher: 'Mike Montgomery', losingPitcher: 'Bryan Shaw', home: { id: 114, name: 'Indians', season: 2016, pitcherId: 446372, pitcherName: 'Corey Kluber' }, away: { id: 112, name: 'Cubs', season: 2016, pitcherId: 543294, pitcherName: 'Kyle Hendricks' } },
]

/**
 * Fantasy matchups — "what-if" dream games that never happened.
 * Each entry pits two teams from different eras against each other,
 * using real rosters and pitchers from the MLB Stats API.
 * Numbered #1–#15 in the UI via template index.
 * Same shape as historicalMatchups but without date/stadium/weather/winner fields.
 */
const freeFantasyMatchups = [
  { label: 'Crosstown Classic', subtitle: 'Getcher pops from da Jewels, grab a seat in the frunchroom and watch your team win by a couple two tree.', home: { id: 145, name: 'White Sox', season: 2005, pitcherId: 279824, pitcherName: 'Mark Buehrle' }, away: { id: 112, name: 'Cubs', season: 2016, pitcherId: 543294, pitcherName: 'Kyle Hendricks' } },
  { label: 'Coast to Coast', subtitle: 'Mantle vs Ohtani', home: { id: 119, name: 'Dodgers', season: 2024, pitcherId: 808967, pitcherName: 'Yoshinobu Yamamoto' }, away: { id: 147, name: 'Yankees', season: 1956, pitcherId: 114299, pitcherName: 'Whitey Ford' } },
  { label: "Bizarro '69 World Series", subtitle: 'The Seattle Pilots: What a Year.', home: { id: 158, name: 'Pilots', season: 1969, pitcherId: 111279, pitcherName: 'Jim Bouton' }, away: { id: 121, name: 'Mets', season: 1969, pitcherId: 121961, pitcherName: 'Tom Seaver' } },
  { label: 'Pitching Duel', subtitle: 'Old School Duel', home: { id: 138, name: 'Cardinals', season: 1968, pitcherId: 114756, pitcherName: 'Bob Gibson' }, away: { id: 119, name: 'Dodgers', season: 1963, pitcherId: 117277, pitcherName: 'Sandy Koufax' } },
  { label: "Big Red Machine vs Murderer's Row", subtitle: "You've waited long enough.", home: { id: 147, name: 'Yankees', season: 1927, pitcherId: 116241, pitcherName: 'Waite Hoyt' }, away: { id: 113, name: 'Reds', season: 1975, pitcherId: 115239, pitcherName: 'Don Gullett' } },
  { label: 'Battle for The Bottom', subtitle: 'Worst of the Worst', home: { id: 145, name: 'White Sox', season: 2024, pitcherId: 676979, pitcherName: 'Garrett Crochet' }, away: { id: 121, name: 'Mets', season: 1962, pitcherId: 112783, pitcherName: 'Roger Craig' } },
  // The Apex Duel: Pedro (1.74 ERA in 2000) vs Koufax (2.04 ERA in 1965).
  // Has a pre-game banner (apexDuelBanner) and a low-scoring _outcomeFilter (_applyApexDuelFilter).
  { label: 'The Apex Duel', subtitle: 'Two of the greatest arms ever. Low runs guaranteed.', home: { id: 111, name: 'Red Sox', season: 2000, pitcherId: 118377, pitcherName: 'Pedro Martinez' }, away: { id: 119, name: 'Dodgers', season: 1965, pitcherId: 117277, pitcherName: 'Sandy Koufax' } },
]

const premiumFantasyMatchups = [
  { label: 'Subway Series', subtitle: "New York's Finest", home: { id: 147, name: 'Yankees', season: 1998, pitcherId: 112388, pitcherName: 'Roger Clemens' }, away: { id: 121, name: 'Mets', season: 1969, pitcherId: 121961, pitcherName: 'Tom Seaver' } },
  { label: 'Rookie Dual', subtitle: 'Fernando Valenzuela vs Albert Pujols', home: { id: 138, name: 'Cardinals', season: 2001, pitcherId: 119403, pitcherName: 'Matt Morris' }, away: { id: 119, name: 'Dodgers', season: 1981, pitcherId: 123619, pitcherName: 'Fernando Valenzuela' } },
  { label: 'Bay Bridge Series', subtitle: 'Bash Brothers vs Say Hey Kid', home: { id: 137, name: 'Giants', season: 1962, pitcherId: 118283, pitcherName: 'Juan Marichal' }, away: { id: 133, name: 'Athletics', season: 1989, pitcherId: 122775, pitcherName: 'Dave Stewart' } },
  { label: 'Freeway Series', subtitle: 'SoCal Battle between Gwynn and Nolan Ryan', home: { id: 135, name: 'Padres', season: 1984, pitcherId: 122197, pitcherName: 'Eric Show' }, away: { id: 108, name: 'Angels', season: 1979, pitcherId: 121597, pitcherName: 'Nolan Ryan' } },
  { label: '116', subtitle: 'Tied for Most Wins', home: { id: 112, name: 'Cubs', season: 1906, pitcherId: 111577, pitcherName: 'Mordecai Brown' }, away: { id: 136, name: 'Mariners', season: 2001, pitcherId: 114587, pitcherName: 'Freddy Garcia' } },
  { label: 'Cursed/Blessed', subtitle: 'One curse closes, another one opens', home: { id: 111, name: 'Red Sox', season: 2004, pitcherId: 121811, pitcherName: 'Curt Schilling' }, away: { id: 120, name: 'Expos', season: 1994, pitcherId: 118377, pitcherName: 'Pedro Martinez' } },
  { label: 'Moneyball vs Big Spenders', subtitle: 'Small Budget, Big Dreams', home: { id: 133, name: 'Athletics', season: 2002, pitcherId: 217096, pitcherName: 'Barry Zito' }, away: { id: 140, name: 'Rangers', season: 2023, pitcherId: 453286, pitcherName: 'Max Scherzer' } },
  { label: 'The Revenge Match', subtitle: 'Pirates Beat Orioles 1971 WS', home: { id: 110, name: 'Orioles', season: 1971, pitcherId: 120196, pitcherName: 'Jim Palmer' }, away: { id: 134, name: 'Pirates', season: 1979, pitcherId: 111952, pitcherName: 'John Candelaria' } },
  { label: 'North of the Border', subtitle: "Canada's Finest", home: { id: 141, name: 'Blue Jays', season: 1993, pitcherId: 115267, pitcherName: 'Juan Guzman' }, away: { id: 120, name: 'Expos', season: 1994, pitcherId: 118377, pitcherName: 'Pedro Martinez' } },
]

/**
 * Available pitch types for the pitching controls.
 * Each has a display label and a value string sent to the game engine API.
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

/** The away team's active player shown in the field layout (pitcher or batter depending on half-inning). */
const awayFieldPlayer = computed(() => {
  if (!game.value) return null
  if (game.value.is_top) {
    // Top of inning: away team is batting
    const lineup = game.value.away_lineup
    const idx = game.value.current_batter_index || 0
    return lineup?.[idx] || null
  }
  // Bottom of inning: away team is pitching
  return game.value.away_pitcher
})

/** The home team's active player shown in the field layout (pitcher or batter depending on half-inning). */
const homeFieldPlayer = computed(() => {
  if (!game.value) return null
  if (game.value.is_top) {
    // Top of inning: home team is pitching
    return game.value.home_pitcher
  }
  // Bottom of inning: home team is batting
  const lineup = game.value.home_lineup
  const idx = game.value.current_batter_index || 0
  return lineup?.[idx] || null
})

/** Fatigue percent/level for the away pitcher. */
const awayFatiguePercent = computed(() => Math.min(100, ((game.value?.away_pitch_count || 0) / 120) * 100))
const awayFatigueLevel = computed(() => {
  const pc = game.value?.away_pitch_count || 0
  if (pc >= 100) return 'gassed'
  if (pc >= 85) return 'tired'
  return 'fresh'
})

/** Fatigue percent/level for the home pitcher. */
const homeFatiguePercent = computed(() => Math.min(100, ((game.value?.home_pitch_count || 0) / 120) * 100))
const homeFatigueLevel = computed(() => {
  const pc = game.value?.home_pitch_count || 0
  if (pc >= 100) return 'gassed'
  if (pc >= 85) return 'tired'
  return 'fresh'
})

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
  if (teamId >= 1000) return `${import.meta.env.BASE_URL}negro-leagues-logo.svg`
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
  classicLabel.value = matchup.label || ''
  classicMatchupData.value = matchup
  selectedWeather.value = matchup.weather || 'clear'
  playerSide.value = 'home'
  fantasySidePreference.value = 'home'
  fantasySwapped.value = false
  teamSelected.value = matchup.home.id
  fantasyTeamId.value = matchup.home.id
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

  // Use hardcoded stadium from matchup if available, otherwise fetch
  if (matchup.stadium) {
    selectedVenue.value = matchup.stadium
    homeVenue.value = { id: null, name: matchup.stadium }
    awayVenue.value = null
  }

  try {
    // Fetch pitcher lists, era-appropriate team lists, and venues in parallel
    const fetches = [
      getTeamPitchers(matchup.home.id, matchup.home.season),
      getTeamPitchers(matchup.away.id, matchup.away.season),
      getAllTeams(matchup.home.season),
      getAllTeams(matchup.away.season),
    ]
    if (!matchup.stadium) {
      fetches.push(
        getTeamVenue(matchup.home.id, matchup.home.season),
        getTeamVenue(matchup.away.id, matchup.away.season),
      )
    }
    const [homePitchers, awayPitchers, hTeams, aTeams, ...venueResults] = await Promise.all(fetches)
    if (!matchup.stadium) {
      homeVenue.value = venueResults[0]
      awayVenue.value = venueResults[1]
      selectedVenue.value = venueResults[0]?.name || ''
    }
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

  // When entering step 3, default away season to the home team's season.
  // Premium users can then change it; free users cannot.
  if (step === 3) {
    selectedAwaySeason.value = selectedSeason.value
    selectedAwayEra.value = selectedEra.value
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

  // When entering step 5, fetch venue data for both teams
  if (step === 5) {
    setupStep.value = step
    const [hVenue, aVenue] = await Promise.all([
      getTeamVenue(teamSelected.value, selectedSeason.value),
      getTeamVenue(selectedOpponentId.value, selectedAwaySeason.value),
    ])
    homeVenue.value = hVenue
    awayVenue.value = aVenue
    selectedVenue.value = hVenue?.name || ''
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
/**
 * Whether the unified back button should be visible.
 * Hidden on the initial mode picker (step 1, no gameMode selected) and during gameplay.
 */
const showBackButton = computed(() => {
  if (game.value) return false
  if (setupStep.value === 1 && !gameMode.value) return false
  return true
})

/**
 * Unified back handler for all setup screens.
 * Handles mode pages (back to mode picker) and wizard steps (back to previous step).
 */
function handleBack() {
  // From a mode page (season/historic/fantasy) on step 1, return to mode picker
  if (setupStep.value === 1 && gameMode.value) {
    gameMode.value = null
    return
  }
  goBack()
}

/**
 * Fantasy matchup selection state.
 * fantasyTeamId tracks the team ID the player chose (stable across swaps).
 * fantasySidePreference tracks whether the player wants to bat as home or away.
 * fantasySwapped tracks whether data is currently swapped from the original matchup.
 */
const fantasyTeamId = ref(null)
const fantasySidePreference = ref('home')
const fantasySwapped = ref(false)

/**
 * Apply the fantasy team + side selection.
 * Uses the original matchup data to determine whether a swap is needed,
 * and tracks swap state to avoid double-swapping.
 */
function applyFantasySelection() {
  if (!fantasyTeamId.value || !classicMatchupData.value) return
  const matchup = classicMatchupData.value
  const teamIsOriginallyHome = fantasyTeamId.value === matchup.home.id
  const wantsHome = fantasySidePreference.value === 'home'

  // Need swap when the team's original side doesn't match the preferred side
  const needsSwap = (teamIsOriginallyHome && !wantsHome) || (!teamIsOriginallyHome && wantsHome)

  if (needsSwap && !fantasySwapped.value) {
    swapHomeAway()
    fantasySwapped.value = true
  } else if (!needsSwap && fantasySwapped.value) {
    swapHomeAway()
    fantasySwapped.value = false
  }

  playerSide.value = fantasySidePreference.value
}

/**
 * Swap home and away team data in all refs.
 * Exchanges team IDs, seasons, pitcher IDs, pitcher lists, venues, and team lists.
 */
function swapHomeAway() {
  const tmpTeam = teamSelected.value
  teamSelected.value = selectedOpponentId.value
  selectedOpponentId.value = tmpTeam

  const tmpSeason = selectedSeason.value
  selectedSeason.value = selectedAwaySeason.value
  selectedAwaySeason.value = tmpSeason

  const tmpPitcher = selectedPitcherId.value
  selectedPitcherId.value = selectedAwayPitcherId.value
  selectedAwayPitcherId.value = tmpPitcher

  const tmpPitcherList = pitcherList.value
  pitcherList.value = awayPitcherList.value
  awayPitcherList.value = tmpPitcherList

  const tmpVenue = homeVenue.value
  homeVenue.value = awayVenue.value
  awayVenue.value = tmpVenue

  const tmpTeams = homeTeams.value
  homeTeams.value = awayTeams.value
  awayTeams.value = tmpTeams

  selectedVenue.value = homeVenue.value?.name || ''
}

function goBack() {
  if (classicMode.value && setupStep.value === 5) {
    classicMode.value = false
    classicLabel.value = ''
    classicMatchupData.value = null
    teamSelected.value = null
    setupStep.value = 1
  } else if (setupStep.value === 2) {
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
 * to the game engine, which returns the initial game state.
 *
 * If called without any team selection (the "Skip" path), createNewGame
 * receives undefined values and the game engine assigns random teams.
 */
/** Dock Ellis screen melt transition state */
const ellisMelting = ref(false)
const ellisFadeIn = ref(false)

function _ellistMeltTransition(assignGame) {
  return new Promise(resolve => {
    if (!isDockEllis.value) { assignGame(); resolve(); return }
    ellisMelting.value = true
    setTimeout(() => {
      assignGame()
      ellisMelting.value = false
      ellisFadeIn.value = true
      setTimeout(() => { ellisFadeIn.value = false; resolve() }, 1800)
    }, 3500)
  })
}

/**
 * Dock Ellis no-hitter filter: makes Ellis nearly unhittable through 7 innings,
 * then slowly lets hits creep in. Converts hits to outs through the 7th,
 * then ramps hit probability up from innings 8-9 to keep it close.
 */
function _applyEllisNoHitter(state) {
  const hitTypes = new Set(['single', 'double', 'triple', 'homerun'])
  const outReplacements = ['groundout', 'flyout', 'lineout', 'groundout', 'flyout']
  state._outcomeFilter = (st, outcome) => {
    if (!hitTypes.has(outcome)) return outcome
    // Only suppress hits when Ellis is pitching (top of inning = away team at bat)
    if (!st.is_top) return outcome
    // Through 7 innings: almost unhittable (5% chance a hit sneaks through)
    if (st.inning <= 7) {
      return Math.random() < 0.05 ? outcome : outReplacements[Math.floor(Math.random() * outReplacements.length)]
    }
    // Inning 8: hits start getting through more (~30% pass)
    if (st.inning === 8) {
      return Math.random() < 0.30 ? outcome : outReplacements[Math.floor(Math.random() * outReplacements.length)]
    }
    // Inning 9+: tense — ~45% of hits pass through, making it close
    return Math.random() < 0.45 ? outcome : outReplacements[Math.floor(Math.random() * outReplacements.length)]
  }
}

/**
 * Apex Duel outcome filter — makes Pedro vs Koufax a low-scoring pitchers' duel.
 *
 * Applied to state._outcomeFilter so the game engine calls it on every at-bat.
 * Aggressively downgrades extra-base hits and converts some singles to outs.
 * Typical result: 0–2 runs per team, frequent extra-inning games.
 *
 * Conversion rates:
 *   HR  → 85% become outs, 15% become singles (almost no homers)
 *   3B  → 80% become doubles, 20% become singles
 *   2B  → 70% become singles, 30% stay doubles
 *   1B  → 40% become outs, 60% stay singles
 *   Outs, walks, strikeouts → unchanged
 */
function _applyApexDuelFilter(state) {
  const outReplacements = ['groundout', 'flyout', 'lineout', 'groundout', 'flyout']
  state._outcomeFilter = (st, outcome) => {
    if (outcome === 'homerun') {
      return Math.random() < 0.15 ? 'single' : outReplacements[Math.floor(Math.random() * outReplacements.length)]
    }
    if (outcome === 'triple') {
      return Math.random() < 0.20 ? 'single' : 'double'
    }
    if (outcome === 'double') {
      return Math.random() < 0.30 ? outcome : 'single'
    }
    if (outcome === 'single') {
      return Math.random() < 0.40 ? outReplacements[Math.floor(Math.random() * outReplacements.length)] : outcome
    }
    return outcome
  }
}

/**
 * Dismiss the Apex Duel pre-game banner and resume the pending action.
 * The banner is shown when the user clicks "Play Ball!" or "Simulate" —
 * we stash which action they chose in apexDuelPendingAction, show the
 * banner, and then call the real startGame/startSimulation here.
 */
function dismissApexDuel() {
  apexDuelBanner.value = false
  if (apexDuelPendingAction === 'play') {
    apexDuelPendingAction = null
    startGame()
  } else if (apexDuelPendingAction === 'simulate') {
    apexDuelPendingAction = null
    startSimulation()
  }
}

async function startGame() {
  // Apex Duel: intercept first call to show the pre-game banner.
  // dismissApexDuel() will call startGame() again after the user clicks "Let's Go".
  if (isApexDuel.value && !apexDuelBanner.value) {
    apexDuelPendingAction = 'play'
    apexDuelBanner.value = true
    return
  }
  loading.value = true
  try {
    const newGame = await createNewGame({
      homeTeamId: resolvedHomeTeamId.value,
      season: resolvedHomeSeason.value,
      homePitcherId: resolvedHomePitcherId.value,
      awayTeamId: resolvedAwayTeamId.value,
      awaySeason: resolvedAwaySeason.value,
      awayPitcherId: resolvedAwayPitcherId.value,
      weather: selectedWeather.value,
      timeOfDay: selectedTimeOfDay.value,
      playerSide: playerSide.value,
    })
    if (isDockEllis.value) _applyEllisNoHitter(newGame)
    if (isApexDuel.value) _applyApexDuelFilter(newGame)
    await _ellistMeltTransition(() => { game.value = newGame })
  } finally {
    loading.value = false
  }
}

/**
 * Create a game and immediately simulate the entire thing on the game engine.
 *
 * SIMULATION REPLAY MECHANISM:
 * 1. Create the game (same as startGame)
 * 2. Call simulateGame() which runs every at-bat on the game engine
 * 3. Backend returns an array of "snapshots" — one game state per play
 * 4. Store snapshots in simSnapshots ref
 * 5. Show the first snapshot as the current game state
 * 6. Start a setInterval timer that advances to the next snapshot each tick
 * 7. When all snapshots have been shown, stop the timer
 *
 * This creates an animated replay of the full game, as if watching
 * the plays happen one by one, but without any network requests during playback.
 */
/**
 * Build classic reliever info from the matchup data.
 * If the winning/losing pitcher differs from the starter, that pitcher
 * is a reliever who should enter the game during simulation.
 */
function _buildClassicRelievers() {
  const m = classicMatchupData.value
  if (!m || !m.winningPitcher) return null
  const relievers = {}
  // If home starter isn't the winning or losing pitcher, the W or L pitcher was a home reliever
  if (m.home.pitcherName !== m.winningPitcher && m.home.pitcherName !== m.losingPitcher) {
    // Home starter got no decision — both W and L belong to away and another home pitcher
  }
  // Check if the winning pitcher is a home reliever (not the home starter)
  if (m.winningPitcher && m.winningPitcher !== m.home.pitcherName && m.winningPitcher !== m.away.pitcherName) {
    relievers.home = m.winningPitcher
  }
  if (m.losingPitcher && m.losingPitcher !== m.home.pitcherName && m.losingPitcher !== m.away.pitcherName) {
    relievers.home = relievers.home || m.losingPitcher
  }
  // Check if the winning pitcher is an away reliever (not the away starter)
  if (m.winningPitcher && m.winningPitcher !== m.away.pitcherName && m.winningPitcher !== m.home.pitcherName) {
    relievers.away = m.winningPitcher
  }
  if (m.losingPitcher && m.losingPitcher !== m.away.pitcherName && m.losingPitcher !== m.home.pitcherName) {
    relievers.away = relievers.away || m.losingPitcher
  }
  return (relievers.home || relievers.away) ? relievers : null
}

async function startSimulation() {
  // Apex Duel: intercept first call to show the pre-game banner (same pattern as startGame).
  if (isApexDuel.value && !apexDuelBanner.value) {
    apexDuelPendingAction = 'simulate'
    apexDuelBanner.value = true
    return
  }
  loading.value = true
  try {
    // Step 1: Create the game with the configured teams/pitchers
    const newGame = await createNewGame({
      homeTeamId: resolvedHomeTeamId.value,
      season: resolvedHomeSeason.value,
      homePitcherId: resolvedHomePitcherId.value,
      awayTeamId: resolvedAwayTeamId.value,
      awaySeason: resolvedAwaySeason.value,
      awayPitcherId: resolvedAwayPitcherId.value,
      weather: selectedWeather.value,
      timeOfDay: selectedTimeOfDay.value,
      classicRelievers: _buildClassicRelievers(),
      playerSide: playerSide.value,
    })
    // Dock Ellis: apply no-hitter filter for simulation too
    if (isDockEllis.value) _applyEllisNoHitter(newGame)
    // Apex Duel: apply low-scoring filter for simulation too
    if (isApexDuel.value) _applyApexDuelFilter(newGame)
    // Aaron 715 hook: force HR on his 2nd PA during simulation
    if (classicLabel.value === "Hank Aaron's 715th Home Run") {
      newGame._prePitchHook = (st) => {
        if (st.is_top) return
        const aaronIdx = st.home_lineup?.findIndex(b => b.name && b.name.includes('Hank Aaron'))
        if (aaronIdx === -1 || aaronIdx == null) return
        const currentIdx = st.home_batter_idx % st.home_lineup.length
        if (currentIdx !== aaronIdx) return
        const box = st.home_box_score?.[aaronIdx]
        if (!box) return
        const pa = (box.ab || 0) + (box.bb || 0)
        if (pa === 1) st._forceNextOutcome = 'homerun'
      }
    }
    // Called Shot hook: force HR on Ruth's 3rd PA during simulation
    if (classicLabel.value === "Babe Ruth's Called Shot") {
      newGame._prePitchHook = (st) => {
        if (!st.is_top) return
        const ruthIdx = st.away_lineup?.findIndex(b => b.name && /\bRuth\b/i.test(b.name))
        if (ruthIdx === -1 || ruthIdx == null) return
        const currentIdx = (st.away_batter_idx || 0) % st.away_lineup.length
        if (currentIdx !== ruthIdx) return
        const box = st.away_box_score?.[ruthIdx]
        if (!box) return
        const pa = (box.ab || 0) + (box.bb || 0)
        if (pa === 2 && st.balls === 0 && st.strikes === 0) st._forceNextOutcome = 'homerun'
      }
    }
    // Step 2: Run the full simulation locally
    const result = simulateGame(newGame)
    // Step 3: Store the snapshot array for replay
    simSnapshots.value = result.snapshots || []
    simReplayIndex.value = 0
    simulating.value = true
    // Step 4: Show the first snapshot merged with the initial game state via melt transition
    await _ellistMeltTransition(() => {
      if (simSnapshots.value.length > 0) {
        game.value = { ...newGame, ...simSnapshots.value[0] }
      }
    })
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
      simulating.value = false; simPaused.value = false  // Exit simulation mode
      return
    }
    // Merge the next snapshot into the current game state.
    // Spread operator preserves fields that don't change between snapshots
    // (like team names, lineup arrays, etc.) while updating the ones that do
    // (score, bases, count, play_log, etc.).
    const snap = simSnapshots.value[simReplayIndex.value]
    game.value = { ...game.value, ...snap }
    // Pause simulation for Called Shot cinematic on Ruth's 3rd PA
    if (classicLabel.value === "Babe Ruth's Called Shot" && !calledShotShown) {
      const ruthIdx = game.value.away_lineup?.findIndex(b => b.name && /\bRuth\b/i.test(b.name))
      if (ruthIdx >= 0) {
        const box = snap.away_box_score?.[ruthIdx]
        if (box) {
          const pa = (box.ab || 0) + (box.bb || 0)
          if (pa >= 2) {
            stopReplayTimer()
            _startCalledShot(null)
            return
          }
        }
      }
    }
    // Pause simulation for Aaron 715 announcement
    if (classicLabel.value === "Hank Aaron's 715th Home Run" && !aaronVideoOpened.value) {
      const aaronIdx = game.value.home_lineup?.findIndex(b => b.name && b.name.includes('Hank Aaron'))
      if (aaronIdx >= 0) {
        const box = snap.home_box_score?.[aaronIdx]
        if (box && box.hr >= 1) {
          stopReplayTimer()
          _triggerAaron715()
          return
        }
      }
    }
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
function toggleSimPause() {
  if (simPaused.value) {
    simPaused.value = false
    startReplayTimer()
  } else {
    simPaused.value = true
    stopReplayTimer()
  }
}

function setSimSpeed(ms) {
  simSpeed.value = ms
  // Only restart the timer if a simulation is currently running
  if (simulating.value && !simPaused.value) {
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
  simulating.value = false; simPaused.value = false
  if (simSnapshots.value.length > 0) {
    // Jump to the very last snapshot
    simReplayIndex.value = simSnapshots.value.length - 1
    game.value = { ...game.value, ...simSnapshots.value[simReplayIndex.value] }
  }
}

/**
 * Stop the simulation and let the user take over playing interactively.
 * Freezes the game at the current snapshot and switches to interactive mode.
 */
function takeOverGame() {
  stopReplayTimer()
  simulating.value = false; simPaused.value = false
  simSnapshots.value = []
  // The current game.value already reflects the snapshot state.
  // Add a play log entry so the user knows what happened.
  if (game.value) {
    const msg = '--- You take over! ---'
    game.value.play_log.push(msg)
    game.value.last_play = msg
    game.value = { ...game.value }
  }
}

/**
 * Clean up the replay timer when the component is unmounted.
 * Prevents memory leaks from orphaned setInterval timers
 * if the user navigates away during a simulation.
 */
function _handleDoOverShortcut(e) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
    e.preventDefault()
    showDoOver.value = !showDoOver.value
  }
}

onUnmounted(() => {
  stopReplayTimer()
  if (ellisInterval) { clearInterval(ellisInterval); ellisInterval = null }
  window.removeEventListener('keydown', _handleDoOverShortcut)
})

/**
 * Reset all game and wizard state to return to the initial landing screen.
 * Called from the "New Game" button on the game-over overlay.
 *
 * Resets every single ref to its initial value so the user gets a
 * completely fresh experience without any leftover state from the
 * previous game.
 */
function showPostGame(view) {
  gameOverDismissed.value = true
  showScorecard.value = view === 'scorecard'
}

async function resetGame() {
  gameOverDismissed.value = false
  showDiscoVideo.value = false
  showEllisNoNo.value = false
  calledShotActive.value = false
  calledShotHRBanner.value = false
  apexDuelBanner.value = false
  apexDuelPendingAction = null
  calledShotShown = false
  calledShotPendingPitch = null
  calledShotPendingAction = null
  gameMode.value = null
  playerSide.value = 'home'
  fantasyTeamId.value = null
  fantasySidePreference.value = 'home'
  fantasySwapped.value = false
  stopReplayTimer()
  simulating.value = false; simPaused.value = false
  simSnapshots.value = []
  simReplayIndex.value = 0
  classicMode.value = false
  classicLabel.value = ''
  classicMatchupData.value = null
  game.value = null
  setupStep.value = 1
  teamSelected.value = null
  selectedSeason.value = 2025
  selectedEra.value = allEras[allEras.length - 1]
  selectedAwayEra.value = allEras[allEras.length - 1]
  pitcherList.value = []
  selectedPitcherId.value = null
  selectedOpponentId.value = null
  selectedAwaySeason.value = 2025
  awayPitcherList.value = []
  selectedAwayPitcherId.value = null
  selectedWeather.value = 'clear'
  selectedTimeOfDay.value = 'day'
  selectedVenue.value = ''
  homeVenue.value = null
  awayVenue.value = null
  awayTeams.value = []
  loadingHomeTeams.value = false
  loadingAwayTeams.value = false
  warmingUp.value = {}
  // Re-fetch teams for default season
  homeTeams.value = await getAllTeams(2025)
}

// ============================================================
// GAME ACTION FUNCTIONS
// ============================================================

/** Deep-clone the game state for Do Over snapshots */
const lastSnapshot = ref(null)
const showDoOver = ref(false)

function _saveSnapshot() {
  const g = game.value
  lastSnapshot.value = JSON.parse(JSON.stringify({
    ...g,
    _outcomeFilter: undefined,
  }))
  // Preserve the non-serializable filter
  if (g._outcomeFilter) lastSnapshot.value._outcomeFilter = g._outcomeFilter
}

function doOver() {
  if (!lastSnapshot.value) return
  game.value = lastSnapshot.value
  lastSnapshot.value = null
}

/**
 * Send a pitch to the game engine (used when the player is pitching).
 * Updates the game state with the pitch outcome (ball, strike, hit, etc.).
 *
 * @param {string} pitchType - One of 'fastball', 'curveball', 'slider', 'changeup'
 */
/**
 * After the engine processes a pitch/bat, check if an inning transition occurred.
 * If so, hold back the new-inning state and display the 3rd-out result first.
 * The banner timer will release the pending state when it's time.
 */
function _applyGameUpdate(prevInning, prevIsTop) {
  const st = game.value
  // Only freeze display for mid-game inning transitions, not game-over
  if (st.game_status === 'active' && (st.inning !== prevInning || st.is_top !== prevIsTop)) {
    // Inning changed — save the new state aside, show old state with 3rd-out play
    pendingNextInningState = { ...st }
    // Find the 3rd-out play (the entry before the "--- Top/Bottom ---" transition message)
    const log = st.play_log || []
    const lastPlay = log.length >= 2 ? log[log.length - 2] : st.last_play
    // Display the pre-transition view: old inning/half, 3rd-out message
    game.value = {
      ...st,
      inning: prevInning,
      is_top: prevIsTop,
      last_play: lastPlay,
    }
  } else {
    game.value = { ...st }
  }
}

function doPitch(pitchType) {
  // Babe Ruth's Called Shot: intercept on his 3rd PA
  if (!calledShotShown && _isCalledShotPA(game.value)) {
    _startCalledShot(pitchType)
    return
  }
  _saveSnapshot()
  _checkAaron715(game.value)
  const prevInning = game.value.inning
  const prevIsTop = game.value.is_top
  processPitch(game.value, pitchType)
  clearLeadoffs()
  _afterAaron715(game.value)
  for (const id in warmingUp.value) {
    warmingUp.value[id].pitches++
  }
  _applyGameUpdate(prevInning, prevIsTop)
}

/**
 * Send a batting action to the game engine (used when the player is batting).
 * Updates the game state with the at-bat outcome.
 *
 * @param {string} action - Either 'swing' (attempt to hit) or 'take' (let pitch pass)
 */
const aaronVideoOpened = ref(false)
const aaronAnnouncement = ref(false)
const showDiscoVideo = ref(false)
const showEllisNoNo = ref(false)

const inningBannerActive = ref(false)
const inningBannerData = ref(null)
const inningBannerExiting = ref(false)
let inningBannerTimer = null
let pendingNextInningState = null

// Show Disco Demolition video when that game ends
watch(() => game.value?.game_status, (status) => {
  if (status === 'final' && classicLabel.value === 'Disco Demolition Night') {
    showDiscoVideo.value = true
  }
  // Show Ellis no-hitter celebration when the game ends with 0 away hits
  if (status === 'final' && isDockEllis.value && game.value?.away_hits === 0) {
    showEllisNoNo.value = true
  }
})

function _checkAaron715(state) {
  if (!state || classicLabel.value !== "Hank Aaron's 715th Home Run") return
  // Aaron is on the home team — only trigger when home team is batting (bottom of inning)
  if (state.is_top) return
  // Find Hank Aaron in home lineup by name
  const aaronIdx = state.home_lineup?.findIndex(b => b.name && b.name.includes('Hank Aaron'))
  if (aaronIdx === -1 || aaronIdx == null) return
  const currentIdx = state.home_batter_idx % state.home_lineup.length
  if (currentIdx !== aaronIdx) return
  // Count plate appearances from box score (ab + bb = PA proxy)
  const box = state.home_box_score?.[aaronIdx]
  if (!box) return
  const pa = (box.ab || 0) + (box.bb || 0)
  if (pa === 1) {
    state._forceNextOutcome = 'homerun'
  }
}

function _triggerAaron715() {
  if (aaronVideoOpened.value) return
  aaronVideoOpened.value = true
  aaronAnnouncement.value = true
}

function _afterAaron715(state) {
  if (!state || classicLabel.value !== "Hank Aaron's 715th Home Run") return
  if (aaronVideoOpened.value) return
  const aaronIdx = state.home_lineup?.findIndex(b => b.name && b.name.includes('Hank Aaron'))
  if (aaronIdx === -1 || aaronIdx == null) return
  const box = state.home_box_score?.[aaronIdx]
  if (box && box.hr >= 1) _triggerAaron715()
}

function dismissAaronAnnouncement() {
  aaronAnnouncement.value = false
  if (simulating.value) startReplayTimer()
}

/**
 * Babe Ruth's Called Shot — two-phase cinematic on his 3rd plate appearance.
 *
 * Phase 1 (calledShotActive): Dramatic text sequence ("Ruth steps out…",
 *   "gestures toward center field…", etc.) with a "Throw the pitch" button.
 * Phase 2 (calledShotHRBanner): After the guaranteed HR resolves, shows
 *   "The Babe called his home run!" until the user clicks "Continue Game".
 *
 * Three code paths handle this depending on game mode:
 *   1. Simulation — pause replay, show Phase 1, then Phase 2, then resume
 *   2. Player batting as Ruth — stash the pending action, show Phase 1,
 *      force HR via _forceNextOutcome, show Phase 2
 *   3. Player pitching against Ruth — stash the pending pitch, show Phase 1,
 *      force HR via _outcomeFilter, show Phase 2
 */
const calledShotActive = ref(false)
const calledShotHRBanner = ref(false)
const calledShotMessages = [
  'Ruth steps out of the box...',
  'The Babe gestures toward center field.',
  'Ruth raises his bat toward the bleachers.',
  'The crowd jeers.',
  'Ruth points.',
]
const calledShotIndex = ref(0)
let calledShotPendingPitch = null
let calledShotShown = false

function _isCalledShotPA(state) {
  if (!state || classicLabel.value !== "Babe Ruth's Called Shot") return false
  if (!state.is_top) return false
  const ruthIdx = state.away_lineup?.findIndex(b => b.name && /\bRuth\b/i.test(b.name))
  if (ruthIdx === -1 || ruthIdx == null) return false
  const currentIdx = (state.away_batter_idx || 0) % state.away_lineup.length
  if (currentIdx !== ruthIdx) return false
  const box = state.away_box_score?.[ruthIdx]
  if (!box) return false
  const pa = (box.ab || 0) + (box.bb || 0)
  return pa === 2 && state.balls === 0 && state.strikes === 0
}

function _startCalledShot(pitchType) {
  calledShotShown = true
  calledShotPendingPitch = pitchType
  calledShotIndex.value = 0
  calledShotActive.value = true
  _advanceCalledShot()
}

function _advanceCalledShot() {
  if (calledShotIndex.value < calledShotMessages.length - 1) {
    setTimeout(() => {
      calledShotIndex.value++
      _advanceCalledShot()
    }, 2000)
  }
}

let calledShotPendingAction = null

function dismissCalledShot() {
  calledShotActive.value = false
  if (simulating.value) {
    // Show HR confirmation banner before resuming simulation
    calledShotHRBanner.value = true
    return
  } else if (calledShotPendingAction) {
    // Player is batting as Ruth — force HR and resolve at-bat
    game.value._forceNextOutcome = 'homerun'
    _saveSnapshot()
    processAtBat(game.value, calledShotPendingAction)
    calledShotPendingAction = null
    for (const id in warmingUp.value) {
      warmingUp.value[id].pitches++
    }
    game.value = { ...game.value }
    calledShotHRBanner.value = true
  } else {
    // Player is pitching against Ruth — force HR and resolve the pitch
    game.value._outcomeFilter = () => 'homerun'
    _saveSnapshot()
    processPitch(game.value, calledShotPendingPitch || 'fastball')
    game.value._outcomeFilter = null
    calledShotPendingPitch = null
    for (const id in warmingUp.value) {
      warmingUp.value[id].pitches++
    }
    game.value = { ...game.value }
    calledShotHRBanner.value = true
  }
}

/** Dismiss the Phase 2 "Babe called it!" banner and resume play. */
function dismissCalledShotHR() {
  calledShotHRBanner.value = false
  if (simulating.value) {
    startReplayTimer()
  }
}

/** Pending steal: set when the user clicks a steal button, resolved on next swing/take/bunt. */
const pendingSteal = ref(null)

/** Runner leadoff state: [1st, 2nd, 3rd] — true if that runner is leading off. */
const runnerLeadoffs = ref([false, false, false])

function toggleLeadoff(baseIdx) {
  runnerLeadoffs.value[baseIdx] = !runnerLeadoffs.value[baseIdx]
  runnerLeadoffs.value = [...runnerLeadoffs.value]
}

function clearLeadoffs() {
  runnerLeadoffs.value = [false, false, false]
}

function doBat(action) {
  // Babe Ruth's Called Shot: intercept when player is batting as Ruth
  if (!calledShotShown && _isCalledShotPA(game.value)) {
    calledShotShown = true
    calledShotPendingAction = action
    calledShotIndex.value = 0
    calledShotActive.value = true
    _advanceCalledShot()
    return
  }
  _saveSnapshot()
  _checkAaron715(game.value)
  const prevInning = game.value.inning
  const prevIsTop = game.value.is_top
  // Resolve pending steal before the at-bat
  if (pendingSteal.value != null) {
    attemptSteal(game.value, pendingSteal.value)
    pendingSteal.value = null
    // If caught stealing ended the half-inning, skip the at-bat
    if (game.value.game_status !== 'active' || game.value.player_role !== 'batting') {
      _applyGameUpdate(prevInning, prevIsTop)
      return
    }
  }
  processAtBat(game.value, action)
  clearLeadoffs()
  _afterAaron715(game.value)
  for (const id in warmingUp.value) {
    warmingUp.value[id].pitches++
  }
  _applyGameUpdate(prevInning, prevIsTop)
}

/**
 * Whether the "Steal" buttons should be visible (FREE — available to all users).
 * True when the player is batting and at least one runner can attempt a steal:
 *   - Runner on 1st with 2nd empty → can steal 2nd
 *   - Runner on 2nd with 3rd empty → can steal 3rd
 *   - Runner on 3rd → can steal home (very risky, ~30% success rate)
 */
const canSteal = computed(() => {
  if (!game.value || game.value.game_status !== 'active') return false
  if (game.value.player_role !== 'batting') return false
  const b = game.value.bases
  return (b[0] && !b[1]) || (b[1] && !b[2]) || b[2]
})

/**
 * Queue a steal attempt. The steal resolves when the user picks their
 * next batting action (swing/take/bunt), so they don't see the outcome
 * until the pitch plays out.
 */
function doSteal(baseIdx) {
  pendingSteal.value = baseIdx
}

/**
 * Can the player attempt a pickoff? Only when pitching with runners on base.
 */
const canPickoff = computed(() => {
  if (!game.value || game.value.game_status !== 'active') return false
  if (game.value.player_role !== 'pitching') return false
  const b = game.value.bases
  return b[0] || b[1] || b[2]
})

/**
 * Attempt a pickoff throw to a base. Unlike steals, no pitch is thrown —
 * the pickoff replaces the pitch (the pitcher threw to the base instead of home).
 */
function doPickoff(baseIdx) {
  _saveSnapshot()
  attemptPickoff(game.value, baseIdx, runnerLeadoffs.value[baseIdx])
  clearLeadoffs()
  game.value = { ...game.value }
}

/**
 * Switch from interactive play to simulation for the rest of the game.
 * Runs simulateGame on the current state and replays the snapshots.
 */
function simulateRest() {
  const result = simulateGame(game.value)
  simSnapshots.value = result.snapshots || []
  simReplayIndex.value = 0
  simulating.value = true
  if (simSnapshots.value.length > 0) {
    game.value = { ...game.value, ...simSnapshots.value[0] }
  }
  startReplayTimer()
}

/**
 * Handle the user selecting a relief pitcher from the bullpen modal.
 */
function startWarmup(pitcher) {
  warmingUp.value = { ...warmingUp.value, [pitcher.id]: { name: pitcher.name, pitches: 0 } }
}

function doSwitchPitcher(reliever) {
  // Only allow switching if pitcher has warmed up enough
  const wu = warmingUp.value[reliever.id]
  if (!wu || wu.pitches < WARMUP_PITCHES_NEEDED) return
  const side = myPrefix.value
  const idx = game.value[side + '_bullpen'].findIndex((p) => p.id === reliever.id)
  if (idx !== -1) game.value[side + '_bullpen'].splice(idx, 1)
  switchPitcher(game.value, side, reliever)
  // Remove the switched pitcher from warmup tracking
  const { [reliever.id]: _, ...rest } = warmingUp.value
  warmingUp.value = rest
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

      // Detect inning transition: the 3rd-out play is shown while
      // pendingNextInningState holds the real next-inning state.
      if (pendingNextInningState) {
        const pending = pendingNextInningState
        const m = pending.last_play.match(/^--- (Top|Bottom) of inning (\d+) ---$/)
        if (m) {
          const comingHalf = m[1]
          const comingInning = Number(m[2])
          const endedHalf = comingHalf === 'Top' ? 'Bottom' : 'Top'
          const endedInning = comingHalf === 'Top' ? comingInning - 1 : comingInning

          if (endedInning >= 1) {
            const ordinal = _ordinal(endedInning)
            const nextOrdinal = _ordinal(comingInning)

            // Show 3rd-out play for 2s, then banner, then release next inning
            clearTimeout(inningBannerTimer)
            inningBannerTimer = setTimeout(() => {
              inningBannerData.value = {
                endedHalf,
                endedInning: ordinal,
                comingHalf,
                comingInning: nextOrdinal,
                awayAbbr: pending.away_abbreviation || 'AWAY',
                homeAbbr: pending.home_abbreviation || 'HOME',
                awayTotal: pending.away_total,
                homeTotal: pending.home_total,
              }
              inningBannerExiting.value = false
              inningBannerActive.value = true

              clearTimeout(inningBannerTimer)
              inningBannerTimer = setTimeout(() => {
                inningBannerExiting.value = true
                setTimeout(() => {
                  inningBannerActive.value = false
                  inningBannerExiting.value = false
                  // Release the next-inning state
                  if (pendingNextInningState) {
                    game.value = { ...pendingNextInningState }
                    pendingNextInningState = null
                  }
                }, 500)
              }, 2400)
            }, 2000)
          }
        }
      }
    }
  }
)

function _ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function dismissInningBanner() {
  clearTimeout(inningBannerTimer)
  inningBannerActive.value = false
  inningBannerExiting.value = false
  if (pendingNextInningState) {
    game.value = { ...pendingNextInningState }
    pendingNextInningState = null
  }
}

// Auto-advance the outcome banner to the latest entry when new plays are logged
// Skip if we're holding back state for an inning transition
watch(
  () => game.value?.play_log?.length,
  (len) => {
    if (len && !pendingNextInningState) playLogIndex.value = len - 1
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
  window.addEventListener('keydown', _handleDoOverShortcut)
})

/** Whether a game is actively in progress (used by App.vue to hide the header). */
const isPlaying = computed(() => !!game.value)

/**
 * Expose properties to the parent (App.vue) via template ref:
 * - showBackButton: controls visibility of the back button in the header nav
 * - handleBack: navigates back one step in the setup wizard
 * - isPlaying: swaps nav tabs for home/volume buttons in the header
 * - resetGame: returns to the setup wizard
 * - soundMuted / onToggleSound: sound controls rendered in the header during gameplay
 */
defineExpose({ showBackButton, handleBack, isPlaying, resetGame, soundMuted, onToggleSound })

</script>

<style scoped>
/* ========== Root Container ========== */
/* position: relative is needed so the game-over overlay can use position: absolute
   to cover the entire game area */
.interactive-game {
  position: relative;
  font-family: 'Courier New', monospace;
  text-transform: uppercase;
  letter-spacing: 1px;
}

@keyframes screen-melt {
  0%   { transform: scaleY(1) scaleX(1) translateY(0) skewX(0deg); opacity: 1; filter: blur(0) saturate(1); border-radius: 0; }
  10%  { transform: scaleY(1) scaleX(1) translateY(2px) skewX(0.3deg); opacity: 1; filter: blur(0) saturate(1.5); }
  20%  { transform: scaleY(0.98) scaleX(1.01) translateY(5px) skewX(-0.5deg); opacity: 0.95; filter: blur(0.5px) saturate(2); }
  35%  { transform: scaleY(0.94) scaleX(1.03) translateY(15px) skewX(0.8deg); opacity: 0.9; filter: blur(1px) saturate(2.5) hue-rotate(10deg); }
  50%  { transform: scaleY(0.85) scaleX(1.06) translateY(35px) skewX(-0.5deg); opacity: 0.8; filter: blur(1.5px) saturate(3) hue-rotate(25deg); border-radius: 0 0 20px 20px; }
  65%  { transform: scaleY(0.7) scaleX(1.1) translateY(65px) skewX(1deg); opacity: 0.6; filter: blur(2px) saturate(3) hue-rotate(45deg); border-radius: 0 0 40px 40px; }
  80%  { transform: scaleY(0.45) scaleX(1.15) translateY(110px) skewX(-0.5deg); opacity: 0.35; filter: blur(3px) saturate(2) hue-rotate(60deg); border-radius: 0 0 60% 60%; }
  92%  { transform: scaleY(0.2) scaleX(1.2) translateY(160px) skewX(0deg); opacity: 0.15; filter: blur(4px) saturate(1) hue-rotate(80deg); border-radius: 0 0 80% 80%; }
  100% { transform: scaleY(0.05) scaleX(1.25) translateY(200px) skewX(0deg); opacity: 0; filter: blur(6px) saturate(0.5) hue-rotate(90deg); border-radius: 0 0 100% 100%; }
}

@keyframes screen-fade-in {
  0%   { opacity: 0; transform: translateY(30px); filter: blur(6px) hue-rotate(40deg); }
  40%  { opacity: 0.6; transform: translateY(12px); filter: blur(3px) hue-rotate(15deg); }
  100% { opacity: 1; transform: translateY(0); filter: blur(0) hue-rotate(0deg); }
}

.ellis-melting {
  animation: screen-melt 3.5s cubic-bezier(0.25, 0.1, 0.25, 1) forwards;
  transform-origin: bottom center;
  pointer-events: none;
  overflow: hidden;
}

.ellis-fade-in {
  animation: screen-fade-in 1.8s ease-out forwards;
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
/* ========== Mode Picker ========== */
.mode-picker {
  text-align: center;
  padding: 40px 20px;
  background: linear-gradient(rgba(15, 15, 35, 0.82), rgba(26, 26, 46, 0.92)), url('/baseball-bg.jpg') center/cover no-repeat;
  border-radius: 10px;
  min-height: 80vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.mode-picker-title {
  font-size: 24px;
  color: #e94560;
  margin-bottom: 24px;
}

.mode-picker-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  max-width: 700px;
  margin: 0 auto 24px auto;
}

.mode-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 16px 16px;
  background: #0f0f23;
  border: 1px solid #333;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
  color: #ccc;
}

.mode-card:hover {
  border-color: #e94560;
  background: #1a1a2e;
}

.mode-icon {
  font-size: 32px;
}

.mode-label {
  font-size: 16px;
  font-weight: bold;
  color: #fff;
}

.mode-desc {
  font-size: 12px;
  color: #888;
}

.back-to-modes {
  background: none;
  border: none;
  color: #888;
  font-size: 14px;
  cursor: pointer;
  padding: 4px 0;
  margin-bottom: 2px;
  font-family: 'Courier New', monospace;
}

.back-to-modes:hover {
  color: #e94560;
}

/* ========== Season Hero ========== */
.season-hero {
  text-align: center;
  padding: 6px 20px 4px;
  margin-bottom: 2px;
  background: linear-gradient(180deg, #1a1a2e 0%, transparent 100%);
  border-bottom: 1px solid #333;
}

.season-hero-title {
  font-size: 18px;
  color: #e94560;
  margin: 0 0 2px 0;
  letter-spacing: 1px;
}

.season-hero-sub {
  font-size: 14px;
  color: #aaa;
  margin: 0 0 4px 0;
}

.season-hero-loading {
  display: block;
  color: #888;
  font-size: 13px;
  margin-top: 8px;
}

.selected-year-label {
  text-align: center;
  font-size: 18px;
  font-weight: bold;
  color: #e94560;
  margin: 0 0 2px;
  letter-spacing: 1px;
}

.era-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  max-width: 640px;
  margin: 0 auto 2px;
}

.era-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 4px;
  background: #1a1a2e;
  border: 2px solid #333;
  border-radius: 8px;
  transition: border-color 0.15s, background 0.15s;
}

.era-card:hover {
  border-color: #666;
}

.era-card.selected {
  border-color: #e94560;
  background: #3a3a4a;
}

.era-label {
  font-size: 12px;
  font-weight: bold;
  color: #eee;
}

.era-select {
  background: transparent;
  color: #ccc;
  border: 1px solid #555;
  border-radius: 4px;
  padding: 4px 6px;
  font-size: 13px;
  cursor: pointer;
  width: 90%;
  text-align: center;
}

.era-card.selected .era-select {
  border-color: #e94560;
  color: #fff;
}

/* ========== Start Screen (Steps 2-6) ========== */
/* Common container for all wizard steps after step 1.
   Generous padding creates visual breathing room for the form elements. */
.start-screen {
  text-align: center;
  padding: 20px 20px;
  animation: fadeIn 0.35s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
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
  margin-bottom: 12px;
}

/* ========== Step Header (Back button + Step Label) ========== */
/* Flex row containing the back button and current step description */
.step-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-bottom: 10px;
}

/* Step label text (e.g., "Your Team: Yankees") — yellow for emphasis */
.step-label {
  color: #e94560;
  font-size: 16px;
  margin: 0;
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
  margin-bottom: 8px;
}

/* League header for opponent sections (same style as TeamSelector) */
.league-header {
  color: #e94560;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 2px;
  margin-bottom: 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid #333;
}

/* Responsive grid for opponent team cards */
.opponent-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 4px;
}

/* Individual opponent team card — same visual style as TeamSelector cards */
.opponent-card {
  background: #ffffff;
  border: 2px solid #ddd;
  border-radius: 6px;
  padding: 6px 4px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
}

/* Hover state: red border + slight lift */
.opponent-card:hover {
  border-color: #e94560;
  background: #f5f5f5;
  transform: translateY(-2px);
}

/* Selected state: persistent red border */
.opponent-card.selected {
  border-color: #e94560;
  background: #f5f5f5;
}

/* Opponent team abbreviation — yellow monospace to match team card style */
.opponent-logo {
  width: 28px;
  height: 28px;
  object-fit: contain;
  margin-bottom: 2px;
}

.opponent-abbr {
  font-size: 15px;
  font-weight: bold;
  color: #e94560;
  font-family: 'Courier New', monospace;
  margin-bottom: 1px;
}

/* Opponent team full name */
.opponent-name {
  font-size: 11px;
  color: #555;
  line-height: 1.1;
}

/* ========== Pitcher Selection (Steps 3 & 6) ========== */
/* Loading state message for pitcher API calls */
.pitcher-loading {
  color: #888;
  text-align: center;
  margin: 10px 0;
}

/* Container for the pitcher list with bottom margin before the Next button */
.pitcher-selection {
  margin-bottom: 12px;
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

/* Role tag (SP, RP, CL, etc.) next to pitcher names */
.pitcher-role-tag {
  display: inline-block;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 3px;
  background: #3a3a4a;
  color: #aaa;
  margin-left: 6px;
  vertical-align: middle;
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
  border: 2px solid #e94560;
  padding: 14px 40px;
  font-size: 20px;
  border-radius: 8px;
  cursor: pointer;
  font-weight: bold;
  transition: all 0.2s;
}

.scramble-text {
  display: inline-flex;
}

.scramble-letter {
  display: inline-block;
  transition: opacity 0.3s, transform 0.3s;
}

.letter-hidden {
  opacity: 0;
}

@keyframes letter-melt-anim {
  0%   { transform: translateY(0) scaleY(1); opacity: 1; }
  100% { transform: translateY(20px) scaleY(2); opacity: 0; }
}

@keyframes letter-fall-anim {
  0%   { transform: translateY(0) rotate(0deg); opacity: 1; }
  100% { transform: translateY(30px) rotate(25deg); opacity: 0; }
}

@keyframes letter-rise-anim {
  0%   { transform: translateY(15px); opacity: 0; }
  100% { transform: translateY(0); opacity: 1; }
}

.letter-melt {
  animation: letter-melt-anim 0.4s ease-in forwards;
}

.letter-fall {
  animation: letter-fall-anim 0.5s ease-in forwards;
}

.letter-rise {
  animation: letter-rise-anim 0.4s ease-out forwards;
}

/* Lighter red on hover for the primary button */
.play-btn:hover:not(:disabled) {
  background: #ff6b81;
  border-color: #ff6b81;
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
  align-items: flex-start;
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
  padding: 8px 6px;
  border-radius: 10px;
  transition: box-shadow 0.3s, background 0.3s;
}

.player-card.your-team {
  background: rgba(76, 175, 80, 0.1);
  box-shadow: 0 0 12px 4px rgba(76, 175, 80, 0.35);
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
  border-color: #e94560;
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
  color: #e94560;
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
  align-items: flex-start;
  justify-content: center;
  padding-top: 10%;
  z-index: 10;
  border-radius: 8px;
}

/* Card containing the game-over content, centered within the overlay */
.game-over-card {
  text-align: center;
  padding: 40px;
}

.aaron-overlay-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  width: 100%;
  max-width: 640px;
  margin: 0 auto;
}

.aaron-video {
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 10px;
  overflow: hidden;
}

.aaron-video iframe {
  width: 100%;
  height: 100%;
}

.aaron-card {
  text-align: center;
  padding: 20px;
}

.disco-blurb {
  text-align: center;
  color: #aaa;
  font-size: 14px;
  font-style: italic;
  margin-bottom: 10px;
}

.aaron-card h2 {
  font-size: 24px;
  color: #f0c040;
  line-height: 1.4;
  margin-bottom: 16px;
}

/* Dock Ellis no-hitter celebration */
.ellis-nono-card {
  text-align: center;
  padding: 40px 30px;
  background: radial-gradient(ellipse at center, #2a1a3e 0%, #1a1a2e 70%);
  border-radius: 16px;
  border: 2px solid #c084fc;
  max-width: 400px;
  animation: ellis-glow 2s ease-in-out infinite alternate;
}

.ellis-smiley {
  font-size: 120px;
  line-height: 1;
  margin-bottom: 20px;
  animation: ellis-wobble 3s ease-in-out infinite;
}

.ellis-message {
  font-size: 28px;
  color: #c084fc;
  margin-bottom: 24px;
  font-style: italic;
  line-height: 1.4;
}

@keyframes ellis-glow {
  from { box-shadow: 0 0 20px rgba(192, 132, 252, 0.3); }
  to { box-shadow: 0 0 40px rgba(192, 132, 252, 0.6), 0 0 80px rgba(192, 132, 252, 0.2); }
}

@keyframes ellis-wobble {
  0%, 100% { transform: rotate(-3deg) scale(1); }
  50% { transform: rotate(3deg) scale(1.05); }
}

/* The Apex Duel pre-game banner */
.apex-duel-card {
  text-align: center;
  padding: 40px 30px;
  background: linear-gradient(180deg, #0a1628 0%, #1a2744 50%, #0a1628 100%);
  border-radius: 16px;
  border: 2px solid #4a90d9;
  max-width: 440px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.apex-duel-title {
  font-size: 28px;
  color: #fff;
  margin: 0 0 24px 0;
  letter-spacing: 2px;
  text-transform: uppercase;
}

.apex-duel-pitcher {
  margin: 8px 0;
}

.apex-duel-name {
  font-size: 22px;
  font-weight: 700;
  color: #4a90d9;
}

.apex-duel-era {
  font-size: 18px;
  color: #e94560;
  font-weight: 600;
  margin: 2px 0;
}

.apex-duel-accolade {
  font-size: 13px;
  color: #aaa;
  font-style: italic;
  max-width: 300px;
}

.apex-duel-vs {
  font-size: 16px;
  color: #666;
  margin: 8px 0;
  text-transform: lowercase;
  font-style: italic;
}

.apex-duel-luck {
  font-size: 18px;
  color: #e94560;
  font-weight: 700;
  margin: 20px 0 8px 0;
  font-style: italic;
}

.apex-duel-btn {
  margin-top: 16px;
}

/* Babe Ruth's Called Shot — B&W Wrigley Field background */
.called-shot-bg {
  background: linear-gradient(rgba(10, 10, 10, 0.6), rgba(10, 10, 10, 0.7));
  border-radius: 8px;
}

/* Babe Ruth's Called Shot cinematic */
.called-shot-card {
  text-align: center;
  padding: 40px 30px;
  background: linear-gradient(180deg, #1a1a0a 0%, #2a2210 50%, #1a1a0a 100%);
  border-radius: 16px;
  border: 2px solid #c8a84e;
  max-width: 440px;
  min-height: 200px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.called-shot-line {
  font-size: 20px;
  color: #c8a84e;
  font-style: italic;
  line-height: 1.6;
  margin: 6px 0;
  opacity: 0;
  transform: translateY(8px);
  transition: opacity 0.8s ease, transform 0.8s ease;
}

.called-shot-line.visible {
  opacity: 1;
  transform: translateY(0);
}

.called-shot-hr-text {
  font-size: 24px;
  font-weight: bold;
  font-style: normal;
}

.called-shot-btn {
  margin-top: 24px;
  animation: fadeIn 0.6s ease forwards;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
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
  color: #e94560;
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

.game-over-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-bottom: 16px;
}

.new-game-btn {
  opacity: 0.7;
  font-size: 13px !important;
  padding: 8px 20px !important;
}

.new-game-btn:hover {
  opacity: 1;
}

.post-game-footer {
  text-align: center;
  margin-top: 24px;
  padding-bottom: 16px;
}

/* ========== Last Play Banner ========== */
/* ========== Interactive Controls (Pitch/Bat Buttons) ========== */
/* Container with vertical margin around the control buttons */
.controls {
  margin: 8px 0;
}

/* Instructional label above the control buttons (e.g., "You're Pitching") */
.mode-label {
  text-align: center;
  font-size: 14px;
  color: #aaa;
  margin-bottom: 4px;
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

/* Single-row action bar: pitch/bat buttons centered, sim button right */
.action-bar {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: center;
  position: relative;
}

.action-bar .sim-btn {
  position: absolute;
  right: 0;
}

.change-pitcher-action-btn {
  background: #3a3a4a;
  color: #e94560;
  border-color: #e94560;
}

.change-pitcher-action-btn:hover:not(:disabled) {
  background: #e94560;
  color: white;
}

.action-bar .change-pitcher-action-btn {
  position: absolute;
  left: 0;
}

/* Inverted (filled) button colors when pitching */
.action-bar.pitching .pitch-btn {
  background: #e94560;
  color: white;
  border-color: #e94560;
}

.action-bar.pitching .pitch-btn:hover:not(:disabled) {
  background: #3a3a4a;
  color: #e94560;
}

.pickoff-bar {
  display: flex;
  gap: 8px;
  justify-content: center;
  margin-top: 6px;
}

.pickoff-btn {
  background: #3a3a4a;
  color: #5b9bd5;
  border-color: #5b9bd5;
}

.pickoff-btn:hover:not(:disabled) {
  background: #5b9bd5;
  color: white;
}

.leadoff-bar {
  display: flex;
  gap: 8px;
  justify-content: center;
  margin-top: 6px;
}

.leadoff-btn {
  background: #3a3a4a;
  color: #8b8b8b;
  border-color: #8b8b8b;
}

.leadoff-btn:hover:not(:disabled) {
  background: #8b8b8b;
  color: white;
}

.leadoff-btn.active {
  background: #8b8b8b;
  color: white;
}

/* Base style for all action buttons (pitch types, swing, take, speed) */
.action-btn {
  padding: 8px 14px;
  font-size: 13px;
  font-weight: bold;
  border: 2px solid;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

/* Disabled action buttons: reduced opacity and blocked cursor */
.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* All action bar buttons share ghost style: dark bg, colored border+text, invert on hover */
.pitch-btn {
  background: #3a3a4a;
  color: #e94560;
  border-color: #e94560;
}

.pitch-btn:hover:not(:disabled) {
  background: #e94560;
  color: white;
}

.swing-btn {
  background: #3a3a4a;
  color: #e94560;
  border-color: #e94560;
}

.swing-btn:hover:not(:disabled) {
  background: #e94560;
  color: white;
}

.bunt-btn {
  background: #3a3a4a;
  color: #e94560;
  border-color: #e94560;
}

.bunt-btn:hover:not(:disabled) {
  background: #e94560;
  color: white;
}

.take-btn {
  background: #3a3a4a;
  color: #e94560;
  border-color: #e94560;
}

.take-btn:hover:not(:disabled) {
  background: #e94560;
  color: white;
}

.sim-btn {
  background: #3a3a4a;
  color: #e94560;
  border-color: #e94560;
}

.sim-btn:hover:not(:disabled) {
  background: #e94560;
  color: white;
}

.bullpen-controls-row {
  display: flex;
  justify-content: center;
  margin-top: 10px;
}

.bottom-ctrl-btn {
  background: #3a3a4a;
  color: #e94560;
  border: 2px solid #e94560;
  padding: 8px 16px;
  font-size: 13px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.bottom-ctrl-btn:hover:not(:disabled) {
  background: #e94560;
  color: white;
}

.doover-btn {
  display: block;
  margin: 10px auto 0;
  background: #3a3a4a;
  color: #e94560;
  border-color: #e94560;
}

.doover-btn:hover:not(:disabled) {
  background: #e94560;
  color: white;
}

.steal-group {
  margin-top: 8px;
}

.steal-btn {
  background: #3a3a4a;
  color: #e94560;
  border-color: #e94560;
  min-width: 110px;
  font-size: 13px;
  padding: 6px 14px;
}

.steal-btn:hover:not(:disabled) {
  background: #e94560;
  color: white;
}

.steal-pending-label {
  color: #ff9800;
  font-size: 13px;
  font-weight: 600;
  animation: pulse-steal 1s ease-in-out infinite;
}

@keyframes pulse-steal {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.cancel-steal {
  font-size: 12px;
  padding: 4px 10px;
  min-width: auto;
}

.pickoff-group {
  margin-top: 8px;
}

.pickoff-btn {
  background: #3a3a4a;
  color: #e94560;
  border-color: #e94560;
  min-width: 110px;
  font-size: 13px;
  padding: 6px 14px;
}

.pickoff-btn:hover:not(:disabled) {
  background: #e94560;
  color: white;
}

/* ========== Matchup Title ========== */
.matchup-title {
  text-align: center;
  font-size: 16px;
  font-weight: bold;
  color: #e94560;
  font-family: 'Courier New', monospace;
  letter-spacing: 1px;
  margin-bottom: 4px;
}

.matchup-date-line {
  display: none;
}

.classic-label {
  display: block;
  font-size: 13px;
  color: #ccc;
  font-weight: normal;
  letter-spacing: 0;
  margin-bottom: 2px;
}

/* ========== Score View Toggle ========== */
.score-view-toggle {
  display: flex;
  gap: 0;
  margin-top: 16px;
  margin-bottom: 0;
}

.score-view-toggle button {
  flex: 1;
  padding: 8px 16px;
  font-size: 13px;
  font-family: 'Courier New', monospace;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 1px;
  border: 1px solid #333;
  background: #0a0a1a;
  color: #666;
  cursor: pointer;
  transition: all 0.15s;
}

.score-view-toggle button:first-child {
  border-radius: 6px 0 0 6px;
}

.score-view-toggle button:last-child {
  border-radius: 0 6px 6px 0;
  border-left: none;
}

.score-view-toggle button.active {
  background: #1a1a2e;
  color: #e94560;
  border-color: #e94560;
}

.score-view-toggle button:hover:not(.active) {
  background: #111;
  color: #aaa;
}

.scorecard-section {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
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
  color: #e94560;
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
  color: #e94560;
  font-weight: bold;
}

/* ========== Simulation Controls ========== */
/* Container for the "Play Ball!" and "Simulate" buttons side by side */
.start-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
  margin-top: 16px;
}

/*
  Simulate button — darker background than "Play Ball!" to visually
  communicate that it's a secondary/alternative action.
  Red border keeps it connected to the app's color scheme.
*/
.simulate-btn {
  background: transparent;
  color: #e94560;
  border: 2px solid #e94560;
}

.simulate-btn:hover:not(:disabled) {
  background: #e94560;
  color: white;
}

/* Margin around the simulation speed controls during replay */
.sim-controls {
  margin: 8px 0;
}

/* Tape deck transport controls */
.tape-deck {
  display: flex;
  justify-content: center;
  gap: 4px;
  background: #1a1a1a;
  border: 2px solid #444;
  border-radius: 10px;
  padding: 8px 12px;
  box-shadow: inset 0 2px 6px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.05);
}

.deck-btn {
  background: #2a2a2a;
  color: #ccc;
  border: 1px solid #555;
  border-radius: 4px;
  width: 48px;
  height: 40px;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 0 #111;
  letter-spacing: -2px;
}

.deck-btn:hover {
  background: #3a3a3a;
  color: #fff;
}

.deck-btn:active {
  box-shadow: none;
  transform: translateY(1px);
}

.deck-btn.active {
  background: #e94560;
  color: #fff;
  border-color: #e94560;
  box-shadow: 0 0 8px rgba(233, 69, 96, 0.4);
}

.deck-pause {
  position: relative;
  gap: 3px;
}

.deck-pause::before,
.deck-pause::after {
  content: '';
  display: block;
  width: 4px;
  height: 14px;
  background: #ccc;
  border-radius: 1px;
}

.deck-pause:hover::before,
.deck-pause:hover::after {
  background: #fff;
}

.deck-pause.active::before,
.deck-pause.active::after {
  background: #fff;
}

.deck-stop {
  position: relative;
}

.deck-stop::after {
  content: '';
  display: block;
  width: 14px;
  height: 14px;
  background: #e94560;
  clip-path: polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%);
}

.deck-stop:hover::after {
  background: #fff;
}

.deck-takeover {
  color: #4caf50;
  border-color: #4caf50;
  font-size: 14px;
  font-weight: bold;
  letter-spacing: -1px;
}

.deck-takeover:hover {
  background: #4caf50;
  color: #0a0a1a;
}

/* ========== Classic Matchups Section ========== */
/* Container for the classic matchups grid on step 1.
   Top border separates it from the team selector above. */
.classic-matchups {
  margin-top: 12px;
  padding: 12px 16px;
  border-top: 1px solid #333;
}

/* "Classic Matchups" heading — yellow uppercase to match league headers */
.classic-header {
  color: #e94560;
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
  padding: 4px;
}

/* Individual matchup card — left-aligned text for readability of longer labels */
.matchup-card {
  position: relative;
  background: #ffffff;
  border: 2px solid #ddd;
  border-radius: 8px;
  padding: 12px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
  color: #222;
}

.matchup-number {
  position: absolute;
  top: 6px;
  right: 8px;
  font-size: 11px;
  font-weight: bold;
  color: #999;
}

/* Matchup card hover: red border + subtle lift */
.matchup-card:hover {
  border-color: #e94560;
  background: #f5f5f5;
  transform: translateY(-1px);
}

/* Unlock section below matchup grids — silver separator divides free content from upgrade CTA */
.unlock-section {
  max-width: 420px;
  margin: 18px auto 0;
  padding-top: 16px;
  border-top: 1px solid #888;
  text-align: center;
}

.unlock-code-row {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.unlock-input {
  flex: 1;
  padding: 10px 12px;
  border: 2px solid #ccc;
  border-radius: 8px;
  font-size: 0.95rem;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
}

.unlock-input:focus {
  border-color: #d4a017;
}

.unlock-submit {
  padding: 10px 18px;
  background: linear-gradient(135deg, #d4a017, #f0c040);
  color: #1a1a2e;
  font-weight: 700;
  font-size: 0.95rem;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
}

.unlock-submit:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(212, 160, 23, 0.4);
}

.unlock-error {
  color: #e94560;
  font-size: 0.85rem;
  margin: 0 0 8px;
}

.unlock-btn {
  display: block;
  max-width: 420px;
  margin: 0 auto;
  padding: 14px 20px;
  background: linear-gradient(135deg, #d4a017, #f0c040);
  color: #1a1a2e;
  font-weight: 700;
  font-size: 1.05rem;
  text-align: center;
  text-decoration: none;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(212, 160, 23, 0.35);
  transition: transform 0.15s, box-shadow 0.15s;
}

.unlock-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 14px rgba(212, 160, 23, 0.5);
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
  color: #888;
  text-transform: uppercase;
}

.matchup-label {
  font-size: 13px;
  font-weight: bold;
  color: #e94560;
  margin-bottom: 2px;
}

.matchup-wiki {
  color: #e94560;
  text-decoration: underline;
  text-decoration-style: dotted;
  text-underline-offset: 2px;
}

.matchup-wiki:hover {
  color: #ff6b81;
}

.matchup-subtitle {
  font-size: 11px;
  color: #777;
  font-style: italic;
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
  color: #e94560;
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
  color: #e94560;
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
  height: 6px;
  background: #333;
  border-radius: 3px;
  margin-top: 4px;
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

.fatigue-label {
  font-size: 9px;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 1px;
  text-align: center;
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
  transition: all 0.2s;
  text-align: left;
  font-size: 14px;
  gap: 10px;
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

/* ========== Warmup System ========== */
.bullpen-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.warmup-status {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.warmup-bar {
  width: 60px;
  height: 4px;
  background: #333;
  border-radius: 2px;
  overflow: hidden;
}

.warmup-fill {
  height: 100%;
  background: #4caf50;
  border-radius: 2px;
  transition: width 0.3s;
}

.warmup-tally {
  font-size: 11px;
  color: #aaa;
  white-space: nowrap;
}

.warmup-start-btn {
  background: #3a3a4a;
  color: #4caf50;
  border: 1px solid #4caf50;
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
  flex-shrink: 0;
}

.warmup-start-btn:hover {
  background: #4caf50;
  color: #0a0a1a;
}

.bullpen-ready-btn {
  background: #4caf50;
  color: #fff;
  border: none;
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  font-weight: bold;
  transition: all 0.2s;
  flex-shrink: 0;
}

.bullpen-ready-btn:hover {
  background: #66bb6a;
}

.warmup-indicator {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
  margin-top: 8px;
  cursor: pointer;
}

.warmup-chip {
  background: #2a2a3a;
  border: 1px solid #4caf50;
  color: #4caf50;
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 11px;
  white-space: nowrap;
}

/* ========== Mobile Responsive ========== */
@media (max-width: 600px) {
  .venue-label {
    display: none;
  }

  .game-container {
    display: flex;
    flex-direction: column;
  }

  .matchup-date-line {
    display: block;
    font-size: 13px;
    color: #ccc;
    font-weight: normal;
  }

  .matchup-title:has(.matchup-date-line) .matchup-teams-line {
    display: none;
  }

  .game-container .controls,
  .game-container .sim-controls {
    order: 1;
  }

  .game-container .field-layout {
    order: 2;
  }

  .game-container .score-view-toggle,
  .game-container .scorecard-section,
  .game-container .box-score-section {
    order: 3;
  }

  /* Tighter padding on wizard screens */
  .start-screen {
    padding: 16px 10px;
  }

  /* Stack field layout vertically and center everything */
  .field-layout {
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .player-card {
    flex-direction: row;
    justify-content: center;
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
    padding: 6px 10px;
    font-size: 12px;
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
    grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
    gap: 4px;
  }

  .opponent-card {
    padding: 4px 2px;
  }

  /* Matchup grid: single column on small screens */
  .matchup-grid {
    grid-template-columns: 1fr;
  }

  .mode-picker-grid {
    grid-template-columns: 1fr;
  }

  /* Speed buttons: smaller */
  .deck-btn {
    width: 40px;
    height: 34px;
    font-size: 13px;
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

  /* Move Change Pitcher and Start Sim to their own row on mobile */
  .action-bar {
    flex-wrap: wrap;
    position: static;
  }

  .action-bar .sim-btn,
  .action-bar .change-pitcher-action-btn {
    position: static;
    order: 10;
  }
}

/* ========== Weather Picker (Step 5) ========== */
.weather-selection {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 16px auto 16px;
  padding: 0 16px;
}

.weather-selection p {
  margin-bottom: 8px;
  font-weight: bold;
  color: #ccc;
  font-size: 15px;
}

.weather-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  max-width: 640px;
  width: 100%;
}

.weather-grid + .weather-grid {
  margin-top: 8px;
}

.weather-grid.tod-grid {
  grid-template-columns: repeat(3, 1fr);
}

.weather-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 8px;
  background: #1a1a2e;
  border: 2px solid #333;
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
  color: #ccc;
}

.weather-card:hover {
  border-color: #666;
  background: #1a1a2e;
}

.weather-card.selected {
  border-color: #e94560;
  background: #3a3a4a;
}

.weather-icon {
  font-size: 24px;
}

.weather-label {
  font-size: 13px;
  font-weight: bold;
  color: #eee;
}

/* Dock Ellis: slinky organic ripple animations on weather tiles */
@keyframes ellis-slink-1 {
  0%   { transform: scale(1) skewX(0deg) rotate(0deg); border-color: #333; }
  15%  { transform: scale(1.04) skewX(2deg) rotate(0.5deg); border-color: #9b59b6; }
  30%  { transform: scale(0.97) skewX(-1deg) rotate(-0.3deg); border-color: #e94560; }
  50%  { transform: scale(1.02) skewX(1.5deg) rotate(0.8deg); border-color: #ff6b9d; }
  65%  { transform: scale(0.98) skewX(-2deg) rotate(-0.5deg); border-color: #3498db; }
  80%  { transform: scale(1.03) skewX(0.5deg) rotate(0.2deg); border-color: #2ecc71; }
  100% { transform: scale(1) skewX(0deg) rotate(0deg); border-color: #333; }
}

@keyframes ellis-slink-2 {
  0%   { transform: scale(1) skewY(0deg) rotate(0deg); border-color: #444; }
  20%  { transform: scale(0.96) skewY(2.5deg) rotate(-1deg); border-color: #e74c3c; }
  40%  { transform: scale(1.05) skewY(-1deg) rotate(0.6deg); border-color: #f39c12; }
  60%  { transform: scale(0.98) skewY(1.5deg) rotate(-0.4deg); border-color: #8e44ad; }
  85%  { transform: scale(1.03) skewY(-2deg) rotate(0.7deg); border-color: #1abc9c; }
  100% { transform: scale(1) skewY(0deg) rotate(0deg); border-color: #444; }
}

@keyframes ellis-slink-3 {
  0%   { transform: scale(1) translate(0, 0) rotate(0deg); border-color: #333; }
  18%  { transform: scale(1.03) translate(2px, -1px) rotate(0.4deg); border-color: #e94560; }
  35%  { transform: scale(0.97) translate(-1px, 2px) rotate(-0.6deg); border-color: #3498db; }
  55%  { transform: scale(1.04) translate(1px, -2px) rotate(0.3deg); border-color: #f1c40f; }
  72%  { transform: scale(0.99) translate(-2px, 1px) rotate(-0.8deg); border-color: #9b59b6; }
  100% { transform: scale(1) translate(0, 0) rotate(0deg); border-color: #333; }
}

.ellis-ripple {
  animation: ellis-slink-1 12s ease-in-out infinite;
}

.ellis-ripple:nth-child(2) {
  animation: ellis-slink-2 10s ease-in-out infinite;
  animation-delay: 1.5s;
}

.ellis-ripple:nth-child(3) {
  animation: ellis-slink-3 14s ease-in-out infinite;
  animation-delay: 3s;
}

.ellis-ripple:nth-child(4) {
  animation: ellis-slink-2 13s ease-in-out infinite reverse;
  animation-delay: 0.8s;
}

.ellis-ripple .weather-icon {
  transition: none;
}

.ellis-disabled {
  opacity: 0.3;
  cursor: not-allowed !important;
  pointer-events: none;
}

.weather-detail {
  font-size: 11px;
  color: #888;
  text-align: center;
}

/* ========== Venue Picker (Step 5) ========== */
.venue-selection {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 0 auto;
  padding: 0 16px;
}

.venue-selection p {
  margin-bottom: 8px;
  font-weight: bold;
  color: #ccc;
  font-size: 15px;
}

.venue-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  max-width: 640px;
  width: 100%;
}

.venue-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 8px;
  background: #1a1a2e;
  border: 2px solid #333;
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
  color: #ccc;
}

.venue-card:hover {
  border-color: #666;
}

.venue-card.selected {
  border-color: #e94560;
  background: #3a3a4a;
}

.venue-name {
  font-size: 14px;
  font-weight: bold;
  color: #eee;
}

.venue-team {
  font-size: 12px;
  color: #ccc;
}

.venue-side-label {
  font-size: 11px;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #e94560;
}

/* ========== Venue Label (Active Game) ========== */
.venue-label {
  text-align: center;
  font-size: 13px;
  color: #999;
  font-family: 'Courier New', monospace;
  margin-bottom: 4px;
}

/* ========== Inline Weather (next to venue name) ========== */
.venue-weather {
  color: #bbb;
}

/* ========== Inning Transition Banner ========== */
@keyframes banner-enter {
  0% { opacity: 0; transform: translateY(20px); }
  100% { opacity: 1; transform: translateY(0); }
}

@keyframes banner-exit {
  0% { opacity: 1; }
  100% { opacity: 0; }
}

.inning-banner-overlay {
  cursor: pointer;
}

.inning-banner-overlay.banner-exiting {
  animation: banner-exit 0.5s ease-out forwards;
}

.inning-banner-card {
  text-align: center;
  padding: 32px 48px;
  animation: banner-enter 0.5s ease-out;
}

.inning-banner-card.banner-exiting {
  animation: banner-exit 0.5s ease-out forwards;
}

.inning-banner-ended {
  font-size: 20px;
  color: #ccc;
  margin: 0 0 16px;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.inning-banner-score {
  font-size: 32px;
  font-weight: bold;
  color: #fff;
  margin-bottom: 16px;
}

.inning-banner-dash {
  margin: 0 12px;
  color: #888;
}

.inning-banner-coming {
  font-size: 16px;
  color: #aaa;
  margin: 0;
}
</style>
