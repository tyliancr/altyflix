export function formatClock(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const s = Math.floor(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0
        ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
        : `${m}:${String(sec).padStart(2, '0')}`;
}

export function canBrowserDecodeAc3() {
    if (typeof document === 'undefined') return false;
    try {
        const v = document.createElement('video');
        const canAc3 = v.canPlayType('audio/mp4; codecs="ac-3"');
        const canEc3 = v.canPlayType('audio/mp4; codecs="ec-3"');
        return Boolean((canAc3 && canAc3 !== 'no') || (canEc3 && canEc3 !== 'no'));
    } catch {
        return false;
    }
}

export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5];
