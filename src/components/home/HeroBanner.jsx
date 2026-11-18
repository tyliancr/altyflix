import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlayer } from '../../contexts/PlayerContext';
import { getContentType, formatRuntime } from '../../utils/helpers';
import tmdb from '../../services/tmdb';
import { motion, AnimatePresence } from 'framer-motion';
import AltyflixLogo from '../common/AltyflixLogo';
import SmartImage from '../common/SmartImage';

const GENRE_NAMES = {
    28: 'Action', 12: 'Aventure', 16: 'Animation', 35: 'Comédie', 80: 'Crime',
    99: 'Documentaire', 18: 'Drame', 10751: 'Famille', 14: 'Fantaisie', 36: 'Histoire',
    27: 'Horreur', 10402: 'Musique', 9648: 'Mystère', 10749: 'Romance', 878: 'Sci-Fi',
    10770: 'Téléfilm', 53: 'Thriller', 10752: 'Guerre', 37: 'Western',
    10759: 'Action & Aventure', 10762: 'Enfants', 10765: 'Sci-Fi & Fantastique',
};

const SLIDE_DURATION_MS = 9000;
const LOGO_TIMEOUT_MS = 2500;
const EASE = [0.16, 1, 0.3, 1];

const idOf = (m) => m?.id || m?.contentId;
const isTvItem = (m) => Boolean(m) && (getContentType(m) === 'tv' || Number(idOf(m)) === 220102);
const backdrop = (path, size) => `https://image.tmdb.org/t/p/${size}${path}`;

// Text fallback scales with title length so long titles never swallow the hero.
const titleSize = (title = '') => {
    if (title.length <= 14) return 'text-5xl sm:text-7xl lg:text-[5.5rem]';
    if (title.length <= 28) return 'text-4xl sm:text-6xl lg:text-7xl';
    return 'text-3xl sm:text-5xl lg:text-6xl';
};

/**
 * Full-bleed featured carousel.
 * `rankLabel` (e.g. "des tendances") turns on the "N° 1 …" chart marker.
 */
const HeroBanner = ({ movie: propMovie, movies: propMovies, rankLabel }) => {
    const movies = useMemo(() => {
        return propMovies || (propMovie ? [propMovie] : []);
    }, [propMovies, propMovie]);
    const [activeIndex, setActiveIndex] = useState(0);
    const [detailedMovie, setDetailedMovie] = useState(null);
    const [trailerKey, setTrailerKey] = useState(null);
    const [showTrailer, setShowTrailer] = useState(false);
    const [hovered, setHovered] = useState(false);
    // id -> logo URL, or null once we know the title has no artwork
    const [logos, setLogos] = useState({});
    const navigate = useNavigate();
    const { play } = usePlayer();

    const paused = hovered || showTrailer;

    // Reset index when movies list changes
    useEffect(() => {
        setActiveIndex(0);
    }, [propMovies, propMovie]);

    // Auto-advance. Pausing keeps the time already elapsed, so the timer stays
    // in step with the progress indicator when the hero is resumed.
    const remainingMs = useRef(SLIDE_DURATION_MS);
    const timedIndex = useRef(-1);
    useEffect(() => {
        if (timedIndex.current !== activeIndex) {
            timedIndex.current = activeIndex;
            remainingMs.current = SLIDE_DURATION_MS;
        }
        if (movies.length <= 1 || paused) return;
        const startedAt = Date.now();
        const timer = setTimeout(() => {
            setActiveIndex(prev => (prev + 1) % movies.length);
        }, remainingMs.current);
        return () => {
            clearTimeout(timer);
            remainingMs.current = Math.max(400, remainingMs.current - (Date.now() - startedAt));
        };
    }, [movies.length, activeIndex, paused]);

    // Title artwork for every slide, fetched up front so slide changes are instant
    useEffect(() => {
        let active = true;
        movies.forEach((m) => {
            const id = idOf(m);
            if (!id) return;
            Promise.race([
                tmdb.getTitleLogo(isTvItem(m) ? 'tv' : 'movie', id),
                new Promise(resolve => setTimeout(() => resolve(null), LOGO_TIMEOUT_MS)),
            ]).then((url) => {
                if (active) setLogos(prev => (id in prev && prev[id] ? prev : { ...prev, [id]: url }));
            });
        });
        return () => { active = false; };
    }, [movies]);

    // Warm the next backdrop so the crossfade never shows a half-loaded image
    useEffect(() => {
        const next = movies[(activeIndex + 1) % movies.length];
        if (movies.length > 1 && next?.backdrop_path) {
            const img = new Image();
            img.src = backdrop(next.backdrop_path, 'w1280');
        }
    }, [movies, activeIndex]);

    const movie = movies[activeIndex];
    const isTv = isTvItem(movie);

    useEffect(() => {
        if (!movie) return;

        let isMounted = true;
        setDetailedMovie(null);
        setTrailerKey(null);
        setShowTrailer(false);

        const fetchDetails = async () => {
            try {
                const id = idOf(movie);
                if (!id) return;
                let data;
                if (isTv) {
                    try {
                        data = await tmdb.getSeriesDetails(id);
                    } catch {
                        data = await tmdb.getMovieDetails(id);
                    }
                } else {
                    try {
                        data = await tmdb.getMovieDetails(id);
                    } catch {
                        data = await tmdb.getSeriesDetails(id);
                    }
                }
                if (isMounted) {
                    setDetailedMovie(data);
                    const videos = data?.videos?.results || [];
                    const trailer = videos.find(v => v.type === 'Trailer' && v.site === 'YouTube') || videos.find(v => v.site === 'YouTube');
                    if (trailer) setTrailerKey(trailer.key);
                }
            } catch (err) {
                console.error("Failed to fetch detailed info for hero banner:", err);
            }
        };

        fetchDetails();
        return () => { isMounted = false; };
    }, [movie, isTv]);

    if (!movie) {
        return (
            <div className="w-full h-[85vh] sm:h-[100vh] bg-[#060608] relative overflow-hidden">
                <div className="absolute inset-0 skeleton !rounded-none !bg-[#0c0c10]" />
                <div className="absolute inset-x-0 bottom-0 h-[60vh] bg-gradient-to-t from-[#060608] to-transparent" />
                <div className="absolute left-[4%] md:left-[5%] bottom-[22vh] sm:bottom-[18vh] space-y-4 w-[min(80%,520px)]">
                    <div className="skeleton h-16 sm:h-24 w-3/4 !rounded-xl" />
                    <div className="skeleton h-4 w-1/2" />
                    <div className="skeleton h-4 w-full" />
                    <div className="skeleton h-12 w-40 !rounded-xl" />
                </div>
            </div>
        );
    }

    const movieId = idOf(movie);
    const title = movie.title || movie.name || movie.original_title || movie.original_name;
    const description = movie.overview;
    const logo = logos[movieId];
    const logoPending = !(movieId in logos);

    const genres = detailedMovie?.genres?.slice(0, 3) ||
        (movie.genre_ids?.slice(0, 3).map(id => ({ id, name: GENRE_NAMES[id] })).filter(g => g.name)) || [];
    const year = (movie.release_date || movie.first_air_date)?.substring(0, 4);
    const length = isTv
        ? (detailedMovie?.number_of_seasons ? `${detailedMovie.number_of_seasons} saison${detailedMovie.number_of_seasons > 1 ? 's' : ''}` : null)
        : (detailedMovie?.runtime ? formatRuntime(detailedMovie.runtime) : null);
    const facts = [year, length, ...genres.map(g => g.name)].filter(Boolean);

    return (
        <div
            className="relative w-full h-[85vh] sm:h-[100vh] overflow-hidden text-white bg-[#060608]"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            {/* Backdrops crossfade into each other — the frame never cuts to black */}
            <AnimatePresence initial={false}>
                <motion.div
                    key={movieId}
                    className="absolute inset-0 z-0"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1.1, ease: 'easeInOut' }}
                >
                    {movie.backdrop_path && (
                        <SmartImage
                            src={backdrop(movie.backdrop_path, 'w1280')}
                            srcSet={`${backdrop(movie.backdrop_path, 'w780')} 780w, ${backdrop(movie.backdrop_path, 'w1280')} 1280w`}
                            sizes="100vw"
                            fallbackSrc={backdrop(movie.backdrop_path, 'w780')}
                            alt=""
                            className="w-full h-full object-cover object-[center_20%]"
                            loading="eager"
                            fetchPriority="high"
                            decoding="async"
                            fade={false}
                        />
                    )}
                </motion.div>
            </AnimatePresence>

            {/* Cinematic grade: left scrim for legibility, deep fade into the page */}
            <div className="absolute inset-0 z-[1] pointer-events-none">
                <div className="absolute inset-y-0 left-0 w-full sm:w-[70%] bg-gradient-to-r from-[#060608]/95 via-[#060608]/55 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 h-[55vh] bg-gradient-to-t from-[#060608] via-[#060608]/70 to-transparent" />
                <div className="absolute inset-x-0 top-0 h-[22vh] bg-gradient-to-b from-[#060608]/80 to-transparent" />
            </div>

            <div className="relative z-10 h-full flex flex-col justify-end px-[4%] md:px-[5%] pb-[22vh] sm:pb-[17vh]">
                <motion.div
                    key={movieId}
                    initial="hidden"
                    animate="show"
                    variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.15 } } }}
                    className="max-w-2xl lg:max-w-3xl"
                >
                    {/* Eyebrow - Style Officiel Netflix */}
                    <motion.div
                        variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } } }}
                        className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-5 flex-wrap"
                    >
                        <div className="inline-flex items-center gap-2">
                            <AltyflixLogo size={18} />
                            <span className="text-[11px] sm:text-xs font-black uppercase tracking-[0.26em] text-white/95">
                                {isTv ? 'SÉRIE' : 'FILM'}
                            </span>
                        </div>
                        {rankLabel && movies.length > 1 && (
                            <div className="inline-flex items-center gap-2 text-[11px] sm:text-xs font-bold text-white">
                                <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-[3px] bg-[#E50914] text-white font-black text-[10px] tracking-wider uppercase leading-none shadow-sm">
                                    TOP 10
                                </span>
                                <span className="font-extrabold tracking-tight">
                                    N° {activeIndex + 1} du Top 10 aujourd&apos;hui
                                </span>
                            </div>
                        )}
                    </motion.div>

                    {/* Title: official artwork when it exists, type otherwise */}
                    <motion.div
                        variants={{ hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { duration: 0.8, ease: EASE } } }}
                        className="mb-4 sm:mb-6"
                    >
                        {logo ? (
                            <>
                                <h1 className="sr-only">{title}</h1>
                                <img
                                    src={logo}
                                    alt=""
                                    className="max-h-[16vh] sm:max-h-[24vh] max-w-[78%] sm:max-w-[min(520px,42vw)] w-auto object-contain object-left-bottom"
                                    style={{ filter: 'drop-shadow(0 0 1px rgba(255,255,255,0.55)) drop-shadow(0 6px 24px rgba(0,0,0,0.65))' }}
                                    onError={() => setLogos(prev => ({ ...prev, [movieId]: null }))}
                                    decoding="async"
                                />
                            </>
                        ) : (
                            <h1
                                className={`${titleSize(title)} font-black font-display tracking-[-0.035em] leading-[0.92] text-white text-balance transition-opacity duration-500 ${logoPending ? 'opacity-0' : 'opacity-100'}`}
                                style={{ textShadow: '0 8px 40px rgba(0,0,0,0.7)' }}
                            >
                                {title}
                            </h1>
                        )}
                    </motion.div>

                    {/* Facts line — only real data, quietly separated */}
                    <motion.div
                        variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } } }}
                        className="flex items-center gap-x-2.5 gap-y-1 text-[13px] sm:text-[15px] font-medium text-white/75 mb-3 sm:mb-4 flex-wrap"
                    >
                        {movie.vote_average > 0 && (
                            <span className="font-bold text-[#46d369]">
                                {Math.round(movie.vote_average * 10)}% recommandé
                            </span>
                        )}
                        {facts.map((fact, i) => (
                            <span key={fact} className="flex items-center gap-2.5">
                                {(i > 0 || movie.vote_average > 0) && <span aria-hidden="true" className="w-[3px] h-[3px] rounded-full bg-white/40" />}
                                {fact}
                            </span>
                        ))}
                    </motion.div>

                    {description && (
                        <motion.p
                            variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } } }}
                            className="text-sm sm:text-[1.05rem] text-white/85 mb-6 sm:mb-8 max-w-[92%] sm:max-w-xl leading-relaxed line-clamp-2 sm:line-clamp-3"
                            style={{ textShadow: '0 1px 12px rgba(0,0,0,0.6)' }}
                        >
                            {description}
                        </motion.p>
                    )}

                    {/* Actions */}
                    <motion.div
                        variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } } }}
                        className="flex items-center gap-2.5 sm:gap-3 flex-wrap"
                    >
                        <motion.button
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                            onClick={() => play(movie)}
                            className="flex items-center justify-center gap-2.5 bg-white text-black pl-5 pr-7 sm:pl-6 sm:pr-8 h-12 sm:h-[52px] rounded-xl text-base sm:text-lg font-bold hover:bg-white/85 transition-colors duration-200 shadow-[0_10px_40px_rgba(0,0,0,0.45)]"
                        >
                            <svg className="w-6 h-6 sm:w-7 sm:h-7 fill-current flex-shrink-0" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                            </svg>
                            <span>Lecture</span>
                        </motion.button>

                        <motion.button
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                            onClick={() => navigate(`/${isTv ? 'tv' : 'movie'}/${movieId}`)}
                            className="flex items-center justify-center gap-2.5 bg-white/[0.14] hover:bg-white/[0.22] backdrop-blur-xl border border-white/15 text-white px-5 sm:px-7 h-12 sm:h-[52px] rounded-xl text-base sm:text-lg font-semibold transition-colors duration-200"
                        >
                            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span>{"Plus d'infos"}</span>
                        </motion.button>

                        <AnimatePresence>
                            {trailerKey && (
                                <motion.button
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.8 }}
                                    whileHover={{ scale: 1.06 }}
                                    whileTap={{ scale: 0.94 }}
                                    onClick={() => setShowTrailer(true)}
                                    aria-label="Voir la bande-annonce"
                                    title="Bande-annonce"
                                    className="grid place-items-center w-12 h-12 sm:w-[52px] sm:h-[52px] rounded-full border border-white/30 hover:border-white bg-black/30 hover:bg-white/10 backdrop-blur-xl text-white transition-colors duration-200"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                </motion.button>
                            )}
                        </AnimatePresence>
                    </motion.div>
                </motion.div>
            </div>

            {/* Slide indicators double as the auto-advance timer */}
            {movies.length > 1 && (
                <div className="absolute right-[4%] md:right-[5%] bottom-[22vh] sm:bottom-[17vh] z-20 flex items-center gap-1.5">
                    {movies.map((m, idx) => {
                        const isActive = activeIndex === idx;
                        return (
                            <button
                                key={idOf(m) || idx}
                                onClick={() => setActiveIndex(idx)}
                                aria-label={`Afficher le titre ${idx + 1}`}
                                aria-current={isActive ? 'true' : undefined}
                                className="group py-3"
                            >
                                <span className={`block h-[3px] rounded-full overflow-hidden transition-all duration-500 ${isActive ? 'w-10 bg-white/25' : 'w-4 bg-white/30 group-hover:bg-white/60'}`}>
                                    {isActive && (
                                        <span
                                            key={idx}
                                            className="block h-full w-full bg-white origin-left hero-progress"
                                            style={{ animationDuration: `${SLIDE_DURATION_MS}ms`, animationPlayState: paused ? 'paused' : 'running' }}
                                        />
                                    )}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Trailer Modal */}
            <AnimatePresence>
                {showTrailer && trailerKey && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[500] flex items-center justify-center bg-black/90 backdrop-blur-sm"
                        onClick={() => setShowTrailer(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.94, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.94, opacity: 0 }}
                            transition={{ type: 'spring', damping: 26, stiffness: 260 }}
                            className="relative w-full max-w-5xl aspect-video mx-4 rounded-2xl overflow-hidden ring-1 ring-white/10 shadow-[0_40px_100px_rgba(0,0,0,0.85)]"
                            onClick={e => e.stopPropagation()}
                        >
                            <iframe
                                src={`https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&modestbranding=1&rel=0`}
                                title="Bande-annonce"
                                className="w-full h-full"
                                frameBorder="0"
                                allow="autoplay; encrypted-media; fullscreen"
                                allowFullScreen
                                referrerPolicy="strict-origin-when-cross-origin"
                            />
                            <button
                                onClick={() => setShowTrailer(false)}
                                aria-label="Fermer"
                                className="absolute top-3 right-3 w-10 h-10 rounded-full bg-black/60 backdrop-blur-md text-white flex items-center justify-center hover:bg-black/80 transition-all"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default HeroBanner;
