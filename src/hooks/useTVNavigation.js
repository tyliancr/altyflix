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

/** Nearest element in a direction: distance along the axis, plus a penalty for drifting sideways. */
const findNext = (from, direction) => {
    const a = from.getBoundingClientRect();
    const ac = center(a);
    let best = null;
    let bestScore = Infinity;

    for (const el of candidates()) {
        if (el === from || from.contains(el) || el.contains(from)) continue;
        const b = el.getBoundingClientRect();
        const bc = center(b);
        let along;
        let across;
        if (direction === 'right') { if (bc.x <= ac.x) continue; along = b.left - a.right; across = Math.abs(bc.y - ac.y); }
        if (direction === 'left') { if (bc.x >= ac.x) continue; along = a.left - b.right; across = Math.abs(bc.y - ac.y); }
        if (direction === 'down') { if (bc.y <= ac.y) continue; along = b.top - a.bottom; across = Math.abs(bc.x - ac.x); }
        if (direction === 'up') { if (bc.y >= ac.y) continue; along = a.top - b.bottom; across = Math.abs(bc.x - ac.x); }
        const horizontal = direction === 'left' || direction === 'right';
        // Left/right stay on the same line (a row of cards); at its end, focus stays put
        if (horizontal && (b.bottom <= a.top + 4 || b.top >= a.bottom - 4)) continue;
        const score = Math.max(along, 0) + across * (horizontal ? 3 : 0.6);
        if (score < bestScore) { bestScore = score; best = el; }
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

const scrollRowTo = (el) => {
    // Bring the element fully inside its horizontally scrolling row (shelves of cards)
    let row = el.parentElement;
    while (row && row !== document.body) {
        const style = getComputedStyle(row);
        if (/(auto|scroll)/.test(style.overflowX) && row.scrollWidth > row.clientWidth) break;
        row = row.parentElement;
    }
    if (!row || row === document.body) return;
    const r = el.getBoundingClientRect();
    const box = row.getBoundingClientRect();
    const pad = Math.min(80, box.width * 0.06);
    if (r.right > box.right - pad) row.scrollLeft += r.right - box.right + pad;
    else if (r.left < box.left + pad) row.scrollLeft -= box.left + pad - r.left;
};

const moveFocus = (el, direction) => {
    el.focus({ preventScroll: true });
    scrollRowTo(el);
    if (direction === 'up' || direction === 'down') {
        const r = el.getBoundingClientRect();
        const target = window.scrollY + r.top + r.height / 2 - window.innerHeight / 2;
        window.scrollTo({ top: Math.max(0, target), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
};

const useTVNavigation = () => {
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
                moveFocus(next, direction);
            }
        };

        const onPointer = () => root.classList.remove('tv-nav');

        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('mousemove', onPointer, { passive: true });
        window.addEventListener('pointerdown', onPointer, { passive: true });
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('mousemove', onPointer);
            window.removeEventListener('pointerdown', onPointer);
            root.classList.remove('tv-nav');
        };
    }, []);
};

export default useTVNavigation;
