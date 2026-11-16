import { getAudioContext } from './audioContext.js';

export const playHaptic = (type = 'light') => {
    try {
        if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
            window.navigator.vibrate(type === 'light' ? 10 : type === 'medium' ? 20 : 30);
        }
    } catch {
        // Ignore
    }
};

export const playSound = (name) => {
    try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;

        if (name === 'hover') {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1400, now);
            osc.frequency.exponentialRampToValueAtTime(500, now + 0.02);
            gain.gain.setValueAtTime(0.02, now);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.02);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.02);
        } else if (name === 'select') {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(180, now);
            osc.frequency.exponentialRampToValueAtTime(60, now + 0.1);
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.1);
        } else if (name === 'netflix_intro') {
            // Beat 1: Percussive mid-low "Ta" strike
            const osc1 = ctx.createOscillator();
            const gain1 = ctx.createGain();
            osc1.type = 'triangle';
            osc1.frequency.setValueAtTime(130, now);
            osc1.frequency.exponentialRampToValueAtTime(50, now + 0.12);
            gain1.gain.setValueAtTime(0.28, now);
            gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
            osc1.connect(gain1);
            gain1.connect(ctx.destination);
            osc1.start(now);
            osc1.stop(now + 0.12);

            // Beat 2: Massive deep sub-bass "DUMMM" impact at now + 0.14
            const t2 = now + 0.14;
            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(82, t2);
            osc2.frequency.exponentialRampToValueAtTime(32, t2 + 0.7);
            gain2.gain.setValueAtTime(0.38, t2);
            gain2.gain.exponentialRampToValueAtTime(0.0001, t2 + 0.7);
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.start(t2);
            osc2.stop(t2 + 0.7);

            // Resonant orchestral cello chord / shimmer
            const osc3 = ctx.createOscillator();
            const gain3 = ctx.createGain();
            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(360, t2);
            filter.frequency.exponentialRampToValueAtTime(140, t2 + 0.8);

            osc3.type = 'sawtooth';
            osc3.frequency.setValueAtTime(110, t2);
            gain3.gain.setValueAtTime(0.001, t2);
            gain3.gain.linearRampToValueAtTime(0.14, t2 + 0.08);
            gain3.gain.exponentialRampToValueAtTime(0.0001, t2 + 0.8);

            osc3.connect(filter);
            filter.connect(gain3);
            gain3.connect(ctx.destination);
            osc3.start(t2);
            osc3.stop(t2 + 0.8);
        }
    } catch {
        // Fallback silently
    }
};
