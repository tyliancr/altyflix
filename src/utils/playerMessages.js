/**
 * playerMessages.js
 * Utilities for validating postMessage events from the embedded player iframe.
 */

/**
 * Returns true if the MessageEvent comes from the trusted iframe contentWindow
 * and carries a valid object payload (not a raw string like 'ended').
 *
 * @param {MessageEvent} event
 * @param {HTMLIFrameElement} frame
 * @returns {boolean}
 */
export function isTrustedPlayerMessage(event, frame) {
    if (!frame || !frame.contentWindow) return false;
    if (event.source !== frame.contentWindow) return false;
    const trustedOrigins = [
        'https://player.example',
        'https://videasy.xyz',
        'https://vidzy.cc',
        'https://vidzy.org',
    ];
    if (!trustedOrigins.some(o => event.origin.startsWith(o))) return false;
    if (!event.data || typeof event.data !== 'object') return false;
    return true;
}

/**
 * Returns true if the given time/duration pair represents a valid, in-range
 * playback position (finite numbers, time ≥ 0, duration > 0, time ≤ duration).
 *
 * @param {number} time
 * @param {number} duration
 * @returns {boolean}
 */
export function validPlaybackProgress(time, duration) {
    if (typeof time !== 'number' || typeof duration !== 'number') return false;
    if (!Number.isFinite(time) || !Number.isFinite(duration)) return false;
    if (time < 0 || duration <= 0) return false;
    if (time > duration) return false;
    return true;
}
