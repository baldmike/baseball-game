/**
 * Web Audio API oscillator-based sound effects for the baseball game.
 */

let audioCtx = null

function getContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  }
  // Resume if suspended (browser autoplay policy)
  if (audioCtx.state === 'suspended') {
    audioCtx.resume()
  }
  return audioCtx
}

function playTone(frequency, duration, type = 'sine', volume = 0.3) {
  const ctx = getContext()
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.value = frequency
  gain.gain.setValueAtTime(volume, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start()
  osc.stop(ctx.currentTime + duration)
}

function playNoiseBurst(duration, highpass = 0, volume = 0.3) {
  const ctx = getContext()
  const bufferSize = ctx.sampleRate * duration
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1
  }
  const source = ctx.createBufferSource()
  source.buffer = buffer
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(volume, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)

  if (highpass > 0) {
    const filter = ctx.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.value = highpass
    source.connect(filter)
    filter.connect(gain)
  } else {
    source.connect(gain)
  }
  gain.connect(ctx.destination)
  source.start()
  source.stop(ctx.currentTime + duration)
}

export function useSoundEffects() {
  function pitchWhoosh() {
    const ctx = getContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(800, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.25)
    gain.gain.setValueAtTime(0.2, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.3)
  }

  function strike() {
    playTone(300, 0.15, 'square', 0.2)
  }

  function ball() {
    playTone(150, 0.3, 'sine', 0.15)
  }

  function hitCrack() {
    playNoiseBurst(0.08, 2000, 0.5)
  }

  function homeRun() {
    // Crack + ascending celebration
    playNoiseBurst(0.08, 2000, 0.5)
    setTimeout(() => {
      const ctx = getContext()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(400, ctx.currentTime)
      osc.frequency.linearRampToValueAtTime(1200, ctx.currentTime + 0.5)
      gain.gain.setValueAtTime(0.25, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.6)
    }, 100)
  }

  function out() {
    playTone(100, 0.3, 'sine', 0.2)
  }

  function crowdCheer() {
    const ctx = getContext()
    const duration = 0.8
    const bufferSize = ctx.sampleRate * duration
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1
    }
    const source = ctx.createBufferSource()
    source.buffer = buffer
    const bandpass = ctx.createBiquadFilter()
    bandpass.type = 'bandpass'
    bandpass.frequency.value = 1000
    bandpass.Q.value = 0.5
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
    source.connect(bandpass)
    bandpass.connect(gain)
    gain.connect(ctx.destination)
    source.start()
    source.stop(ctx.currentTime + duration)
  }

  function strikeout() {
    playTone(400, 0.1, 'square', 0.2)
    setTimeout(() => playTone(300, 0.1, 'square', 0.2), 120)
    setTimeout(() => playTone(200, 0.2, 'square', 0.2), 240)
  }

  function walk() {
    playTone(300, 0.15, 'triangle', 0.2)
    setTimeout(() => playTone(400, 0.15, 'triangle', 0.2), 180)
  }

  function playForLastPlay(lastPlay) {
    if (!lastPlay) return
    const text = lastPlay.toLowerCase()

    if (text.includes('homerun') || text.includes('home run')) {
      homeRun()
      setTimeout(crowdCheer, 300)
    } else if (text.includes('single') || text.includes('double') || text.includes('triple')) {
      hitCrack()
      if (text.includes('run(s) score')) {
        setTimeout(crowdCheer, 200)
      }
    } else if (text.includes('strikeout')) {
      strikeout()
    } else if (text.includes('strike')) {
      strike()
    } else if (text.includes('ball four') || text.includes('walks')) {
      walk()
    } else if (text.includes('ball')) {
      ball()
    } else if (text.includes('groundout') || text.includes('flyout') || text.includes('lineout')) {
      out()
    } else if (text.includes('foul')) {
      hitCrack()
    } else if (text.includes('throw') || text.includes('pitch')) {
      pitchWhoosh()
    }
  }

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
  }
}
