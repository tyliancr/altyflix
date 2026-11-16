import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlayer } from '../../contexts/PlayerContext';
import { getContentType, formatRuntime } from '../../utils/helpers';
import tmdb from '../../services/tmdb';
import { motion, AnimatePresence } from 'framer-motion';

const GENRE_NAMES = {
    28: 'Action', 12: 'Aventure', 16: 'Animation', 35: 'Comédie', 80: 'Crime',
    99: 'Documentaire', 18: 'Drame', 10751: 'Famille', 14: 'Fantaisie', 36: 'Histoire',
    27: 'Horreur', 10402: 'Musique', 9648: 'Mystère', 10749: 'Romance', 878: 'Sci-Fi',
    10770: 'Téléfilm', 53: 'Thriller', 10752: 'Guerre', 37: 'Western',
    10759: 'Action & Aventure', 10762: 'Enfants', 10765: 'Sci-Fi & Fantastique',
};

const HeroBanner = ({ movie: propMovie, movies: propMovies }) => {
    const movies = useMemo(() => {
        return propMovies || (propMovie ? [propMovie] : []);
    }, [propMovies, propMovie]);
    const [activeIndex, setActiveIndex] = useState(0);
    const [detailedMovie, setDetailedMovie] = useState(null);
    const [trailerKey, setTrailerKey] = useState(null);
    const [showTrailer, setShowTrailer] = useState(false);
    const navigate = useNavigate();
    const { play } = usePlayer();

    // Reset index when movies list changes
    useEffect(() => {
        setActiveIndex(0);
    }, [propMovies, propMovie]);

    // Auto-rotate every 8 seconds if there are multiple movies
    useEffect(() => {
        if (!movies || movies.length <= 1) return;

        const interval = setInterval(() => {
            setActiveIndex(prev => (prev + 1) % movies.length);
        }, 8000);

        return () => clearInterval(interval);
    }, [movies]);

    const movie = movies[activeIndex];
    const isTv = movie ? (getContentType(movie) === 'tv' || Number(movie.id || movie.contentId) === 220102) : false;

    useEffect(() => {
        if (!movie) return;

        let isMounted = true;
        setDetailedMovie(null);
        setTrailerKey(null);
        setShowTrailer(false);

        const fetchDetails = async () => {
            try {
                const id = movie.id || movie.contentId;
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
                    // Fetch trailer
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
            <div className="w-full h-[95vh] bg-[#0B0B0F] flex items-center justify-center relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent z-10" />
                {/* Animated skeleton shimmer */}
                <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a]">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.03] to-transparent animate-shimmer" />
                </div>
                <div className="w-16 h-16 border-4 border-[#E50914] border-t-transparent rounded-full animate-spin shadow-[0_0_30px_rgba(229,9,20,0.5)] z-20" />
            </div>
        );
    }

    const title = movie.title || movie.name || movie.original_title || movie.original_name;
    const description = movie.overview;
    const backdropUrl = movie.backdrop_path
        ? `https://image.tmdb.org/t/p/original${movie.backdrop_path}`
        : null;

    // Extract genres
    const genres = detailedMovie?.genres?.slice(0, 3) ||
        (movie.genre_ids?.slice(0, 3).map(id => ({ id, name: GENRE_NAMES[id] })).filter(g => g.name)) || [];

    return (
        <div className="relative w-full h-[85vh] sm:h-[100vh] overflow-hidden text-white gpu-accelerated bg-black animate-fade-in" key={movie.id || movie.contentId}>
            {/* Base Background Image with slow zoom */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={movie.id || movie.contentId}
                    className="absolute inset-0 z-0"
                    initial={{ scale: 1.1, opacity: 0 }}
                    animate={{ scale: 1.05, opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1.2, ease: "easeOut" }}
                >
                    <img
                        src={backdropUrl}
                        alt={title}
                        className="w-full h-full object-cover origin-center opacity-80 animate-hero-pan"
                        fetchpriority="high"
                        decoding="async"
                    />
                </motion.div>
            </AnimatePresence>

            {/* Cinematic Gradients */}
            <div className="absolute inset-0 z-0 pointer-events-none">
                <div className="absolute inset-0 bg-gradient-to-r from-black via-black/55 to-transparent w-[90%] sm:w-[65%]" />
                <div className="absolute inset-x-0 bottom-0 h-[70vh] bg-gradient-to-t from-[#060608] via-[#060608]/80 to-transparent" />
                <div className="absolute inset-x-0 top-0 h-[20vh] bg-gradient-to-b from-black/70 to-transparent" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_50%,transparent_0%,rgba(0,0,0,0.55)_100%)]" />
            </div>

            {/* Ambient bokeh */}
            <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden hidden sm:block">
                <motion.div
                    className="absolute top-1/4 right-1/4 w-[30vw] h-[30vw] bg-white/5 rounded-full blur-[120px]"
                    animate={{ x: [0, 50, -20, 0], y: [0, -40, 30, 0] }}
                    transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                />
                <motion.div
                    className="absolute bottom-1/3 right-1/2 w-[20vw] h-[20vw] bg-red-600/10 rounded-full blur-[100px]"
                    animate={{ scale: [1, 1.2, 0.9, 1], opacity: [0.5, 0.8, 0.5] }}
                    transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
                />
            </div>

            <div className="relative z-10 h-full flex flex-col justify-end px-[4%] md:px-[5%] pb-[22vh] sm:pb-[15vh]">
                <motion.div
                    initial={{ opacity: 0, x: -30 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.5 }}
                    className="max-w-2xl lg:max-w-3xl"
                >
                    {/* Badge */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.8 }}
                        className="flex items-center gap-3 mb-4 sm:mb-5 flex-wrap"
                    >
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15 shadow-sm">
                            <span className="text-[#E50914] font-black font-sans text-xl leading-none">A</span>
                            <span className="text-white/90 font-bold tracking-[0.2em] text-[10px] sm:text-xs uppercase">
                                {isTv ? 'SÉRIE' : 'FILM'} ALTYFLIX
                            </span>
                        </div>
                        {activeIndex === 0 && (
                            <div className="inline-flex items-center gap-1.5 bg-gradient-to-r from-[#E50914] to-[#B81D24] text-white px-3 py-1 rounded-full font-black text-[10px] sm:text-xs uppercase tracking-wider shadow-[0_4px_15px_rgba(229,9,20,0.4)]">
                                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                <span>N° 1</span>
                                <span className="font-medium normal-case text-white/90">
                                    {isTv ? "des séries aujourd'hui" : "des films aujourd'hui"}
                                </span>
                            </div>
                        )}
                    </motion.div>

                    {/* Title */}
                    <motion.h1
                        initial={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
                        animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                        transition={{ duration: 1.2, delay: 0.2, ease: "easeOut" }}
                        className="text-4xl sm:text-6xl md:text-7xl lg:text-[5.5rem] font-black mb-3 sm:mb-4 tracking-[-0.03em] uppercase leading-[0.9] text-white font-sans"
                        style={{ textShadow: '0 10px 40px rgba(0,0,0,0.9), 0 2px 10px rgba(0,0,0,0.8)' }}
                    >
                        {title}
                    </motion.h1>

                    {/* Meta info */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 1 }}
                        className="flex items-center gap-3 sm:gap-4 text-white/80 font-medium text-sm sm:text-base mb-4 drop-shadow-lg flex-wrap"
                    >
                        {movie.vote_average > 0 && (
                            <span className="inline-flex items-center gap-1 text-[#46d369] font-black text-xs sm:text-sm bg-[#46d369]/10 border border-[#46d369]/30 px-2.5 py-0.5 rounded-full drop-shadow-[0_0_12px_rgba(70,211,105,0.4)]">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#46d369] animate-pulse" />
                                {Math.round(movie.vote_average * 10)}% Recommandé
                            </span>
                        )}
                        <span className="font-semibold text-white/90">{movie.release_date?.substring(0, 4) || movie.first_air_date?.substring(0, 4) || '2025'}</span>
                        <span className="border border-white/20 px-2 py-0.5 rounded-full text-[11px] bg-white/[0.06] backdrop-blur-md font-bold text-white/80">16+</span>
                        <span className="font-medium text-white/80">
                            {isTv
                                ? (detailedMovie?.number_of_seasons ? `${detailedMovie.number_of_seasons} Saison${detailedMovie.number_of_seasons > 1 ? 's' : ''}` : 'Saisons')
                                : (detailedMovie?.runtime ? formatRuntime(detailedMovie.runtime) : '...')}
                        </span>
                        <span className="border border-white/25 px-2 py-0.5 rounded-full text-[10px] bg-white/[0.08] backdrop-blur-md font-black tracking-widest uppercase text-white/90 hidden sm:inline-block">4K Ultra HD</span>
                        <span className="border border-white/20 px-2 py-0.5 rounded-full text-[10px] bg-white/[0.06] backdrop-blur-md font-bold tracking-wider uppercase text-white/70 hidden md:inline-block">HDR10+</span>
                    </motion.div>

                    {/* Genre badges */}
                    {genres.length > 0 && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 1.05 }}
                            className="flex items-center gap-2 mb-5 flex-wrap"
                        >
                            {genres.map((g, i) => (
                                <span
                                    key={g.id || i}
                                    className="px-3 py-1 rounded-full text-xs font-semibold bg-white/[0.08] hover:bg-white/[0.15] backdrop-blur-xl border border-white/15 text-white/90 transition-colors"
                                >
                                    {g.name}
                                </span>
                            ))}
                        </motion.div>
                    )}

                    {/* Description */}
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, delay: 1.1, ease: "easeOut" }}
                        className="text-sm sm:text-[1.1rem] text-white/90 mb-6 sm:mb-8 max-w-[90%] sm:max-w-2xl font-normal leading-snug drop-shadow-xl line-clamp-2 sm:line-clamp-3 font-sans"
                        style={{ textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}
                    >
                        {description}
                    </motion.p>

                    {/* Buttons */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, delay: 1.3, ease: "easeOut" }}
                        className="flex items-center gap-3 sm:gap-4 flex-wrap"
                    >
                        {/* Play button */}
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => play(movie)}
                            className="group relative flex items-center justify-center gap-2.5 sm:gap-3 bg-white text-black px-6 sm:px-8 py-3.5 sm:py-3.5 rounded-2xl text-base sm:text-lg font-black tracking-wide overflow-hidden min-w-[130px] sm:min-w-[160px] shadow-[0_10px_30px_rgba(255,255,255,0.25)] hover:shadow-[0_15px_40px_rgba(255,255,255,0.4)] transition-all duration-300"
                        >
                            <div className="absolute inset-0 w-1/3 h-full bg-gradient-to-r from-transparent via-black/10 to-transparent -translate-x-full group-hover:translate-x-[300%] transition-transform duration-700" />
                            <svg className="w-5 h-5 sm:w-6 sm:h-6 fill-current flex-shrink-0" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                            </svg>
                            <span>Lecture</span>
                        </motion.button>

                        {/* Trailer button (if available) */}
                        <AnimatePresence>
                            {trailerKey && (
                                <motion.button
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0 }}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => setShowTrailer(true)}
                                    className="flex items-center justify-center gap-2.5 sm:gap-3 bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/20 hover:border-white/40 text-white px-5 sm:px-7 py-3.5 sm:py-3.5 rounded-2xl text-base sm:text-lg font-semibold transition-all duration-300 shadow-[0_8px_25px_rgba(0,0,0,0.5)] hover:shadow-[0_12px_35px_rgba(0,0,0,0.7)] min-w-[130px]"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <span>Bande-annonce</span>
                                </motion.button>
                            )}
                        </AnimatePresence>

                        {/* More info button */}
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => navigate(`/${isTv ? 'tv' : 'movie'}/${movie.id || movie.contentId}`)}
                            className="flex items-center justify-center gap-2.5 sm:gap-3 bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/20 hover:border-white/40 text-white px-5 sm:px-7 py-3.5 sm:py-3.5 rounded-2xl text-base sm:text-lg font-semibold transition-all duration-300 shadow-[0_8px_25px_rgba(0,0,0,0.5)] hover:shadow-[0_12px_35px_rgba(0,0,0,0.7)] min-w-[130px] sm:min-w-[160px]"
                        >
                            <svg className="w-5 h-5 text-white/90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span>{"Plus d'infos"}</span>
                        </motion.button>
                    </motion.div>
                </motion.div>
            </div>

            {/* Carousel Indicators on the bottom right */}
            {movies.length > 1 && (
                <div className="absolute right-[4%] md:right-[5%] bottom-[22vh] sm:bottom-[15vh] z-20 flex items-center gap-2 bg-black/40 backdrop-blur-xl px-3 py-1.5 rounded-full border border-white/10 shadow-lg">
                    {movies.map((m, idx) => (
                        <button
                            key={m.id || idx}
                            onClick={() => setActiveIndex(idx)}
                            aria-label={`Afficher le film ${idx + 1}`}
                            className={`transition-all duration-300 rounded-full ${
                                activeIndex === idx
                                    ? 'w-6 h-1.5 bg-[#E50914] shadow-[0_0_10px_rgba(229,9,20,0.9)]'
                                    : 'w-1.5 h-1.5 bg-white/40 hover:bg-white/80'
                            }`}
                        />
                    ))}
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
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            transition={{ type: 'spring', damping: 25 }}
                            className="relative w-full max-w-5xl aspect-video mx-4 rounded-2xl overflow-hidden shadow-[0_40px_80px_rgba(0,0,0,0.8)]"
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
