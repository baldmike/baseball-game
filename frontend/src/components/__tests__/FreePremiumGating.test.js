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
