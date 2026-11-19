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
    if (typeof document === 'undefined' || typeof navigator === 'undefined') return false;
    try {
        const ua = navigator.userAgent || '';
        // Safari (macOS / iOS), Edge sous Windows (avec codecs Media Foundation intégrés) et Smart TVs décodent l'AC3/E-AC3.
        const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
        const isEdgeWindows = /Edg\//i.test(ua) && /Windows/i.test(ua);
        const isSmartTv = /SmartTV|Web0S|Tizen|Android TV|GoogleTV|AppleTV|BRAVIA/i.test(ua);

        if (!isSafari && !isEdgeWindows && !isSmartTv) {
            return false;
        }

        const v = document.createElement('video');
        const canAc3 = v.canPlayType('audio/mp4; codecs="ac-3"');
        const canEc3 = v.canPlayType('audio/mp4; codecs="ec-3"');
        return canAc3 === 'probably' || canEc3 === 'probably' || (isEdgeWindows && canAc3 === 'maybe') || (isSmartTv && canAc3 !== '');
    } catch {
        return false;
    }
}

export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5];
