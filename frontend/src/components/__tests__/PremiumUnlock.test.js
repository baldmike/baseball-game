/**
 * PremiumUnlock.test.js — Tests for the premium unlock code feature.
 * Verifies that entering the correct code reveals all 15 matchups
 * in both Historic and Fantasy modes, and persists via localStorage.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import InteractiveGame from '../InteractiveGame.vue'

// Stub out external service calls so the component mounts cleanly
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

function mountInMode(mode) {
  const wrapper = shallowMount(InteractiveGame, {
    global: { stubs: { BaseballDiamond: true, Scoreboard: true, TeamSelector: true, Scorecard: true } },
  })
  // Set the game mode to show matchup grids
  wrapper.vm.gameMode = mode
  return wrapper
}

describe('Premium Unlock', () => {
  // ──────────────────────────────────────────────
  // TEST 25: Historic mode shows only 6 free matchups by default
  // ──────────────────────────────────────────────
  it('shows 6 historic matchups before unlock', async () => {
    const wrapper = mountInMode('historic')
    await wrapper.vm.$nextTick()
    const cards = wrapper.findAll('.matchup-card')
    expect(cards.length).toBe(6)
  })

  // ──────────────────────────────────────────────
  // TEST 26: Fantasy mode shows only 6 free matchups by default
  // ──────────────────────────────────────────────
  it('shows 6 fantasy matchups before unlock', async () => {
    const wrapper = mountInMode('fantasy')
    await wrapper.vm.$nextTick()
    const cards = wrapper.findAll('.matchup-card')
    expect(cards.length).toBe(6)
  })

  // ──────────────────────────────────────────────
  // TEST 27: Unlock section is visible before unlock
  // ──────────────────────────────────────────────
  it('shows unlock section before code is entered', async () => {
    const wrapper = mountInMode('historic')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.unlock-section').exists()).toBe(true)
    expect(wrapper.find('.unlock-input').exists()).toBe(true)
    expect(wrapper.find('.unlock-btn').exists()).toBe(true)
  })

  // ──────────────────────────────────────────────
  // TEST 28: Wrong code shows error and does not unlock
  // ──────────────────────────────────────────────
  it('shows error message for wrong code', async () => {
    const wrapper = mountInMode('historic')
    await wrapper.vm.$nextTick()

    const input = wrapper.find('.unlock-input')
    await input.setValue('WRONG-CODE')
    await wrapper.find('.unlock-submit').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.unlock-error').exists()).toBe(true)
    expect(wrapper.find('.unlock-error').text()).toMatch(/Invalid code/)
    // Still only 6 matchups
    expect(wrapper.findAll('.matchup-card').length).toBe(6)
  })

  // ──────────────────────────────────────────────
  // TEST 29: Correct code unlocks all 15 historic matchups
  // ──────────────────────────────────────────────
  it('unlocks all 15 historic matchups with correct code', async () => {
    const wrapper = mountInMode('historic')
    await wrapper.vm.$nextTick()

    const input = wrapper.find('.unlock-input')
    await input.setValue('BASEBALD-PREMIUM-8675309')
    await wrapper.find('.unlock-submit').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('.matchup-card').length).toBe(15)
  })

  // ──────────────────────────────────────────────
  // TEST 30: Correct code unlocks all 15 fantasy matchups
  // ──────────────────────────────────────────────
  it('unlocks all 15 fantasy matchups with correct code', async () => {
    const wrapper = mountInMode('fantasy')
    await wrapper.vm.$nextTick()

    const input = wrapper.find('.unlock-input')
    await input.setValue('BASEBALD-PREMIUM-8675309')
    await wrapper.find('.unlock-submit').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('.matchup-card').length).toBe(15)
  })

  // ──────────────────────────────────────────────
  // TEST 31: Unlock section disappears after successful unlock
  // ──────────────────────────────────────────────
  it('hides unlock section after successful unlock', async () => {
    const wrapper = mountInMode('historic')
    await wrapper.vm.$nextTick()

    await wrapper.find('.unlock-input').setValue('BASEBALD-PREMIUM-8675309')
    await wrapper.find('.unlock-submit').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.unlock-section').exists()).toBe(false)
    expect(wrapper.find('.unlock-input').exists()).toBe(false)
    expect(wrapper.find('.unlock-btn').exists()).toBe(false)
  })

  // ──────────────────────────────────────────────
  // TEST 32: Code is case-sensitive
  // ──────────────────────────────────────────────
  it('rejects lowercase version of the code', async () => {
    const wrapper = mountInMode('historic')
    await wrapper.vm.$nextTick()

    await wrapper.find('.unlock-input').setValue('basebald-premium-8675309')
    await wrapper.find('.unlock-submit').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.unlock-error').exists()).toBe(true)
    expect(wrapper.findAll('.matchup-card').length).toBe(6)
  })

  // ──────────────────────────────────────────────
  // TEST 33: Gumroad link has correct href and target
  // ──────────────────────────────────────────────
  it('Gumroad button links to correct URL in new tab', async () => {
    const wrapper = mountInMode('historic')
    await wrapper.vm.$nextTick()

    const link = wrapper.find('.unlock-btn')
    expect(link.attributes('href')).toBe('https://baldmike.gumroad.com/l/basebald')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toBe('noopener')
  })

  // ──────────────────────────────────────────────
  // TEST 34: Enter key in input triggers unlock
  // ──────────────────────────────────────────────
  it('pressing Enter in the input triggers unlock', async () => {
    const wrapper = mountInMode('historic')
    await wrapper.vm.$nextTick()

    await wrapper.find('.unlock-input').setValue('BASEBALD-PREMIUM-8675309')
    await wrapper.find('.unlock-input').trigger('keyup.enter')
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('.matchup-card').length).toBe(15)
    expect(wrapper.find('.unlock-section').exists()).toBe(false)
  })

  // ──────────────────────────────────────────────
  // TEST 35: Successful unlock saves to localStorage
  // ──────────────────────────────────────────────
  it('saves unlock state to localStorage on success', async () => {
    const wrapper = mountInMode('historic')
    await wrapper.vm.$nextTick()

    expect(localStorage.getItem('premiumUnlocked')).toBeNull()

    await wrapper.find('.unlock-input').setValue('BASEBALD-PREMIUM-8675309')
    await wrapper.find('.unlock-submit').trigger('click')
    await wrapper.vm.$nextTick()

    expect(localStorage.getItem('premiumUnlocked')).toBe('true')
  })

  // ──────────────────────────────────────────────
  // TEST 36: Failed unlock does not write to localStorage
  // ──────────────────────────────────────────────
  it('does not save to localStorage on failed attempt', async () => {
    const wrapper = mountInMode('historic')
    await wrapper.vm.$nextTick()

    await wrapper.find('.unlock-input').setValue('WRONG-CODE')
    await wrapper.find('.unlock-submit').trigger('click')
    await wrapper.vm.$nextTick()

    expect(localStorage.getItem('premiumUnlocked')).toBeNull()
  })

  // ──────────────────────────────────────────────
  // TEST 37: Component reads localStorage on mount and auto-unlocks
  // ──────────────────────────────────────────────
  it('auto-unlocks when localStorage already has the flag', async () => {
    localStorage.setItem('premiumUnlocked', 'true')

    const wrapper = mountInMode('historic')
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('.matchup-card').length).toBe(15)
    expect(wrapper.find('.unlock-section').exists()).toBe(false)
  })
})
