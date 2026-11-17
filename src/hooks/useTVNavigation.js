import { useEffect } from 'react';
import './tvNavigation.css';

/**
 * Remote-control navigation (TV browsers, keyboard).
 *
 * Arrow keys move focus to the nearest focusable element in that direction,
 * scrolling rows and the page so it stays in view. OK/Enter activates it
 * (native for links and buttons). Backspace goes back when not typing.
 *
 * While the remote or keyboard is in use, <html> gets the `tv-nav` class so
 * the focused element is clearly highlighted; moving the mouse removes it.
 */

const FOCUSABLE = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

const DIRECTIONS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
const TYPING = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

const isVisible = (el) => {
    if (el.closest('[aria-hidden="true"], [inert]')) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    const style = getComputedStyle(el);
    // Fully transparent controls (row arrows, hover-only buttons) are mouse affordances: skip them
    return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
};

// When a dialog is open, keep focus inside the top-most one
const scope = () => {
    const dialogs = [...document.querySelectorAll('[aria-modal="true"]')].filter(isVisible);
    return dialogs.at(-1) || document;
};

const candidates = () => [...scope().querySelectorAll(FOCUSABLE)].filter(isVisible);

const center = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

/** The horizontally scrolling shelf an element sits in, if any. */
const rowOf = (el) => {
    let row = el.parentElement;
    while (row && row !== document.body) {
        const style = getComputedStyle(row);
        if (/(auto|scroll)/.test(style.overflowX) && row.scrollWidth > row.clientWidth) return row;
        row = row.parentElement;
    }
    return null;
};

// Last focused card of each shelf: coming back to a row returns to the same card, as on Netflix
const rowMemory = new WeakMap();

/**
 * Nearest element in a direction.
 * Left/right: same line only, closest first. Up/down: the nearest line first, then the
 * element closest to the current column (so moving down never skips a row).
 */
const findNext = (from, direction) => {
    const a = from.getBoundingClientRect();
    const ac = center(a);
    const horizontal = direction === 'left' || direction === 'right';
    const found = [];

    for (const el of candidates()) {
        if (el === from || from.contains(el) || el.contains(from)) continue;
        const b = el.getBoundingClientRect();
        const bc = center(b);
        let along;
        let across;
        if (direction === 'right') { if (bc.x <= ac.x) continue; along = b.left - a.right; across = Math.abs(bc.y - ac.y); }
        if (direction === 'left') { if (bc.x >= ac.x) continue; along = a.left - b.right; across = Math.abs(bc.y - ac.y); }
        if (direction === 'down') { if (bc.y <= ac.y + 4) continue; along = b.top - a.bottom; across = Math.abs(bc.x - ac.x); }
        if (direction === 'up') { if (bc.y >= ac.y - 4) continue; along = a.top - b.bottom; across = Math.abs(bc.x - ac.x); }
        // Left/right stay on the same line (a row of cards); at its end, focus stays put
        if (horizontal && (b.bottom <= a.top + 4 || b.top >= a.bottom - 4)) continue;
        found.push({ el, along: Math.max(along, 0), across, height: b.height });
    }
    if (!found.length) return null;

    if (horizontal) {
        found.sort((p, q) => (p.along + p.across * 3) - (q.along + q.across * 3));
        return found[0].el;
    }

    // Keep only the nearest line, then pick the element under the current column
    const nearest = Math.min(...found.map(f => f.along));
    const band = Math.max(24, Math.min(a.height, 120) * 0.5);
    const line = found.filter(f => f.along <= nearest + band);
    line.sort((p, q) => p.across - q.across);
    const best = line[0].el;

    // Entering a shelf: go back to the card last focused there
    const row = rowOf(best);
    if (row && row !== rowOf(from)) {
        const remembered = rowMemory.get(row);
        if (remembered && remembered.isConnected && row.contains(remembered) && isVisible(remembered)) return remembered;
    }
    return best;
};

const firstInView = () => {
    const els = candidates();
    return els.find(el => {
        const r = el.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= window.innerHeight && !el.closest('nav');
    }) || els[0] || null;
};

const scrollRowTo = (el, row) => {
    // Bring the element fully inside its shelf of cards
    if (!row) return;
    const r = el.getBoundingClientRect();
    const box = row.getBoundingClientRect();
    const pad = Math.min(80, box.width * 0.06);
    if (r.right > box.right - pad) row.scrollLeft += r.right - box.right + pad;
    else if (r.left < box.left + pad) row.scrollLeft -= box.left + pad - r.left;
};

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const moveFocus = (el, direction, repeating) => {
    el.focus({ preventScroll: true });
    const row = rowOf(el);
    if (row) rowMemory.set(row, el);
    scrollRowTo(el, row);
    if (direction === 'up' || direction === 'down') {
        const r = el.getBoundingClientRect();
        // Elements near the top of the page scroll it back to the very top (hero, menu)
        const target = window.scrollY + r.top < window.innerHeight * 0.5
            ? 0
            : window.scrollY + r.top + r.height / 2 - window.innerHeight * 0.45;
        // Holding a key: jump instead of stacking smooth scrolls, which lags on TV boxes
        window.scrollTo({ top: Math.max(0, target), behavior: repeating || reducedMotion() ? 'auto' : 'smooth' });
    }
};

// The Android app adds "AltyflixTV" to its user agent: remote mode from the start,
// and the TV gets the lighter rendering defined in tvNavigation.css.
// `?tv=1` turns the same mode on in any browser (testing); `?tv=0` turns it off.
const detectTvApp = () => {
    if (typeof window === 'undefined') return false;
    try {
        const flag = new URLSearchParams(window.location.search).get('tv');
        if (flag === '1') sessionStorage.setItem('altyflix_tv', '1');
        if (flag === '0') sessionStorage.removeItem('altyflix_tv');
        if (sessionStorage.getItem('altyflix_tv') === '1') return true;
    } catch { /* storage blocked: rely on the user agent */ }
    return /AltyflixTV/.test(navigator.userAgent);
};
const IN_TV_APP = detectTvApp();

// TVs report 960×540 CSS pixels (1080p at density 2), a tablet layout with a collapsed
// menu. Lay the page out at 1280×720, as TV apps do, and let the WebView scale it to the screen.
if (IN_TV_APP && typeof document !== 'undefined' && /AltyflixTV/.test(navigator.userAgent)) {
    document.querySelector('meta[name="viewport"]')?.setAttribute('content', 'width=1280, user-scalable=no');
}

// After a page change, focus its main action (first control in view, outside the menu)
// as soon as it is rendered, so the remote works without a first "wake up" press.
const focusPage = () => {
    let tries = 0;
    const attempt = () => {
        const active = document.activeElement;
        if (active && active !== document.body && isVisible(active) && !active.closest('nav')) return;
        const el = candidates().find(c => {
            const r = c.getBoundingClientRect();
            // Never a text field: focusing one opens the TV's on-screen keyboard
            return r.top >= 0 && r.bottom <= window.innerHeight && !c.closest('nav, header') && !TYPING.has(c.tagName);
        });
        if (el) el.focus({ preventScroll: true });
        else if (++tries < 20) setTimeout(attempt, 150);
    };
    setTimeout(attempt, 250);
};

const useTVNavigation = () => {
    // Page changes (the hook runs above the router, so watch the address itself)
    useEffect(() => {
        if (!IN_TV_APP) return undefined;
        let last = window.location.pathname;
        focusPage();
        const timer = setInterval(() => {
            if (window.location.pathname !== last) { last = window.location.pathname; focusPage(); }
        }, 300);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        const root = document.documentElement;

        const onKeyDown = (e) => {
            if (e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented) return;
            const active = document.activeElement;
            const typing = active && TYPING.has(active.tagName) && active.type !== 'checkbox' && active.type !== 'radio';

            if (e.key === 'Backspace' && !typing) {
                if (window.history.length > 1) { e.preventDefault(); window.history.back(); }
                return;
            }

            const direction = DIRECTIONS[e.key];
            if (!direction) return;
            // Single-line text fields keep left/right for the cursor, but up/down leave the
            // field (e.g. from the search box down to the results). Lists, textareas and
            // sliders keep all their arrow keys.
            const singleLine = active?.tagName === 'INPUT';
            const vertical = direction === 'up' || direction === 'down';
            if (typing && !(singleLine && vertical)) return;
            if (active?.getAttribute('role') === 'slider' || active?.type === 'range') return;

            root.classList.add('tv-nav');
            const from = active && active !== document.body && isVisible(active) ? active : null;
            const next = from ? findNext(from, direction) : firstInView();
            if (next) {
                e.preventDefault();
                moveFocus(next, direction, e.repeat);
            } else if (from && !vertical) {
                // End of a row: stay put instead of letting the browser scroll sideways
                e.preventDefault();
            }
        };

        if (IN_TV_APP) root.classList.add('tv-nav', 'tv-app');

        const onPointer = () => { if (!IN_TV_APP) root.classList.remove('tv-nav'); };

        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('mousemove', onPointer, { passive: true });
        window.addEventListener('pointerdown', onPointer, { passive: true });
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('mousemove', onPointer);
            window.removeEventListener('pointerdown', onPointer);
            root.classList.remove('tv-nav', 'tv-app');
        };
    }, []);
};

export default useTVNavigation;
