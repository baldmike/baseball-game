/**
 * FreePremiumGating.test.js — Tests for free vs premium feature gating.
 * Verifies season restrictions, opponent season locking, and upgrade CTA
 * visibility across the setup flow.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import InteractiveGame from '../InteractiveGame.vue'

vi.mock('../../services/mlbApi.js', () => ({
  getAllTeams: vi.fn(() => Promise.resolve([])),
  getTeamPitchers: vi.fn(() => Promise.resolve([])),
  getTeamVenue: vi.fn(() => Promise.resolve(null)),
}))

vi.mock('../../composables/useSoundEffects.js', () => ({
  useSoundEffects: () => ({
    playSound: vi.fn(),
    toggleMute: vi.fn(),
    isMuted: { value: false },
  }),
}))

beforeEach(() => {
  localStorage.clear()
})

function mountGame() {
  return shallowMount(InteractiveGame, {
    global: { stubs: { BaseballDiamond: true, Scoreboard: true, TeamSelector: true, Scorecard: true } },
  })
}

function mountPremiumGame() {
  localStorage.setItem('premiumUnlocked', 'true')
  return mountGame()
}

describe('Free vs Premium — Season Picker', () => {
  it('defaults to the most recent season (2025)', () => {
    const wrapper = mountGame()
    expect(wrapper.vm.selectedSeason).toBe(2025)
    expect(wrapper.vm.selectedAwaySeason).toBe(2025)
  })

  it('free user sees seasons from 2025 down to 2000 only (26 options)', async () => {
    const wrapper = mountGame()
    wrapper.vm.gameMode = 'season'
    await wrapper.vm.$nextTick()

    const options = wrapper.findAll('.season-hero-dropdown option')
    expect(options.length).toBe(26)
    expect(options[0].element.value).toBe('2025')
    expect(options[options.length - 1].element.value).toBe('2000')
  })

  it('premium user sees seasons from 2025 down to 1920 (106 options)', async () => {
    const wrapper = mountPremiumGame()
    wrapper.vm.gameMode = 'season'
    await wrapper.vm.$nextTick()

    const options = wrapper.findAll('.season-hero-dropdown option')
    expect(options.length).toBe(106)
    expect(options[0].element.value).toBe('2025')
    expect(options[options.length - 1].element.value).toBe('1920')
  })

  it('free user sees upgrade CTA on Pick a Season page', async () => {
    const wrapper = mountGame()
    wrapper.vm.gameMode = 'season'
    await wrapper.vm.$nextTick()

    const unlockSection = wrapper.find('.unlock-section')
    expect(unlockSection.exists()).toBe(true)
    expect(unlockSection.find('.unlock-btn').text()).toMatch(/1920/)
  })

  it('premium user does not see upgrade CTA on Pick a Season page', async () => {
    const wrapper = mountPremiumGame()
    wrapper.vm.gameMode = 'season'
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.unlock-section').exists()).toBe(false)
  })

  it('free user sees code entry box on Pick a Season page', async () => {
    const wrapper = mountGame()
    wrapper.vm.gameMode = 'season'
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.unlock-input').exists()).toBe(true)
    expect(wrapper.find('.unlock-submit').exists()).toBe(true)
  })
})

describe('Free vs Premium — Opponent Season (Step 3)', () => {
  async function goToStep3(wrapper) {
    wrapper.vm.gameMode = 'season'
    wrapper.vm.setupStep = 3
    await wrapper.vm.$nextTick()
  }

  it('free user does not see the away season dropdown', async () => {
    const wrapper = mountGame()
    await goToStep3(wrapper)

    expect(wrapper.find('#away-season').exists()).toBe(false)
  })

  it('free user sees a static season label matching home season', async () => {
    const wrapper = mountGame()
    wrapper.vm.selectedSeason = 2010
    await goToStep3(wrapper)

    const seasonLabel = wrapper.find('.pregame-season span[style]')
    expect(seasonLabel.exists()).toBe(true)
    expect(seasonLabel.text()).toBe('2010')
  })

  it('premium user sees the away season dropdown', async () => {
    const wrapper = mountPremiumGame()
    await goToStep3(wrapper)

    expect(wrapper.find('#away-season').exists()).toBe(true)
  })

  it('free user sees upgrade CTA on opponent page', async () => {
    const wrapper = mountGame()
    await goToStep3(wrapper)

    const sections = wrapper.findAll('.unlock-section')
    const opponentCTA = sections.filter(s => s.find('.unlock-btn').text().match(/ANY season/))
    expect(opponentCTA.length).toBe(1)
  })

  it('premium user does not see upgrade CTA on opponent page', async () => {
    const wrapper = mountPremiumGame()
    await goToStep3(wrapper)

    expect(wrapper.find('.unlock-section').exists()).toBe(false)
  })

  it('free user sees code entry box on opponent page', async () => {
    const wrapper = mountGame()
    await goToStep3(wrapper)

    expect(wrapper.find('.unlock-input').exists()).toBe(true)
    expect(wrapper.find('.unlock-submit').exists()).toBe(true)
  })

  it('goToStep(3) forces away season to match home season for free users', async () => {
    const wrapper = mountGame()
    wrapper.vm.gameMode = 'season'
    wrapper.vm.selectedSeason = 2015
    wrapper.vm.selectedAwaySeason = 2020
    await wrapper.vm.$nextTick()

    await wrapper.vm.goToStep(3)
    expect(wrapper.vm.selectedAwaySeason).toBe(2015)
  })

  it('goToStep(3) preserves independent away season for premium users', async () => {
    const wrapper = mountPremiumGame()
    wrapper.vm.gameMode = 'season'
    wrapper.vm.selectedSeason = 2015
    wrapper.vm.selectedAwaySeason = 2020
    await wrapper.vm.$nextTick()

    await wrapper.vm.goToStep(3)
    expect(wrapper.vm.selectedAwaySeason).toBe(2020)
  })
})

describe('Free vs Premium — Time of Day Picker (Step 5)', () => {
  async function goToStep5(wrapper) {
    wrapper.vm.gameMode = 'season'
    wrapper.vm.setupStep = 5
    await wrapper.vm.$nextTick()
  }

  it('free user does not see the time-of-day picker', async () => {
    const wrapper = mountGame()
    await goToStep5(wrapper)

    // The time-of-day section is only rendered for premium users
    const weatherSections = wrapper.findAll('.weather-selection')
    // There should be exactly 1 weather-selection (weather only), not 2
    expect(weatherSections.length).toBe(1)
  })

  it('premium user sees the time-of-day picker with 3 options', async () => {
    const wrapper = mountPremiumGame()
    await goToStep5(wrapper)

    const weatherSections = wrapper.findAll('.weather-selection')
    // Should be 2: weather and time-of-day
    expect(weatherSections.length).toBe(2)

    const todSection = weatherSections[1]
    const buttons = todSection.findAll('.weather-card')
    expect(buttons.length).toBe(3)
  })

  it('premium user can select a time-of-day option', async () => {
    const wrapper = mountPremiumGame()
    await goToStep5(wrapper)

    const weatherSections = wrapper.findAll('.weather-selection')
    const todSection = weatherSections[1]
    const buttons = todSection.findAll('.weather-card')

    await buttons[2].trigger('click')
    expect(wrapper.vm.selectedTimeOfDay).toBe('night')
  })
})

describe('Play as Home/Away (Step 5)', () => {
  async function goToStep5(wrapper) {
    wrapper.vm.gameMode = 'season'
    wrapper.vm.setupStep = 5
    await wrapper.vm.$nextTick()
  }

  it('step 5 shows the Play as venue-selection with 2 cards', async () => {
    const wrapper = mountGame()
    await goToStep5(wrapper)

    const venueSections = wrapper.findAll('.venue-selection')
    expect(venueSections.length).toBe(1)
    const cards = venueSections[0].findAll('.venue-card')
    expect(cards.length).toBe(2)
  })

  it('playerSide defaults to home', async () => {
    const wrapper = mountGame()
    await goToStep5(wrapper)
    expect(wrapper.vm.playerSide).toBe('home')
  })

  it('clicking away card sets playerSide to away', async () => {
    const wrapper = mountGame()
    await goToStep5(wrapper)

    const cards = wrapper.findAll('.venue-card')
    await cards[1].trigger('click')
    expect(wrapper.vm.playerSide).toBe('away')
  })

  it('clicking home card sets playerSide back to home', async () => {
    const wrapper = mountGame()
    await goToStep5(wrapper)

    wrapper.vm.playerSide = 'away'
    await wrapper.vm.$nextTick()
    const cards = wrapper.findAll('.venue-card')
    await cards[0].trigger('click')
    expect(wrapper.vm.playerSide).toBe('home')
  })

  it('resolvedHomeTeamId swaps when player picks away', async () => {
    const wrapper = mountGame()
    wrapper.vm.teamSelected = 147
    wrapper.vm.selectedOpponentId = 111
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.resolvedHomeTeamId).toBe(147)
    expect(wrapper.vm.resolvedAwayTeamId).toBe(111)

    wrapper.vm.playerSide = 'away'
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.resolvedHomeTeamId).toBe(111)
    expect(wrapper.vm.resolvedAwayTeamId).toBe(147)
  })

  it('resolvedSeasons swap when player picks away', async () => {
    const wrapper = mountGame()
    wrapper.vm.selectedSeason = 2024
    wrapper.vm.selectedAwaySeason = 1927
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.resolvedHomeSeason).toBe(2024)
    expect(wrapper.vm.resolvedAwaySeason).toBe(1927)

    wrapper.vm.playerSide = 'away'
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.resolvedHomeSeason).toBe(1927)
    expect(wrapper.vm.resolvedAwaySeason).toBe(2024)
  })

  it('resolvedPitcherIds swap when player picks away', async () => {
    const wrapper = mountGame()
    wrapper.vm.selectedPitcherId = 100
    wrapper.vm.selectedAwayPitcherId = 200
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.resolvedHomePitcherId).toBe(100)
    expect(wrapper.vm.resolvedAwayPitcherId).toBe(200)

    wrapper.vm.playerSide = 'away'
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.resolvedHomePitcherId).toBe(200)
    expect(wrapper.vm.resolvedAwayPitcherId).toBe(100)
  })

  it('resetGame resets playerSide to home', async () => {
    const wrapper = mountGame()
    wrapper.vm.playerSide = 'away'
    await wrapper.vm.$nextTick()
    expect(wrapper.vm.playerSide).toBe('away')

    await wrapper.vm.resetGame()
    expect(wrapper.vm.playerSide).toBe('home')
  })
})
