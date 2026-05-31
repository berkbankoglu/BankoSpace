// Centralized sound effects utility using Web Audio API
// No external audio files needed - all sounds are synthesized

let audioCtx = null;
let masterGain = null;

// Volume: 0 to 1, stored in localStorage
let volume = parseFloat(localStorage.getItem('soundVolume') ?? '0.7');

export function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(audioCtx.destination);
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function getMasterGain() {
  getAudioContext();
  return masterGain;
}

export function setVolume(v) {
  volume = Math.max(0, Math.min(1, v));
  localStorage.setItem('soundVolume', String(volume));
  if (masterGain) {
    masterGain.gain.value = volume;
  }
}

export function getVolume() {
  return volume;
}

// Typing sound - mechanical keyboard thock
export function playTypeSound() {
  try {
    const ctx = getAudioContext();
    const dest = getMasterGain();
    const t = ctx.currentTime;

    // Layer 1: deep thock — plate/body resonance (low-mid freq)
    const thockSize = Math.floor(ctx.sampleRate * 0.05);
    const thockBuf = ctx.createBuffer(1, thockSize, ctx.sampleRate);
    const thockData = thockBuf.getChannelData(0);
    for (let i = 0; i < thockSize; i++) {
      thockData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / thockSize, 4);
    }
    const thockSrc = ctx.createBufferSource();
    thockSrc.buffer = thockBuf;

    const thockFilter = ctx.createBiquadFilter();
    thockFilter.type = 'bandpass';
    thockFilter.frequency.value = 350 + Math.random() * 150;
    thockFilter.Q.value = 1.2;

    const thockGain = ctx.createGain();
    thockGain.gain.setValueAtTime(0.65, t);
    thockGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    thockSrc.connect(thockFilter);
    thockFilter.connect(thockGain);
    thockGain.connect(dest);
    thockSrc.start(t);
    thockSrc.stop(t + 0.09);

    // Layer 2: sharp click transient — key actuation mechanism
    const clickSize = Math.floor(ctx.sampleRate * 0.007);
    const clickBuf = ctx.createBuffer(1, clickSize, ctx.sampleRate);
    const clickData = clickBuf.getChannelData(0);
    for (let i = 0; i < clickSize; i++) {
      clickData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / clickSize, 2);
    }
    const clickSrc = ctx.createBufferSource();
    clickSrc.buffer = clickBuf;

    const clickFilter = ctx.createBiquadFilter();
    clickFilter.type = 'highpass';
    clickFilter.frequency.value = 4000;

    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(0.22, t);
    clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.007);

    clickSrc.connect(clickFilter);
    clickFilter.connect(clickGain);
    clickGain.connect(dest);
    clickSrc.start(t);
    clickSrc.stop(t + 0.01);
  } catch (e) { /* silent fail */ }
}

// Click sound - UI button press
export function playClickSound() {
  try {
    const ctx = getAudioContext();
    const dest = getMasterGain();
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.exponentialRampToValueAtTime(400, t + 0.06);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

    osc.connect(gain);
    gain.connect(dest);
    osc.start(t);
    osc.stop(t + 0.07);
  } catch (e) { /* silent fail */ }
}

// Toggle/complete sound - satisfying "done" chime
export function playCompleteSound() {
  try {
    const ctx = getAudioContext();
    const dest = getMasterGain();
    const t = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(523, t);

    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(659, t + 0.08);

    const gain1 = ctx.createGain();
    gain1.gain.setValueAtTime(0.25, t);
    gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    const gain2 = ctx.createGain();
    gain2.gain.setValueAtTime(0.001, t);
    gain2.gain.setValueAtTime(0.25, t + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

    osc1.connect(gain1);
    gain1.connect(dest);
    osc2.connect(gain2);
    gain2.connect(dest);

    osc1.start(t);
    osc1.stop(t + 0.12);
    osc2.start(t + 0.08);
    osc2.stop(t + 0.25);
  } catch (e) { /* silent fail */ }
}

// Uncomplete sound - descending note
export function playUncompleteSound() {
  try {
    const ctx = getAudioContext();
    const dest = getMasterGain();
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(523, t);
    osc.frequency.exponentialRampToValueAtTime(349, t + 0.12);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    osc.connect(gain);
    gain.connect(dest);
    osc.start(t);
    osc.stop(t + 0.13);
  } catch (e) { /* silent fail */ }
}

// Delete sound - quick swoosh
export function playDeleteSound() {
  try {
    const ctx = getAudioContext();
    const dest = getMasterGain();
    const t = ctx.currentTime;

    const bufferSize = ctx.sampleRate * 0.1;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 3);
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(2000, t);
    filter.frequency.exponentialRampToValueAtTime(500, t + 0.1);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    source.start(t);
    source.stop(t + 0.12);
  } catch (e) { /* silent fail */ }
}

// Navigation/tab switch sound - soft pop
export function playNavSound() {
  try {
    const ctx = getAudioContext();
    const dest = getMasterGain();
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.exponentialRampToValueAtTime(600, t + 0.04);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

    osc.connect(gain);
    gain.connect(dest);
    osc.start(t);
    osc.stop(t + 0.06);
  } catch (e) { /* silent fail */ }
}

// Add/create sound - positive pop
export function playAddSound() {
  try {
    const ctx = getAudioContext();
    const dest = getMasterGain();
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.08);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

    osc.connect(gain);
    gain.connect(dest);
    osc.start(t);
    osc.stop(t + 0.11);
  } catch (e) { /* silent fail */ }
}

// Throttled typing sound (prevents too many sounds when typing fast)
let lastTypeTime = 0;
export function playTypeSoundThrottled() {
  const now = Date.now();
  if (now - lastTypeTime > 40) {
    lastTypeTime = now;
    playTypeSound();
  }
}
