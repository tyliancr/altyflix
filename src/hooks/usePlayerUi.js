// Petits hooks d'interface du lecteur : contrôles auto-masqués, plein écran, raccourcis, sous-titres, miniatures.
import { useCallback, useEffect, useRef, useState } from 'react';

/** Affiche les contrôles à la moindre activité et les masque après `delay` ms, sauf si `locked`. */
export function useIdleControls({ delay = 3000, locked = false } = {}) {
    const [visible, setVisible] = useState(true);
    const timer = useRef(null);
    const lockedRef = useRef(locked);
    lockedRef.current = locked;

    const arm = useCallback(() => {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => { if (!lockedRef.current) setVisible(false); }, delay);
    }, [delay]);
    const show = useCallback(() => { setVisible(true); arm(); }, [arm]);
    const hide = useCallback(() => { clearTimeout(timer.current); if (!lockedRef.current) setVisible(false); }, []);

    useEffect(() => {
        if (locked) { clearTimeout(timer.current); setVisible(true); } else arm();
        return () => clearTimeout(timer.current);
    }, [locked, arm]);

    return { visible, show, hide };
}

/** Plein écran du conteneur ; sur iPhone (pas d'API Fullscreen), plein écran natif de la vidéo. */
export function useFullscreen(containerRef, videoRef) {
    const [active, setActive] = useState(false);

    useEffect(() => {
        const video = videoRef.current;
        const onChange = () => setActive(Boolean(document.fullscreenElement || document.webkitFullscreenElement));
        const onBegin = () => setActive(true);
        const onEnd = () => setActive(false);
        document.addEventListener('fullscreenchange', onChange);
        document.addEventListener('webkitfullscreenchange', onChange);
        video?.addEventListener('webkitbeginfullscreen', onBegin);
        video?.addEventListener('webkitendfullscreen', onEnd);
        return () => {
            document.removeEventListener('fullscreenchange', onChange);
            document.removeEventListener('webkitfullscreenchange', onChange);
            video?.removeEventListener('webkitbeginfullscreen', onBegin);
            video?.removeEventListener('webkitendfullscreen', onEnd);
        };
    }, [videoRef]);

    const toggle = useCallback(async () => {
        const container = containerRef.current;
        const video = videoRef.current;
        try {
            if (document.fullscreenElement || document.webkitFullscreenElement) {
                await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
                screen.orientation?.unlock?.();
            } else if (container?.requestFullscreen || container?.webkitRequestFullscreen) {
                await (container.requestFullscreen || container.webkitRequestFullscreen).call(container);
                // Paysage forcé sur mobile ; refusé (sans gravité) sur ordinateur.
                await screen.orientation?.lock?.('landscape').catch(() => {});
            } else if (video?.webkitEnterFullscreen) {
                video.webkitEnterFullscreen();
            }
        } catch { /* refusé par le navigateur : on reste en mode fenêtré */ }
    }, [containerRef, videoRef]);

    return { active, toggle };
}

/** Raccourcis clavier. `handlers` : { ' ': fn, k: fn, ArrowLeft: fn, ... } (lettres en minuscules). */
export function usePlayerShortcuts(handlers, enabled = true) {
    const ref = useRef(handlers);
    ref.current = handlers;
    useEffect(() => {
        if (!enabled) return undefined;
        const onKeyDown = event => {
            if (event.ctrlKey || event.metaKey || event.altKey) return;
            const target = event.target;
            if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
            // Espace / Entrée sur un bouton ou un curseur : on laisse l'élément réagir.
            const onControl = target instanceof HTMLElement && target.closest('button, [role="slider"], [role="menuitemradio"]');
            if (onControl && (event.key === ' ' || event.key === 'Enter' || (target.getAttribute('role') === 'slider' && event.key.startsWith('Arrow')))) return;
            const handler = ref.current[event.key.length === 1 ? event.key.toLowerCase() : event.key];
            if (!handler) return;
            event.preventDefault();
            handler(event);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [enabled]);
}

const KINDS = ['subtitles', 'captions', 'forced'];

/** Texte des sous-titres actifs, lu sur les pistes en mode "hidden" (le rendu est fait par SubtitleOverlay). */
export function useSubtitleCues(videoRef, refreshKey) {
    const [lines, setLines] = useState([]);
    useEffect(() => {
        const video = videoRef.current;
        if (!video?.textTracks) return undefined;
        const bound = new Set();
        const update = () => {
            const next = [];
            for (const track of Array.from(video.textTracks)) {
                if (!KINDS.includes(track.kind) || track.mode !== 'hidden') continue;
                for (const cue of Array.from(track.activeCues || [])) {
                    // Les balises WebVTT (<i>, <c.x>, <v Nom>…) sont retirées : on n'injecte jamais de HTML.
                    const text = String(cue.text || '').replace(/<[^>]+>/g, '').trim();
                    if (text) next.push(text);
                }
            }
            setLines(previous => (previous.length === next.length && previous.every((line, i) => line === next[i]) ? previous : next));
        };
        const bind = () => {
            for (const track of Array.from(video.textTracks)) {
                if (bound.has(track)) continue;
                bound.add(track);
                track.addEventListener('cuechange', update);
            }
            update();
        };
        video.textTracks.addEventListener('addtrack', bind);
        video.textTracks.addEventListener('change', bind);
        bind();
        return () => {
            video.textTracks.removeEventListener('addtrack', bind);
            video.textTracks.removeEventListener('change', bind);
            bound.forEach(track => track.removeEventListener('cuechange', update));
            setLines([]);
        };
    }, [videoRef, refreshKey]);
    return lines;
}

const seconds = stamp => stamp.split(':').reduce((total, part) => total * 60 + Number(part), 0);

/** Charge la planche de miniatures (thumbs.vtt) et renvoie une fonction temps → vignette. */
export function useThumbnails(vttUrl) {
    const [cues, setCues] = useState([]);
    useEffect(() => {
        setCues([]);
        if (!vttUrl) return undefined;
        const controller = new AbortController();
        fetch(vttUrl, { signal: controller.signal })
            .then(response => (response.ok ? response.text() : ''))
            .then(text => {
                const parsed = [];
                const pattern = /([\d:.]+)\s+-->\s+([\d:.]+)\s*\n(\S+?)#xywh=(\d+),(\d+),(\d+),(\d+)/g;
                let match;
                while ((match = pattern.exec(text))) {
                    parsed.push({
                        start: seconds(match[1]), end: seconds(match[2]),
                        url: new URL(match[3], vttUrl).href, // même dossier signé que le .vtt
                        x: Number(match[4]), y: Number(match[5]), width: Number(match[6]), height: Number(match[7]),
                    });
                }
                setCues(parsed);
            })
            .catch(() => {});
        return () => controller.abort();
    }, [vttUrl]);

    return useCallback(time => cues.find(cue => time >= cue.start && time < cue.end) || cues.at(-1) || null, [cues]);
}
