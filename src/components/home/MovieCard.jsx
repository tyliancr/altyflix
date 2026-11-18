import { useState, useRef, memo, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getBackdropUrl, getPosterUrl, getContentType } from '../../utils/helpers';
import { getMovieDetails, getSeriesDetails } from '../../services/tmdb';
import { useProfile } from '../../contexts/ProfileContext';
import { usePlayer } from '../../contexts/PlayerContext';
import { motion, AnimatePresence } from 'framer-motion';
import SmartImage from '../common/SmartImage';

const GENRE_NAMES = {
    28: 'Action', 12: 'Aventure', 16: 'Animation', 35: 'Comédie', 80: 'Crime',
    99: 'Documentaire', 18: 'Drame', 10751: 'Famille', 14: 'Fantaisie', 36: 'Histoire',
    27: 'Horreur', 10402: 'Musique', 9648: 'Mystère', 10749: 'Romance', 878: 'Science-Fiction',
    10770: 'Téléfilm', 53: 'Thriller', 10752: 'Guerre', 37: 'Western',
    10759: 'Action & Aventure', 10762: 'Enfants', 10763: 'Actualités', 10764: 'Réalité',
    10765: 'Sci-Fi & Fantaisie', 10766: 'Soap', 10767: 'Talk-Show', 10768: 'Guerre & Politique'
};

const isNew = (content) => {
    const date = content.release_date || content.first_air_date;
    if (!date) return false;
    return (Date.now() - new Date(date).getTime()) / 86400000 < 30;
};

const cardDetailsCache = new Map();

// ─── Poster (portrait mode) ───────────────────────────────────────────────────
// The expansion is driven ONLY by the wrapper width (handled in ContentRow),
// NOT by changing the aspect-ratio, which would cause a full layout reflow.
// The card itself always fills its wrapper via absolute positioning.

const MovieCard = memo(({
    content,
    contentType = 'movie',
    onAddToList,
    onRemoveFromList,
    isInList = false,
    progress,
    portrait = true,
    onExpand,
    onCollapse,
    myIndex,
    isExpanded = false,
    isTop10: propIsTop10 = false,
    eager = false,
}) => {
    const navigate = useNavigate();
    const { play } = usePlayer();
    const { addToMyList, removeFromMyList, isInMyList, currentProfile } = useProfile();
    const inList = Boolean(isInList || isInMyList?.(content));
    const trailerIframeRef = useRef(null);

    const [trailerKey, setTrailerKey] = useState(null);
    const [trailerLoaded, setTrailerLoaded] = useState(false);
    const [fullDetails, setFullDetails] = useState(null);
    const [warmBackdrop, setWarmBackdrop] = useState(false);

    const expandTimeout = useRef(null);
    const collapseTimeout = useRef(null);

    const title = content.title || content.name;
    const isUpcoming = Boolean(content.release_date && new Date(content.release_date) > new Date());
    const showNewBadge = Boolean(isNew(content) && !isUpcoming);
    const isTop10 = Boolean(propIsTop10 && !showNewBadge && !isUpcoming);

    const getMediaType = useCallback(() => {
        const detected = getContentType(content, contentType);
        if (detected === 'person') return contentType && contentType !== 'mixed' ? contentType : 'movie';
        if (detected === 'mixed') {
            return (content.first_air_date || content.name || (content.season !== undefined && content.season !== null) || Number(content.id || content.contentId) === 220102) ? 'tv' : 'movie';
        }
        return detected;
    }, [content, contentType]);

    const actualType = useMemo(() => getMediaType(), [getMediaType]);
    const contentId = content.id || content.contentId;

    const posterSrc = useMemo(() => getPosterUrl(content.poster_path, 'w342'), [content.poster_path]);
    const backdropSrc = useMemo(() => getBackdropUrl(content.backdrop_path || content.poster_path, 'w500'), [content.backdrop_path, content.poster_path]);

    const posterSrcSet = useMemo(() => {
        if (!content.poster_path) return undefined;
        return `${getPosterUrl(content.poster_path, 'w185')} 185w, ${getPosterUrl(content.poster_path, 'w342')} 342w, ${getPosterUrl(content.poster_path, 'w500')} 500w`;
    }, [content.poster_path]);

    const backdropSrcSet = useMemo(() => {
        const p = content.backdrop_path || content.poster_path;
        if (!p) return undefined;
        return `${getBackdropUrl(p, 'w300')} 300w, ${getBackdropUrl(p, 'w780')} 780w`;
    }, [content.backdrop_path, content.poster_path]);

    // ── Hover debounce: expand after 380ms, collapse after 120ms grace period ─
    const handleMouseEnter = useCallback(() => {
        if (isUpcoming) return;
        // Start loading the expanded backdrop only on hover (saves ~200 wasted eager downloads on Home)
        setWarmBackdrop(true);
        clearTimeout(collapseTimeout.current);
        clearTimeout(expandTimeout.current);
        expandTimeout.current = setTimeout(() => {
            if (onExpand) onExpand(myIndex);
        }, 380);
    }, [isUpcoming, onExpand, myIndex]);

    const handleMouseLeave = useCallback(() => {
        clearTimeout(expandTimeout.current);
        // Grace period — prevents flicker when moving between cards
        collapseTimeout.current = setTimeout(() => {
            if (onCollapse) onCollapse();
        }, 80);
    }, [onCollapse]);

    useEffect(() => () => {
        clearTimeout(expandTimeout.current);
        clearTimeout(collapseTimeout.current);
    }, []);

    const handlePlay = useCallback((e) => { e?.stopPropagation(); play(content); }, [play, content]);
    const handleNavigate = useCallback(() => { navigate(`/${actualType}/${contentId}`); }, [navigate, actualType, contentId]);
    const handleToggleList = useCallback((e) => {
        e?.stopPropagation();
        if (inList) {
            onRemoveFromList ? onRemoveFromList(contentId) : removeFromMyList(contentId);
        } else {
            onAddToList ? onAddToList(content) : addToMyList(content);
        }
    }, [inList, onRemoveFromList, onAddToList, contentId, content, removeFromMyList, addToMyList]);

    // ── Fetch trailer + details only when expanded (with memory cache) ───
    useEffect(() => {
        if (!isExpanded || currentProfile?.autoplayTrailers === false) {
            setTrailerKey(null);
            setTrailerLoaded(false);
            return;
        }

        const cacheKey = `${actualType}_${contentId}`;
        if (cardDetailsCache.has(cacheKey)) {
            const cached = cardDetailsCache.get(cacheKey);
            setFullDetails(cached.details);
            if (cached.trailerKey) setTrailerKey(cached.trailerKey);
            return;
        }

        const controller = new AbortController();
        const { signal } = controller;
        const fetchDetailsAndVideo = async () => {
            try {
                let data;
                if (actualType === 'tv') {
                    try {
                        data = await getSeriesDetails(contentId);
                    } catch {
                        data = await getMovieDetails(contentId);
                    }
                } else {
                    try {
                        data = await getMovieDetails(contentId);
                    } catch {
                        data = await getSeriesDetails(contentId);
                    }
                }
                if (signal.aborted || !data || data.success === false) return;
                setFullDetails(data);
                const videos = data.videos?.results || [];
                const trailer = videos.find(v => v.type === 'Trailer' && v.site === 'YouTube') || videos.find(v => v.site === 'YouTube');
                const key = trailer ? trailer.key : null;
                if (key && !signal.aborted) setTrailerKey(key);
                if (cardDetailsCache.size >= 100) cardDetailsCache.delete(cardDetailsCache.keys().next().value);
                cardDetailsCache.set(cacheKey, { details: data, trailerKey: key });
            } catch (err) {
                if (err.name !== 'AbortError') console.error('Failed to fetch card details', err);
            }
        };
        fetchDetailsAndVideo();
        return () => controller.abort();
    }, [isExpanded, contentId, actualType, currentProfile?.autoplayTrailers]);

    // Listen to YouTube player status: only fade in trailer when playback actually starts, and fall back to backdrop on error
    useEffect(() => {
        if (!isExpanded || !trailerKey) {
            setTrailerLoaded(false);
            return;
        }

        const handleMsg = (event) => {
            if (!event.origin?.includes('youtube')) return;
            if (trailerIframeRef.current && event.source !== trailerIframeRef.current.contentWindow) return;
            try {
                const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                if (!data) return;
                if (data.event === 'onError' || (data.info && [2, 5, 100, 101, 150, 153].includes(data.info))) {
                    setTrailerLoaded(false);
                    setTrailerKey(null);
                    return;
                }
                const state = data?.info?.playerState ?? (data?.event === 'onStateChange' ? data.info : undefined);
                if (state === 1) {
                    setTrailerLoaded(true);
                }
            } catch { /* ignore */ }
        };

        window.addEventListener('message', handleMsg);
        return () => window.removeEventListener('message', handleMsg);
    }, [isExpanded, trailerKey]);

    const displayData = fullDetails || content;
    const year = (displayData.release_date || displayData.first_air_date || content.release_date || content.first_air_date)?.substring(0, 4);
    const score = Math.round((displayData.vote_average || content.vote_average || 0) * 10);
    const desc = displayData.overview || content.overview;

    const genresList = useMemo(() => {
        if (fullDetails?.genres?.length > 0) return fullDetails.genres.map(g => g.name).slice(0, 2);
        if (content.genre_ids?.length > 0) return content.genre_ids.map(id => GENRE_NAMES[id] || 'Film').slice(0, 2);
        return [];
    }, [fullDetails, content.genre_ids]);

    return (
        /*
         * IMPORTANT: The card itself never changes its own size.
         * Width expansion is 100% driven by the wrapper <div> in ContentRow
         * using CSS transition on width (GPU compositor path).
         * This card fills its wrapper via w-full + pb-[150%] padding trick
         * for portrait aspect, or pb-[56.25%] for landscape when expanded.
         *
         * We switch between the two paddings with a CSS class — the browser
         * animates padding on the GPU when combined with will-change on wrapper.
         */
        <div
            className="w-full h-full relative cursor-pointer"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            role="link"
            tabIndex={0}
            aria-label={`Voir ${title}`}
            onKeyDown={e => { if (e.target === e.currentTarget && e.key === 'Enter') handleNavigate(); }}
            onClick={handleNavigate}
        >
            {/* ── Aspect Ratio Shell ────────────────────────────────────────────
                We use a padding-bottom trick to maintain aspect ratio without
                triggering layout recalculation on the sibling elements.
                The wrapper in ContentRow controls the actual width via CSS transition.
            ─────────────────────────────────────────────────────────────────── */}
            <div
                className="relative w-full overflow-hidden rounded-xl bg-[#101016] ring-1 ring-inset ring-white/[0.07] hover:ring-white/25"
                style={{
                    paddingBottom: isExpanded ? '56.25%' : '150%',
                    transition: 'padding-bottom 420ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 300ms ease',
                    boxShadow: isExpanded
                        ? '0 24px 60px rgba(0,0,0,0.85)'
                        : '0 6px 20px rgba(0,0,0,0.45)',
                    willChange: 'padding-bottom',
                }}
            >
                {/* ── Badges (Mutually exclusive: only 1 badge at most, no overlap) ──────── */}
                {!isExpanded && (isUpcoming || showNewBadge || isTop10) && (
                    <div className="absolute top-2 left-2 z-20 pointer-events-none">
                        {isUpcoming ? (
                            <span className="block px-1.5 py-1 rounded-md text-[9px] leading-none font-bold uppercase tracking-[0.12em] text-white bg-black/70 backdrop-blur-md border border-white/15">
                                À venir
                            </span>
                        ) : showNewBadge ? (
                            <span className="block px-1.5 py-1 rounded-md text-[9px] leading-none font-bold uppercase tracking-[0.12em] text-white bg-[#E50914] shadow-[0_2px_10px_rgba(0,0,0,0.5)]">
                                Nouveau
                            </span>
                        ) : isTop10 ? (
                            <span className="block px-1.5 py-1 rounded-md text-[9px] leading-none font-black uppercase tracking-[0.12em] text-white bg-[#E50914] shadow-[0_2px_10px_rgba(0,0,0,0.5)]">
                                Top 10
                            </span>
                        ) : null}
                    </div>
                )}

                {/* ── Poster (portrait) — crossfades to backdrop ────────────── */}
                <SmartImage
                    src={portrait ? posterSrc : backdropSrc}
                    srcSet={portrait ? posterSrcSet : backdropSrcSet}
                    sizes="(max-width: 640px) 130px, (max-width: 1024px) 180px, 210px"
                    fallbackSrc={portrait ? backdropSrc : posterSrc}
                    alt={title}
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{
                        opacity: isExpanded ? 0 : 1,
                        transform: isExpanded ? 'scale(1.04)' : 'scale(1)',
                        transition: 'opacity 500ms ease, transform 500ms ease',
                        pointerEvents: 'none',
                    }}
                    loading={eager ? 'eager' : 'lazy'}
                    decoding="async"
                    fallback={
                        <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-[#181822] to-[#0c0c12] p-3 text-center">
                            <span className="font-display text-xs sm:text-sm font-semibold text-white/60 line-clamp-3">
                                {title}
                            </span>
                        </div>
                    }
                />

                {/* ── Expanded Backdrop + Trailer (mounted on hover/expand only) ── */}
                <div
                    className="absolute inset-0 w-full h-full bg-[#141414]"
                    style={{
                        opacity: isExpanded ? 1 : 0,
                        transition: 'opacity 500ms ease',
                        pointerEvents: isExpanded ? 'auto' : 'none',
                    }}
                >
                    {/* Backdrop fallback — fetched on demand instead of eagerly for 200 hidden cards */}
                    {(warmBackdrop || isExpanded) && (
                        <SmartImage
                            src={backdropSrc}
                            fallbackSrc={posterSrc}
                            alt={title}
                            className="absolute inset-0 w-full h-full object-cover"
                            style={{
                                opacity: trailerLoaded ? 0 : 1,
                                transition: 'opacity 800ms ease',
                            }}
                            loading="eager"
                            decoding="async"
                        />
                    )}

                    {/* YouTube trailer — loaded only when expanded */}
                    {trailerKey && isExpanded && (
                        <div
                            className="absolute inset-0 w-full h-full"
                            style={{
                                opacity: trailerLoaded ? 1 : 0,
                                transition: 'opacity 800ms ease',
                            }}
                        >
                            <iframe
                                ref={trailerIframeRef}
                                src={`https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&mute=1&controls=0&modestbranding=1&playsinline=1&rel=0&iv_load_policy=3&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`}
                                title="Trailer"
                                className="absolute pointer-events-none"
                                style={{ width: '150%', height: '150%', top: '-25%', left: '-25%' }}
                                frameBorder="0"
                                allow="autoplay; encrypted-media"
                                referrerPolicy="strict-origin-when-cross-origin"
                                onLoad={(e) => {
                                    try {
                                        e.target?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*');
                                    } catch { /* ignore */ }
                                }}
                            />
                        </div>
                    )}

                    {/* Bottom gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0b0b0f]/95 via-black/20 to-transparent" />

                    {/* Title & Action buttons */}
                    <AnimatePresence>
                        {isExpanded && (
                            <motion.div
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 6 }}
                                transition={{ duration: 0.25, delay: 0.12 }}
                                className="absolute bottom-3 left-3 right-3 flex items-end justify-between z-20"
                            >
                                <h3 className="text-white font-bold text-base md:text-lg leading-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] truncate font-display tracking-tight w-3/4">
                                    {title}
                                </h3>
                                <div className="flex gap-2">
                                    <motion.button
                                        whileHover={{ scale: 1.15 }}
                                        whileTap={{ scale: 0.9 }}
                                        onClick={handlePlay}
                                        className="w-9 h-9 rounded-full bg-white flex items-center justify-center text-black shadow-[0_4px_16px_rgba(255,255,255,0.4)] hover:bg-white/95 transition-all"
                                        aria-label="Lire"
                                    >
                                        <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                                    </motion.button>
                                    <motion.button
                                        whileHover={{ scale: 1.15 }}
                                        whileTap={{ scale: 0.9 }}
                                        onClick={handleToggleList}
                                        className="w-9 h-9 rounded-full bg-black/60 backdrop-blur-md border border-white/40 hover:border-white text-white flex items-center justify-center shadow-lg transition-all"
                                        aria-label={inList ? 'Retirer de ma liste' : 'Ajouter à ma liste'}
                                    >
                                        {inList ? (
                                            <svg className="w-4 h-4 text-[#46d369]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                        ) : (
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                                        )}
                                    </motion.button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Watch progress bar */}
                {progress > 0 && progress < 95 && !isExpanded && (
                    <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/20 z-10">
                        <div className="h-full bg-[#E50914]" style={{ width: `${Math.min(progress, 100)}%` }} />
                    </div>
                )}
            </div>

            {/* ── Below-card Metadata ──────────────────────────────────────────
                Rendered below the card frame. Uses absolute positioning relative
                to the parent wrapper — does NOT affect row height.
            ─────────────────────────────────────────────────────────────────── */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        className="absolute top-full left-0 right-0 pt-2.5 z-[999] pointer-events-none"
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.25, delay: 0.1 }}
                    >
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-white/55 flex-wrap leading-tight">
                            {score > 0 && <span className="text-[#46d369] font-bold">{score}%</span>}
                            {year && <span>{score > 0 ? '· ' : ''}{year}</span>}
                            {genresList.length > 0 && (
                                <span className="text-white/85">{(score > 0 || year) ? '· ' : ''}{genresList.join(' · ')}</span>
                            )}
                        </div>
                        {desc && (
                            <p className="text-[11px] md:text-[12px] text-white/65 leading-snug line-clamp-2 mt-1.5 font-sans pr-4">
                                {desc}
                            </p>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
});

MovieCard.displayName = 'MovieCard';
export default MovieCard;

