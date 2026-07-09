/**
 * Sound system for FocusFlow notifications.
 * Uses Web Audio API to generate simple, pleasant notification sounds.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

/** Focus session complete — warm, wooden knock sound */
export function playFocusComplete() {
  const ctx = getAudioContext();
  const now = ctx.currentTime;

  // Two quick knocks
  [0, 0.15].forEach((offset) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "triangle";
    osc.frequency.setValueAtTime(800, now + offset);
    osc.frequency.exponentialRampToValueAtTime(200, now + offset + 0.15);
    gain.gain.setValueAtTime(0.4, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.2);
    osc.start(now + offset);
    osc.stop(now + offset + 0.2);
  });
}

/** Break complete — gentle bell chime */
export function playBreakComplete() {
  const ctx = getAudioContext();
  const now = ctx.currentTime;

  // Three ascending notes
  [523, 659, 784].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now + i * 0.12);
    gain.gain.setValueAtTime(0.25, now + i * 0.12);
    gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.4);
    osc.start(now + i * 0.12);
    osc.stop(now + i * 0.12 + 0.4);
  });
}

/** Long break complete — ceremonial chime */
export function playLongBreakComplete() {
  const ctx = getAudioContext();
  const now = ctx.currentTime;

  // Four ascending notes, longer
  [392, 523, 659, 784].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now + i * 0.2);
    gain.gain.setValueAtTime(0.3, now + i * 0.2);
    gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.2 + 0.6);
    osc.start(now + i * 0.2);
    osc.stop(now + i * 0.2 + 0.6);
  });
}
