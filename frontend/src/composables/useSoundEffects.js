/**
 * useSoundEffects.js — Vue composable for baseball game sound effects.
 *
 * WHY OSCILLATORS INSTEAD OF AUDIO FILES:
 * This uses the Web Audio API to generate sounds programmatically via oscillators
 * and noise buffers rather than loading .mp3/.wav files. This approach has several
 * advantages for a teaching codebase:
 *   1. Zero network requests — no audio files to host, cache, or fail to load.
 *   2. Tiny bundle size — the entire sound system is ~150 lines of code.
 *   3. Instant playback — no decode/load latency; sounds start immediately.
 *   4. Full control — frequency, duration, waveform, and volume are all tunable.
 *   5. No licensing concerns — no copyrighted audio clips needed.
 *
 * The tradeoff is that synthesized sounds are less realistic than recorded audio,
 * but for quick UI feedback in a baseball game, they work well enough.
 */

/**
 * Module-level AudioContext singleton.
 * We lazily create it on first use because browsers require AudioContext creation
 * to happen in response to a user gesture (click/tap). Keeping it as a singleton
 * avoids creating multiple contexts (browsers limit the number).
 */
let audioCtx = null

/**
 * Get or create the shared AudioContext.
 * Also handles the "suspended" state — modern browsers suspend AudioContexts
 * created before the user interacts with the page (autoplay policy).
 * Calling resume() here ensures sounds will play after the first user click.
 *
 * @returns {AudioContext} The shared audio context ready for use
 */
function getContext() {
  if (!audioCtx) {
    // Use the standard AudioContext, falling back to the webkit-prefixed version
    // for older Safari versions that don't support the unprefixed API.
    audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  }
  // Resume if suspended (browser autoplay policy requires user gesture first)
  if (audioCtx.state === 'suspended') {
    audioCtx.resume()
  }
  return audioCtx
}

/**
 * Play a single tone using an oscillator.
 * This is the building block for most sound effects (strike, ball, out, etc.).
 *
 * The gain envelope starts at the given volume and ramps exponentially to near-zero,
 * creating a natural "fade out" rather than an abrupt cutoff that would cause a click.
 *
 * @param {number} frequency - Pitch in Hz (e.g., 440 = A4 note). Higher = more urgent.
 * @param {number} duration - How long the tone lasts in seconds.
 * @param {string} type - Oscillator waveform: 'sine' (smooth), 'square' (buzzy),
 *                        'triangle' (mellow), 'sawtooth' (harsh).
 * @param {number} volume - Starting gain from 0.0 (silent) to 1.0 (max). Keep below 0.5
 *                          to avoid clipping when multiple sounds overlap.
 */
function playTone(frequency, duration, type = 'sine', volume = 0.3) {
  const ctx = getContext()
  const osc = ctx.createOscillator()     // Generates the waveform
  const gain = ctx.createGain()           // Controls volume envelope
  osc.type = type                         // Set the waveform shape
  osc.frequency.value = frequency         // Set the pitch
  // Start at the desired volume, then exponentially ramp down to near-silence.
  // exponentialRampToValueAtTime can't ramp to exactly 0, so we use 0.001 (~= -60dB).
  gain.gain.setValueAtTime(volume, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
  // Connect the audio graph: oscillator -> gain -> speakers
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start()
  osc.stop(ctx.currentTime + duration)    // Automatically clean up after duration
}

/**
 * Play a burst of white noise, optionally filtered through a highpass filter.
 * White noise sounds like static/hissing and is used to simulate percussive
 * sounds like a bat crack or crowd noise.
 *
 * HOW IT WORKS:
 * We create a buffer filled with random samples (-1 to +1), which produces
 * uniform white noise. A highpass filter can remove low frequencies to make
 * the noise sound brighter/sharper (like a bat crack) vs. full-spectrum (like crowd).
 *
 * @param {number} duration - Length of the noise burst in seconds
 * @param {number} highpass - Cutoff frequency for highpass filter in Hz.
 *                            0 = no filter (full spectrum noise).
 *                            2000+ = only high frequencies pass through (sharp crack sound).
 * @param {number} volume - Starting gain level (0.0 to 1.0)
 */
function playNoiseBurst(duration, highpass = 0, volume = 0.3) {
  const ctx = getContext()
  // Create an audio buffer sized to hold `duration` seconds of samples
  const bufferSize = ctx.sampleRate * duration
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  // Fill the buffer with random values between -1 and +1 (white noise)
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1
  }
  // Create a buffer source node to play our noise buffer
  const source = ctx.createBufferSource()
  source.buffer = buffer
  // Set up gain envelope: start at volume, fade to silence
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(volume, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)

  if (highpass > 0) {
    // Apply a highpass filter to remove low frequencies.
    // This makes the noise sound like a sharp crack instead of rumble.
    const filter = ctx.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.value = highpass
    source.connect(filter)
    filter.connect(gain)
  } else {
    // No filter — use full-spectrum white noise (good for crowd sounds)
    source.connect(gain)
  }
  gain.connect(ctx.destination)
  source.start()
  source.stop(ctx.currentTime + duration)
}

/**
 * Shared mute state across all useSoundEffects() calls.
 * This is module-level (not per-component) so that muting in one component
 * mutes sounds everywhere — there's only one speaker, after all.
 */
let muted = false

/**
 * Vue composable that provides baseball-themed sound effect functions.
 *
 * USAGE:
 *   const { playForLastPlay, toggleMute } = useSoundEffects()
 *
 * Each sound function can be called individually for fine-grained control,
 * or you can use `playForLastPlay(text)` to automatically pick the right
 * sound based on the play description text from the game engine.
 *
 * @returns {Object} Object containing all sound functions and mute controls
 */
export function useSoundEffects() {
  /** Check if sounds are currently muted */
  function isMuted() { return muted }

  /** Set mute state directly */
  function setMuted(val) { muted = val }

  /** Toggle mute on/off and return the new muted state */
  function toggleMute() { muted = !muted; return muted }

  /**
   * Pitch whoosh — a descending tone that mimics the sound of a ball
   * flying past. The frequency sweeps from 800Hz down to 200Hz over 0.25s,
   * creating a Doppler-like "whoooosh" effect.
   */
  function pitchWhoosh() {
    const ctx = getContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    // Start at high pitch (800Hz) and ramp down to low (200Hz) to simulate
    // an object moving past the listener at speed
    osc.frequency.setValueAtTime(800, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.25)
    // Fade out volume over the same duration
    gain.gain.setValueAtTime(0.2, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.3)  // Slightly longer than ramp to avoid cutoff
  }

  /**
   * Strike sound — a short, sharp square wave "buzz" at 300Hz.
   * Square waves have a harsher, more attention-grabbing tone than sine waves,
   * which makes this feel like a negative event (strike against the batter).
   */
  function strike() {
    playTone(300, 0.15, 'square', 0.2)
  }

  /**
   * Ball sound — a low, gentle sine wave at 150Hz.
   * The lower frequency and longer duration (0.3s) make it feel neutral/passive,
   * reflecting that the batter didn't need to do anything (pitch was outside the zone).
   */
  function ball() {
    playTone(150, 0.3, 'sine', 0.15)
  }

  /**
   * Hit crack — a very short (80ms) burst of high-frequency noise.
   * The 2000Hz highpass filter removes low rumble, leaving only the sharp
   * high frequencies that sound like a bat making contact with the ball.
   * Higher volume (0.5) makes it feel impactful.
   */
  function hitCrack() {
    playNoiseBurst(0.08, 2000, 0.5)
  }

  /**
   * Home run — a two-part sound: bat crack followed by an ascending celebration tone.
   *
   * First plays the hitCrack() for the bat contact, then after 100ms delay,
   * plays a triangle-wave tone that sweeps from 400Hz up to 1200Hz.
   * This ascending pitch creates a "victory fanfare" feeling — the ball
   * is sailing out of the park and the crowd is getting excited.
   *
   * Triangle waves have a softer, more musical quality than square waves,
   * making this sound celebratory rather than harsh.
   */
  function homeRun() {
    // Part 1: The crack of the bat
    playNoiseBurst(0.08, 2000, 0.5)
    // Part 2: Ascending celebration tone after a brief pause
    setTimeout(() => {
      const ctx = getContext()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'   // Soft, musical waveform for celebration
      // Sweep frequency upward to create excitement
      osc.frequency.setValueAtTime(400, ctx.currentTime)
      osc.frequency.linearRampToValueAtTime(1200, ctx.currentTime + 0.5)
      gain.gain.setValueAtTime(0.25, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.6)
    }, 100)  // 100ms delay so the crack is heard distinctly before the fanfare
  }

  /**
   * Out sound — a low 100Hz sine wave for 0.3s.
   * The very low frequency creates a "dull thud" / disappointing feeling,
   * signaling that the batter or runner is out.
   */
  function out() {
    playTone(100, 0.3, 'sine', 0.2)
  }

  /**
   * Crowd cheer — band-passed white noise that simulates a roaring crowd.
   *
   * HOW IT SIMULATES A CROWD:
   * White noise contains all frequencies equally, much like the combined
   * sound of thousands of people shouting. A bandpass filter centered at
   * 1000Hz with a low Q (wide bandwidth) shapes the noise to sound more
   * like human voices (which cluster around 300-3000Hz) rather than
   * pure static. The result is a convincing "roar" effect.
   *
   * Duration is 0.8s — long enough to feel celebratory, short enough
   * to not become annoying on repeated plays.
   */
  function crowdCheer() {
    const ctx = getContext()
    const duration = 0.8
    const bufferSize = ctx.sampleRate * duration
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    // Fill with random samples to create white noise
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1
    }
    const source = ctx.createBufferSource()
    source.buffer = buffer
    // Bandpass filter: only let mid-range frequencies through (simulates human voices)
    const bandpass = ctx.createBiquadFilter()
    bandpass.type = 'bandpass'
    bandpass.frequency.value = 1000  // Center frequency — middle of the human voice range
    bandpass.Q.value = 0.5           // Low Q = wide bandwidth, lets more frequencies through
    // Fade out gain envelope
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
    // Audio graph: noise -> bandpass filter -> gain -> speakers
    source.connect(bandpass)
    bandpass.connect(gain)
    gain.connect(ctx.destination)
    source.start()
    source.stop(ctx.currentTime + duration)
  }

  /**
   * Strikeout sound — three descending square-wave tones played in rapid succession.
   * The pitches descend (400 -> 300 -> 200 Hz) to create a "wah-wah-wahhh"
   * failure sound, like the classic game-over jingle. Each tone is staggered
   * by 120ms so they don't overlap too much but still feel connected.
   */
  function strikeout() {
    playTone(400, 0.1, 'square', 0.2)                          // High tone
    setTimeout(() => playTone(300, 0.1, 'square', 0.2), 120)   // Mid tone
    setTimeout(() => playTone(200, 0.2, 'square', 0.2), 240)   // Low tone (longer for finality)
  }

  /**
   * Walk sound — two ascending triangle-wave tones.
   * The pitch goes up (300 -> 400 Hz) to indicate a positive outcome
   * for the batter (free base). Triangle waves keep it mellow since
   * a walk is good but not as exciting as a hit.
   */
  function walk() {
    playTone(300, 0.15, 'triangle', 0.2)                        // Low tone first
    setTimeout(() => playTone(400, 0.15, 'triangle', 0.2), 180) // Higher tone follows
  }

  /**
   * Automatically select and play the appropriate sound effect based on
   * the text description of the last play from the game engine.
   *
   * This is the main entry point used by the game UI — rather than having
   * the component figure out which sound to play, it just passes the
   * last_play string and this function does keyword matching.
   *
   * The order of checks matters: more specific matches (like "homerun")
   * are checked before general ones (like "ball") to avoid false positives.
   * For example, "ball four" should trigger walk(), not ball().
   *
   * @param {string} lastPlay - The play description text from the game engine
   */
  function playForLastPlay(lastPlay) {
    // Don't play anything if there's no play text or sounds are muted
    if (!lastPlay || muted) return
    const text = lastPlay.toLowerCase()

    if (text.includes('homerun') || text.includes('home run')) {
      // Home run: bat crack + ascending fanfare + crowd cheer
      homeRun()
      setTimeout(crowdCheer, 300)  // Crowd reacts after the ball clears the fence
    } else if (text.includes('single') || text.includes('double') || text.includes('triple')) {
      // Base hit: bat crack, plus crowd cheer if runs scored
      hitCrack()
      if (text.includes('run(s) score')) {
        setTimeout(crowdCheer, 200)  // Crowd cheers for runs
      }
    } else if (text.includes('strikeout')) {
      // Full strikeout: descending failure jingle (check before 'strike' to avoid partial match)
      strikeout()
    } else if (text.includes('strike')) {
      // Individual strike call: short buzz
      strike()
    } else if (text.includes('ball four') || text.includes('walks')) {
      // Walk: ascending positive tones (check before 'ball' to avoid partial match)
      walk()
    } else if (text.includes('ball')) {
      // Ball call: low neutral tone
      ball()
    } else if (text.includes('groundout') || text.includes('flyout') || text.includes('lineout')) {
      // Any type of out: low dull tone
      out()
    } else if (text.includes('foul')) {
      // Foul ball: bat crack (contact was made, just not fair)
      hitCrack()
    } else if (text.includes('throw') || text.includes('pitch')) {
      // Generic pitch/throw: whoosh sound
      pitchWhoosh()
    }
  }

  // Return all individual sound functions plus the smart dispatcher and mute controls.
  // Individual functions are exported for cases where the caller knows exactly
  // which sound to play; playForLastPlay is for automatic sound selection.
  return {
    pitchWhoosh,
    strike,
    ball,
    hitCrack,
    homeRun,
    out,
    crowdCheer,
    strikeout,
    walk,
    playForLastPlay,
    isMuted,
    setMuted,
    toggleMute,
  }
}
