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

  it('free user sees only Moneyball and Modern era cards', async () => {
    const wrapper = mountGame()
    wrapper.vm.gameMode = 'season'
    await wrapper.vm.$nextTick()

    const eraCards = wrapper.findAll('.era-card')
    expect(eraCards.length).toBe(2)
    expect(eraCards[0].text()).toContain('Moneyball Era')
    expect(eraCards[1].text()).toContain('Modern Era')
  })

  it('premium user sees all 9 era cards', async () => {
    const wrapper = mountPremiumGame()
    wrapper.vm.gameMode = 'season'
    await wrapper.vm.$nextTick()

    const eraCards = wrapper.findAll('.era-card')
    expect(eraCards.length).toBe(9)
    expect(eraCards[0].text()).toContain('Dead-Ball Era')
    expect(eraCards[eraCards.length - 1].text()).toContain('Modern Era')
  })

  it('each era card contains a dropdown with years for that era', async () => {
    const wrapper = mountPremiumGame()
    wrapper.vm.gameMode = 'season'
    await wrapper.vm.$nextTick()

    // Dead-Ball Era card (first) should have 20 year options + 1 disabled placeholder
    const firstCard = wrapper.findAll('.era-card')[0]
    const options = firstCard.findAll('.era-select option:not([disabled])')
    expect(options.length).toBe(20)
    expect(options[0].element.value).toBe('1919')
    expect(options[options.length - 1].element.value).toBe('1900')
  })

  it('free user sees upgrade CTA on Pick a Season page', async () => {
    const wrapper = mountGame()
    wrapper.vm.gameMode = 'season'
    await wrapper.vm.$nextTick()

    const unlockSection = wrapper.find('.unlock-section')
    expect(unlockSection.exists()).toBe(true)
    expect(unlockSection.find('.unlock-btn').text()).toMatch(/1900/)
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

    expect(wrapper.find('.era-grid').exists()).toBe(false)
    expect(wrapper.text()).toContain('2010')
  })

  it('premium user sees the away era selector', async () => {
    const wrapper = mountPremiumGame()
    await goToStep3(wrapper)

    expect(wrapper.find('.era-grid').exists()).toBe(true)
    const eraCards = wrapper.findAll('.era-card')
    expect(eraCards.length).toBe(9)
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

  it('goToStep(3) defaults away season and era to home season for premium users', async () => {
    const wrapper = mountPremiumGame()
    wrapper.vm.gameMode = 'season'
    wrapper.vm.selectedSeason = 2015
    wrapper.vm.selectedAwaySeason = 2020
    wrapper.vm.selectedEra = wrapper.vm.allEras.find(e => e.label === 'Moneyball Era')
    await wrapper.vm.$nextTick()

    await wrapper.vm.goToStep(3)
    expect(wrapper.vm.selectedAwaySeason).toBe(2015)
    expect(wrapper.vm.selectedAwayEra.label).toBe('Moneyball Era')
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
