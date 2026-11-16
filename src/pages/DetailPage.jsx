import { seasonLabel } from '../utils/seasons';
// Netflix-Faithful DetailPage
// Layout: Full-width backdrop → gradient → title + buttons → metadata → cast → similar content
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useProfile } from '../contexts/ProfileContext';
import { useAuth } from '../contexts/AuthContext';
import { usePlayer } from '../contexts/PlayerContext';
import { addOrUpdateReview, getReviewsByContent, deleteReview } from '../services/reviewService';
import { getMovieDetails, getSeriesDetails, getSeasonDetails } from '../services/tmdb';
import { getBackdropUrl, formatRuntime, getYear, getContentType } from '../utils/helpers';
import { motion, AnimatePresence } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import MovieCard from '../components/home/MovieCard';
import { useTranslation } from '../hooks/useTranslation';
import CastQuickView from '../components/common/CastQuickView';
import { useToast } from '../contexts/ToastContext';
import CastMember from '../components/detail/CastMember';
import EpisodeRow from '../components/detail/EpisodeRow';
import ReviewsSection from '../components/detail/ReviewsSection';

// ── Detail Page ──────────────────────────────────────
const DetailPage = () => {
    const { id } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const { watchHistory, addToMyList, removeFromMyList, isInMyList, markAsWatched, currentProfile, addToHistory } = useProfile();
    const { addToast } = useToast();
    const { currentUser } = useAuth();
    const { play } = usePlayer();

    const { t, language } = useTranslation();
    const [content, setContent] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedSeason, setSelectedSeason] = useState(1);
    const [seasonEpisodes, setSeasonEpisodes] = useState([]);
    const [episodesLoading, setEpisodesLoading] = useState(false);
    const [episodesError, setEpisodesError] = useState(false);
    const [retryEpisodes, setRetryEpisodes] = useState(0);
    const [resumeInfo, setResumeInfo] = useState({ season: 1, episode: 1 });
    const [activeTab, setActiveTab] = useState('details');

    // Cast section scroll & details states
    const castRowRef = useRef(null);
    const [castScrolled, setCastScrolled] = useState(false);
    const [castCanScrollRight, setCastCanScrollRight] = useState(true);
    const [selectedPersonId, setSelectedPersonId] = useState(null);

    const updateCastScrollState = () => {
        if (!castRowRef.current) return;
        const { scrollLeft, scrollWidth, clientWidth } = castRowRef.current;
        setCastScrolled(scrollLeft > 10);
        setCastCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10);
    };

    const scrollCast = (dir) => {
        if (!castRowRef.current) return;
        const { clientWidth } = castRowRef.current;
        castRowRef.current.scrollBy({
            left: dir === 'left' ? -clientWidth * 0.75 : clientWidth * 0.75,
            behavior: 'smooth'
        });
    };

    useEffect(() => {
        if (content) {
            setTimeout(updateCastScrollState, 500);
        }
    }, [content]);
    
    // Reviews state
    const [reviews, setReviews] = useState([]);
    const [userReview, setUserReview] = useState(null);
    const [reviewText, setReviewText] = useState('');
    const [reviewRating, setReviewRating] = useState(0);
    const [hoveredRating, setHoveredRating] = useState(0);
    const [isSubmittingReview, setIsSubmittingReview] = useState(false);
    const [showTrailerModal, setShowTrailerModal] = useState(false);

    const type = location.pathname.includes('/movie/') ? 'movie' : (location.pathname.includes('/tv/') ? 'tv' : 'movie');
    const episodesRef = useRef(null);

    const _scrollEpisodes = (dir) => {
        if (!episodesRef.current) return;
        const { clientWidth } = episodesRef.current;
        episodesRef.current.scrollBy({ left: dir === 'left' ? -clientWidth * 0.75 : clientWidth * 0.75, behavior: 'smooth' });
    };

    const handleMarkSeasonWatched = () => {
        if (!content || !seasonEpisodes.length) return;
        addToHistory(content, selectedSeason, seasonEpisodes.at(-1).episode_number, 100);
        addToast(`Saison ${selectedSeason} marquée comme vue !`, 'success');
    };

    useEffect(() => {
        const controller = new AbortController();
        const fetchDetails = async () => {
            try {
                setLoading(true);
                setContent(null);
                window.scrollTo(0, 0);

                let details;
                const initialType = Number(id) === 220102 ? 'tv' : type;
                try {
                    details = await (initialType === 'movie' ? getMovieDetails : getSeriesDetails)(id);
                } catch (e) {
                    // Try the other type if the first one fails
                    details = await (initialType === 'movie' ? getSeriesDetails : getMovieDetails)(id);
                }

                if (controller.signal.aborted) return;
                setContent(details);
                if (details?.number_of_seasons) {
                    const saved = watchHistory.find(h => String(h.contentId) === String(id));
                    setSelectedSeason(saved?.season || details.seasons?.find(s => s.season_number > 0)?.season_number || 1);
                }
            } catch (e) {
                if (controller.signal.aborted) return;
                console.error('Failed to fetch details:', e);
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        };
        fetchDetails();
        return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [type, id]);

    // Resume watch history
    useEffect(() => {
        const item = watchHistory.find(h => String(h.contentId) === String(id));
        if (item?.season && item?.episode) {
            setResumeInfo({ season: item.season, episode: item.episode });
            setSelectedSeason(item.season);
        }
    }, [watchHistory, id]);

    // Load season episodes
    useEffect(() => {
        let cancelled = false;
        setSeasonEpisodes([]);
        setEpisodesError(false);
        const loadEpisodes = async () => {
            // Bail if no content, or if content is not a TV show
            if (!content || getContentType(content) !== 'tv') return;
            setEpisodesLoading(true);
            try {
                const data = await getSeasonDetails(id, selectedSeason);
                if (!cancelled) setSeasonEpisodes(data?.episodes || []);
            } catch { if (!cancelled) setEpisodesError(true); }
            finally { if (!cancelled) setEpisodesLoading(false); }
        };
        loadEpisodes();
        return () => { cancelled = true; };
    }, [content, selectedSeason, id, location.pathname, retryEpisodes]);

    // Load reviews
    useEffect(() => {
        const loadReviews = async () => {
            if (!content) return;
            const contentId = content.id || content.contentId;
            const fetchedReviews = await getReviewsByContent(contentId);
            setReviews(fetchedReviews);
            
            if (currentUser && currentProfile) {
                const myReview = fetchedReviews.find(r => r.profileId === currentProfile.id);
                if (myReview) {
                    setUserReview(myReview);
                    setReviewText(myReview.text);
                    setReviewRating(myReview.rating);
                } else {
                    setUserReview(null);
                    setReviewText('');
                    setReviewRating(0);
                }
            }
        };
        loadReviews();
    }, [content, currentProfile, currentUser]);

    const handleSubmitReview = async (e) => {
        e.preventDefault();
        if (!reviewRating || !reviewText.trim() || !currentUser || !currentProfile) return;
        
        setIsSubmittingReview(true);
        const contentId = content.id || content.contentId;
        
        const result = await addOrUpdateReview(contentId, currentProfile, currentUser.uid, reviewRating, reviewText.trim());
        if (result.success) {
            // Reload reviews to show the new one at the top
            const fetchedReviews = await getReviewsByContent(contentId);
            setReviews(fetchedReviews);
            const myReview = fetchedReviews.find(r => r.profileId === currentProfile.id);
            setUserReview(myReview);
        } else {
            addToast("Erreur lors de l'enregistrement de l'avis.", 'error');
        }
        setIsSubmittingReview(false);
    };

    const handleDeleteReview = async () => {
        if (!currentUser || !currentProfile) return;
        
        const contentId = content.id || content.contentId;
        const result = await deleteReview(contentId, currentProfile.id);
        if (result.success) {
            setReviewText('');
            setReviewRating(0);
            setUserReview(null);
            const fetchedReviews = await getReviewsByContent(contentId);
            setReviews(fetchedReviews);
        }
    };

    const toggleMyList = () => isInMyList(content) ? removeFromMyList(content.id) : addToMyList(content);
    const progressItem = watchHistory.find(h => String(h.contentId) === String(id));
    const watchProgress = progressItem?.progress || 0;
    const isWatched = watchProgress >= 90;
    const hasProgress = watchProgress > 5 && watchProgress < 90;

    if (loading) {
        return (
            <div className="min-h-screen bg-[#060608]">
                <div className="w-full skeleton" style={{ height: '56.25vw' }} />
                <div className="netflix-container py-8 space-y-4">
                    <div className="skeleton h-8 w-64 rounded-xl" />
                    <div className="skeleton h-4 w-full rounded-xl" />
                    <div className="skeleton h-4 w-3/4 rounded-xl" />
                </div>
            </div>
        );
    }

    if (!content) {
        return (
            <div className="min-h-screen bg-[#060608] flex items-center justify-center">
                <div className="text-center">
                    <p className="text-white/50 text-xl mb-4">Contenu introuvable</p>
                    <button onClick={() => navigate(-1)} className="text-white/70 hover:text-white text-sm underline">Retour</button>
                </div>
            </div>
        );
    }

    const actualContentType = getContentType(content);
    const isTV = actualContentType === 'tv';

    const title = content.title || content.name;
    const releaseDate = content.release_date || content.first_air_date;
    const cast = content.credits?.cast?.slice(0, 12) || [];
    const director = content.credits?.crew?.find(c => c.job === 'Director')?.name;
    const _writers = content.credits?.crew?.filter(c => ['Writer', 'Screenplay'].includes(c.job))?.slice(0, 3).map(c => c.name).join(', ');
    const creators = content.created_by?.slice(0, 3).map(c => c.name).join(', ');

    const similar = (content.recommendations?.results?.length > 0
        ? content.recommendations.results
        : content.similar?.results || []).filter(i => i.poster_path || i.backdrop_path).slice(0, 12);

    const seasons = content.seasons?.filter(s => s.season_number > 0) || [];

    return (
        <div className="min-h-screen bg-[#060608]">
            <Helmet>
                <title>{title} - ALTYFLIX</title>
                <meta name="description" content={content.overview?.slice(0, 160)} />
                <meta property="og:title" content={`${title} - ALTYFLIX`} />
                <meta property="og:description" content={content.overview?.slice(0, 160)} />
                <meta property="og:image" content={`https://image.tmdb.org/t/p/w1280${content.backdrop_path || content.poster_path}`} />
                <meta property="og:type" content={isTV ? 'video.tv_show' : 'video.movie'} />
                <script type="application/ld+json">{JSON.stringify(isTV ? {
                    "@context": "https://schema.org",
                    "@type": "TVSeries",
                    "name": title,
                    "description": content.overview,
                    "image": `https://image.tmdb.org/t/p/w780${content.poster_path}`,
                    "datePublished": content.first_air_date,
                    "numberOfSeasons": content.number_of_seasons,
                    "numberOfEpisodes": content.number_of_episodes,
                    "genre": content.genres?.map(g => g.name),
                    "aggregateRating": content.vote_average ? {
                        "@type": "AggregateRating",
                        "ratingValue": content.vote_average.toFixed(1),
                        "bestRating": "10",
                        "ratingCount": content.vote_count
                    } : undefined,
                    "actor": cast.slice(0, 5).map(a => ({ "@type": "Person", "name": a.name })),
                    "creator": content.created_by?.slice(0, 2).map(c => ({ "@type": "Person", "name": c.name }))
                } : {
                    "@context": "https://schema.org",
                    "@type": "Movie",
                    "name": title,
                    "description": content.overview,
                    "image": `https://image.tmdb.org/t/p/w780${content.poster_path}`,
                    "datePublished": content.release_date,
                    "duration": content.runtime ? `PT${content.runtime}M` : undefined,
                    "genre": content.genres?.map(g => g.name),
                    "aggregateRating": content.vote_average ? {
                        "@type": "AggregateRating",
                        "ratingValue": content.vote_average.toFixed(1),
                        "bestRating": "10",
                        "ratingCount": content.vote_count
                    } : undefined,
                    "actor": cast.slice(0, 5).map(a => ({ "@type": "Person", "name": a.name })),
                    "director": director ? { "@type": "Person", "name": director } : undefined
                })}</script>
            </Helmet>

            {/* Full-Screen Premium Hero */}
            <div className="relative w-full h-screen min-h-[600px] overflow-hidden">

                {/* Full screen backdrop */}
                <div className="absolute inset-0 z-0">
                    <img
                        src={getBackdropUrl(content.backdrop_path || content.poster_path, 'w1280')}
                        alt={title}
                        className="w-full h-full object-cover object-center"
                        fetchPriority="high"
                        decoding="async"
                    />
                    {/* Strong left gradient for text readability */}
                    <div className="absolute inset-0" style={{
                        background: `
                            linear-gradient(to right, rgba(10,10,14,0.95) 0%, rgba(10,10,14,0.75) 35%, rgba(10,10,14,0.2) 65%, transparent 100%),
                            linear-gradient(to top, rgba(10,10,14,1) 0%, rgba(10,10,14,0.7) 20%, transparent 55%)
                        `
                    }} />
                </div>

                {/* Bottom content area */}
                <div className="absolute bottom-0 left-0 right-0 z-10 px-[4%] pb-24 md:pb-[4vh]">
                    <div className="flex items-end justify-between gap-8">

                        {/* LEFT: Title + description + buttons */}
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.7, ease: 'easeOut' }}
                            className="max-w-[520px]"
                        >
                            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black text-white leading-none mb-4 tracking-tight drop-shadow-2xl uppercase" style={{ fontFamily: 'Outfit, sans-serif', textShadow: '0 4px 20px rgba(0,0,0,0.8)' }}>
                                {title}
                            </h1>
                            <p className="text-white/75 text-sm md:text-base mb-7 line-clamp-3 leading-relaxed max-w-[420px]">
                                {content.overview}
                            </p>

                            <div className="flex items-center gap-3.5 flex-wrap">
                                <button
                                    onClick={() => play(isTV && (!hasProgress || selectedSeason !== resumeInfo.season) ? { ...content, season: selectedSeason, episode: seasonEpisodes[0]?.episode_number || 1 } : content)}
                                    className="group flex items-center gap-2.5 px-8 py-3.5 bg-gradient-to-r from-[#E50914] to-[#B81D24] hover:from-[#f40612] hover:to-[#c11119] text-white font-black rounded-2xl hover:scale-[1.03] active:scale-[0.97] transition-all shadow-[0_4px_25px_rgba(229,9,20,0.5)] hover:shadow-[0_8px_35px_rgba(229,9,20,0.7)] text-sm tracking-wider"
                                >
                                    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                                    <span>{hasProgress && (!isTV || selectedSeason === resumeInfo.season) ? (isTV ? `REPRENDRE · ÉPISODE ${resumeInfo.episode}` : 'REPRENDRE') : (isTV ? `REGARDER · ${seasonLabel(seasons.find(s => s.season_number === selectedSeason))}` : 'REGARDER')}</span>
                                </button>
                                {(() => {
                                    const trailer = content?.videos?.results?.find(v => v.type === 'Trailer' && v.site === 'YouTube') ||
                                                    content?.videos?.results?.find(v => v.site === 'YouTube');
                                    if (!trailer?.key) return null;
                                    return (
                                        <button
                                            onClick={() => setShowTrailerModal(true)}
                                            className="flex items-center gap-2.5 px-6 py-3.5 bg-white/10 hover:bg-white/20 text-white font-bold rounded-2xl transition-all border border-white/20 hover:border-white/40 text-sm tracking-wider backdrop-blur-xl shadow-lg hover:scale-[1.03] active:scale-[0.97]"
                                        >
                                            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M10 16.5l6-4.5-6-4.5v9zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>
                                            <span>BANDE-ANNONCE</span>
                                        </button>
                                    );
                                })()}
                                <button
                                    onClick={toggleMyList}
                                    className="flex items-center gap-2.5 px-6 py-3.5 bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/40 text-white font-bold rounded-2xl transition-all text-sm tracking-wider backdrop-blur-xl shadow-lg hover:scale-[1.03] active:scale-[0.97]"
                                >
                                    {isInMyList(content) ? (
                                        <><span className="text-lg leading-none text-[#46d369] font-black">&#10003;</span> DANS MA LISTE</>
                                    ) : (
                                        <><span className="text-lg leading-none font-black">+</span> MA LISTE</>
                                    )}
                                </button>
                                <button
                                    onClick={() => markAsWatched(content, type === 'tv' ? selectedSeason : null, type === 'tv' ? (resumeInfo?.episode || 1) : null)}
                                    className={`flex items-center gap-2 px-5 py-3.5 backdrop-blur-xl border ${isWatched ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400 hover:border-emerald-400' : 'border-white/20 bg-white/5 text-white/70 hover:border-white/40 hover:text-white'} font-bold rounded-2xl transition-all text-xs tracking-wider shadow-lg hover:scale-[1.03] active:scale-[0.97]`}
                                    title={isWatched ? "Marquer comme non vu" : "Marquer comme vu"}
                                >
                                    {isWatched ? (
                                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                                    ) : (
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                    )}
                                    <span>{isWatched ? 'VU' : 'MARQUER VU'}</span>
                                </button>
                            </div>

                            {hasProgress && (
                                <div className="mt-5 max-w-sm" aria-label={`Visionnage : ${Math.round(watchProgress)} %`}>
                                    <div className="flex justify-between gap-4 text-xs text-white/65 mb-2">
                                        <button type="button" className="text-left hover:text-white" onClick={() => play({ ...content, season: isTV ? resumeInfo.season : undefined, episode: isTV ? resumeInfo.episode : undefined })}>{isTV ? `Reprendre ${seasonLabel(seasons.find(s => s.season_number === resumeInfo.season))} · Épisode ${resumeInfo.episode}` : 'Reprendre votre lecture'}</button>
                                        <span>{Math.round(watchProgress)} %</span>
                                    </div>
                                    <div className="h-1 rounded-full bg-white/15 overflow-hidden"><div className="h-full bg-[#E50914]" style={{ width: `${Math.min(100, watchProgress)}%` }} /></div>
                                </div>
                            )}
                            {isTV && seasons.length > 0 && (
                                <div className="flex flex-wrap items-center gap-3 mt-6">
                                    <label htmlFor="hero-season" className="text-xs uppercase tracking-widest text-white/55">Choisir une partie</label>
                                    <select id="hero-season" value={selectedSeason} onChange={e => setSelectedSeason(Number(e.target.value))} className="bg-[#18181c] border border-white/20 rounded-full text-white text-sm px-4 py-2.5 max-w-full">
                                        {seasons.map(season => <option key={season.season_number} value={season.season_number}>{seasonLabel(season)} · {season.episode_count} épisodes</option>)}
                                    </select>
                                    <button type="button" onClick={() => { setActiveTab('episodes'); document.getElementById('detail-content')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); }} className="text-xs text-white/80 underline underline-offset-4 py-2">Tous les épisodes</button>
                                </div>
                            )}

                            {/* Episodes row for TV */}
                            {isTV && seasonEpisodes.length > 0 && (
                                <div className="mt-8 w-full max-w-full lg:max-w-[700px] overflow-x-auto no-scrollbar flex gap-3 snap-x scroll-smooth pb-4">
                                    {seasonEpisodes.map((ep) => (
                                        <div
                                            key={ep.id}
                                            role="button"
                                            tabIndex={0}
                                            aria-label={`Regarder l’épisode ${ep.episode_number} : ${ep.name}`}
                                            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); play({ ...content, season: selectedSeason, episode: ep.episode_number }); } }}
                                            className={`relative flex-shrink-0 rounded-md overflow-hidden cursor-pointer group transition-all duration-300 w-[120px] md:w-[150px] hover:w-[130px] md:hover:w-[160px]`}
                                            style={{ aspectRatio: '16/9', background: '#1a1a1a' }}
                                            onClick={() => {
                                                play({ ...content, season: selectedSeason, episode: ep.episode_number });
                                            }}
                                        >
                                            {ep.still_path && (
                                                <img
                                                    src={`https://image.tmdb.org/t/p/w300${ep.still_path}`}
                                                    className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity duration-300"
                                                    alt={ep.name}
                                                    loading="lazy"
                                                    decoding="async"
                                                />
                                            )}
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                                            <div className="absolute bottom-2 left-3 text-white text-xs font-bold tracking-wider opacity-90 drop-shadow-md">
                                                EP {ep.episode_number}
                                            </div>
                                            {resumeInfo.episode === ep.episode_number && resumeInfo.season === selectedSeason && (
                                                <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#E50914]" />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </motion.div>

                        {/* RIGHT: Season Selector */}
                        {isTV && seasons.length > 0 && (
                            <motion.div
                                initial={{ opacity: 0, x: 30 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.7, delay: 0.2, ease: 'easeOut' }}
                                style={{
                                    scrollbarWidth: 'none',
                                    msOverflowStyle: 'none',
                                    maskImage: 'linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%)',
                                    WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%)'
                                }}
                                className="hidden lg:flex flex-col items-end gap-3.5 py-6 flex-shrink-0 max-h-[380px] overflow-y-auto no-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden scroll-smooth pr-1 select-none"
                            >
                                {seasons.slice().reverse().map((s) => {
                                    const isActive = selectedSeason === s.season_number;
                                    return (
                                        <button
                                            key={s.season_number}
                                            onClick={() => setSelectedSeason(s.season_number)}
                                            className={`flex items-center gap-4 transition-all duration-300 text-right group py-1 ${isActive
                                                ? 'text-white font-extrabold translate-x-[-2px]'
                                                : 'text-white/35 hover:text-white/80 hover:translate-x-[-4px]'
                                                }`}
                                        >
                                            <span className={`text-lg md:text-xl font-black tracking-widest uppercase transition-all ${isActive ? 'text-2xl md:text-3xl drop-shadow-[0_0_24px_rgba(255,255,255,0.45)]' : ''
                                                }`} style={{ fontFamily: 'Outfit' }}>
                                                {seasonLabel(s)}
                                            </span>
                                            {isActive ? (
                                                <span className="w-8 md:w-12 h-[2.5px] bg-gradient-to-r from-[#E50914] to-white flex-shrink-0 rounded-full shadow-[0_0_12px_rgba(229,9,20,0.9)]" />
                                            ) : (
                                                <span className="w-3 md:w-5 h-[1.5px] bg-white/20 group-hover:bg-white/50 transition-all flex-shrink-0 rounded-full" />
                                            )}
                                        </button>
                                    );
                                })}
                            </motion.div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Tabbed Content Section ── */}
            <div id="detail-content" className="px-[5%] py-12 min-h-[50vh] scroll-mt-20">
                <div className="flex gap-8 mb-12 border-b border-white/10 no-scrollbar overflow-x-auto">
                    {['details', isTV ? 'episodes' : null, 'reviews', 'similar'].filter(Boolean).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`relative pb-4 text-sm md:text-base font-bold tracking-widest uppercase transition-colors whitespace-nowrap ${activeTab === tab ? 'text-white' : 'text-white/40 hover:text-white/80'}`}
                        >
                            {tab === 'details' && 'Détails'}
                            {tab === 'episodes' && 'Épisodes'}
                            {tab === 'reviews' && 'Avis'}
                            {tab === 'similar' && 'Titres Similaires'}
                            {activeTab === tab && (
                                <motion.div
                                    layoutId="activeTab"
                                    className="absolute bottom-0 left-0 right-0 h-1 bg-[#E50914]"
                                />
                            )}
                        </button>
                    ))}
                </div>

                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeTab}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.3 }}
                    >
                        {/* TAB: DETAILS */}
                        {activeTab === 'details' && (
                            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-8 lg:gap-16">
                                {/* Left: Overview + metadata */}
                                <div>
                                    <div className="flex flex-wrap items-center gap-3 mb-6 font-medium text-sm">
                                        {content.vote_average > 0 && <span className="match-score text-sm">{content.vote_average.toFixed(1)}/10 · TMDB</span>}
                                        {isWatched && (
                                            <span className="flex items-center gap-1 bg-green-500/20 text-green-400 text-xs px-2 py-0.5 rounded-full border border-green-500/30 font-bold uppercase tracking-wider">
                                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                                                Vu
                                            </span>
                                        )}
                                        {releaseDate && <span className="text-white/70 text-sm">{getYear(releaseDate)}</span>}
                                        {content.number_of_seasons && <span className="text-white/70 text-sm">{content.number_of_seasons} saison{content.number_of_seasons > 1 ? 's' : ''}</span>}
                                        {content.runtime && <span className="text-white/70 text-sm">{formatRuntime(content.runtime)}</span>}
                                        <span className="border border-white/40 text-white/60 text-xs px-1.5 py-0.5 rounded-sm">HD</span>
                                    </div>

                                    {hasProgress && (
                                        <div className="mb-6">
                                            <div className="flex items-center gap-2 text-xs text-white/50 mb-1">
                                                <span>{Math.round(watchProgress)}% visionné</span>
                                            </div>
                                            <div className="h-1 bg-white/20 rounded-full overflow-hidden w-full max-w-sm">
                                                <div className="h-full rounded-full" style={{ width: `${watchProgress}%`, background: '#E50914' }} />
                                            </div>
                                        </div>
                                    )}

                                    <p className="text-white/85 text-base md:text-lg leading-relaxed mb-8 max-w-3xl font-light">
                                        {content.overview}
                                    </p>

                                    {cast.length > 0 && (
                                        <div className="mt-8 relative group/cast-row select-none">
                                            <h2 className="text-white text-lg font-bold mb-4">{t('detail.cast')}</h2>
                                            
                                            {/* Left Arrow */}
                                            <button
                                                type="button"
                                                aria-label="Précédent"
                                                onClick={() => scrollCast('left')}
                                                className={`hidden lg:flex absolute left-2 top-[50%] -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-[#18181b]/70 border border-white/10 backdrop-blur-md items-center justify-center text-white hover:bg-white/10 hover:border-white/30 hover:scale-110 active:scale-95 transition-all shadow-lg ${
                                                    castScrolled ? 'opacity-0 group-hover/cast-row:opacity-100' : 'opacity-0 pointer-events-none'
                                                }`}
                                            >
                                                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                                                </svg>
                                            </button>

                                            {/* Right Arrow */}
                                            <button
                                                type="button"
                                                aria-label="Suivant"
                                                onClick={() => scrollCast('right')}
                                                className={`hidden lg:flex absolute right-2 top-[50%] -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-[#18181b]/70 border border-white/10 backdrop-blur-md items-center justify-center text-white hover:bg-white/10 hover:border-white/30 hover:scale-110 active:scale-95 transition-all shadow-lg ${
                                                    castCanScrollRight ? 'opacity-0 group-hover/cast-row:opacity-100' : 'opacity-0 pointer-events-none'
                                                }`}
                                            >
                                                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                                </svg>
                                            </button>

                                            <div
                                                ref={castRowRef}
                                                onScroll={updateCastScrollState}
                                                className="flex gap-4 overflow-x-auto no-scrollbar pb-4 scroll-smooth"
                                            >
                                                {cast.map(member => (
                                                    <CastMember
                                                        key={member.id}
                                                        member={member}
                                                        onClick={setSelectedPersonId}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Right: Metadata panel */}
                                <div className="text-sm space-y-4 bg-white/5 p-6 rounded-xl border border-white/5 h-fit">
                                    {director && (
                                        <div><span className="text-white/40 block text-xs uppercase tracking-wider mb-1">Réalisation</span><span className="text-white/90 font-medium">{director}</span></div>
                                    )}
                                    {creators && (
                                        <div><span className="text-white/40 block text-xs uppercase tracking-wider mb-1">Créateurs</span><span className="text-white/90 font-medium">{creators}</span></div>
                                    )}
                                    {content.genres?.length > 0 && (
                                        <div><span className="text-white/40 block text-xs uppercase tracking-wider mb-1">Genres</span><span className="text-white/90 font-medium">{content.genres.map(g => g.name).join(', ')}</span></div>
                                    )}
                                    {content.spoken_languages?.length > 0 && (
                                        <div><span className="text-white/40 block text-xs uppercase tracking-wider mb-1">Audio</span><span className="text-white/90 font-medium">{content.spoken_languages.map(l => l.english_name).join(', ')}</span></div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* TAB: EPISODES */}
                        {activeTab === 'episodes' && isTV && (
                            <div className="max-w-4xl">
                                <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                                    <div className="flex items-center gap-3">
                                        <h2 className="text-2xl font-bold">Épisodes</h2>
                                        <button
                                            type="button"
                                            onClick={handleMarkSeasonWatched}
                                            className="text-xs px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white font-semibold border border-white/20 transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5"
                                            title="Marquer tous les épisodes de cette saison comme vus"
                                        >
                                            <span className="text-emerald-400">✓</span>
                                            <span>Marquer la saison comme vue</span>
                                        </button>
                                    </div>
                                    <select
                                        aria-label="Choisir une saison"
                                        value={selectedSeason}
                                        onChange={e => setSelectedSeason(Number(e.target.value))}
                                        className="bg-black/50 border border-white/20 text-white text-sm px-4 py-2.5 rounded-md cursor-pointer hover:border-white/50 transition-colors focus:outline-none focus:border-white/60"
                                    >
                                        {seasons.map(s => <option key={s.season_number} value={s.season_number}>{seasonLabel(s)} {s.episode_count ? `(${s.episode_count} ep)` : ''}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-4">
                                    {episodesLoading ? (
                                        <div role="status" aria-live="polite" className="space-y-4 py-3">
                                            <p className="text-sm text-white/60">Chargement des épisodes…</p>
                                            {[1, 2, 3].map(n => <div key={n} className="skeleton h-28 rounded-xl" />)}
                                        </div>
                                    ) : episodesError ? (
                                        <div role="alert" className="rounded-xl border border-white/10 bg-white/5 p-6">
                                            <p className="font-semibold">Les épisodes n’ont pas pu être chargés.</p>
                                            <p className="text-sm text-white/60 mt-2">Vérifiez votre connexion, puis réessayez.</p>
                                            <button type="button" onClick={() => setRetryEpisodes(n => n + 1)} className="mt-4 rounded-full bg-[#E50914] px-5 py-2 text-sm font-bold">Réessayer</button>
                                        </div>
                                    ) : seasonEpisodes.length > 0 ? (
                                        seasonEpisodes.map((ep) => {
                                            const currentHist = watchHistory.find(h => String(h.contentId) === String(id));
                                            const isEpWatched = currentHist && (
                                                currentHist.season > selectedSeason ||
                                                (currentHist.season === selectedSeason && (currentHist.episode > ep.episode_number || (currentHist.episode === ep.episode_number && currentHist.progress >= 90)))
                                            );
                                            const epProgress = currentHist && currentHist.season === selectedSeason && currentHist.episode === ep.episode_number
                                                ? (currentHist.progress || 0)
                                                : (isEpWatched ? 100 : 0);

                                            return (
                                                <EpisodeRow
                                                    key={ep.id}
                                                    episode={ep}
                                                    number={ep.episode_number}
                                                    isWatched={isEpWatched}
                                                    progress={epProgress}
                                                    onPlay={() => play({ ...content, season: selectedSeason, episode: ep.episode_number })}
                                                    onPersonClick={setSelectedPersonId}
                                                    t={t}
                                                />
                                            );
                                        })
                                    ) : (
                                        <p className="text-white/50 py-8 text-center glass-panel rounded-lg">{t('detail.noEpisodes')}</p>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* TAB: REVIEWS */}
                        {activeTab === 'reviews' && (
                            <ReviewsSection
                                currentUser={currentUser}
                                currentProfile={currentProfile}
                                userReview={userReview}
                                reviewRating={reviewRating}
                                setReviewRating={setReviewRating}
                                hoveredRating={hoveredRating}
                                setHoveredRating={setHoveredRating}
                                reviewText={reviewText}
                                setReviewText={setReviewText}
                                isSubmittingReview={isSubmittingReview}
                                handleSubmitReview={handleSubmitReview}
                                handleDeleteReview={handleDeleteReview}
                                reviews={reviews}
                                title={title}
                                t={t}
                                language={language}
                            />
                        )}

                        {/* TAB: SIMILAR */}
                        {activeTab === 'similar' && (
                            <div className="grid gap-2 sm:gap-4 lg:gap-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(clamp(140px, 45%, 200px), 1fr))' }}>
                                {similar.length > 0 ? similar.map(item => (
                                    <MovieCard
                                        key={item.id}
                                        content={item}
                                        contentType={getContentType(item)}
                                        onAddToList={addToMyList}
                                        onRemoveFromList={removeFromMyList}
                                        isInList={isInMyList(item)}
                                    />
                                )) : (
                                    <p className="text-white/50 col-span-full py-8 text-center">Aucun titre similaire trouvé.</p>
                                )}
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* Video Player is managed by PlayerContext globally */}

            {/* Cast Quick View Drawer */}
            <CastQuickView
                isOpen={!!selectedPersonId}
                onClose={() => setSelectedPersonId(null)}
                personId={selectedPersonId}
            />

            {/* Trailer Modal */}
            <AnimatePresence>
                {showTrailerModal && (() => {
                    const trailer = content?.videos?.results?.find(v => v.type === 'Trailer' && v.site === 'YouTube') ||
                                    content?.videos?.results?.find(v => v.site === 'YouTube');
                    if (!trailer?.key) return null;
                    return (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowTrailerModal(false)}
                            className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4 sm:p-8"
                        >
                            <motion.div
                                initial={{ scale: 0.95 }}
                                animate={{ scale: 1 }}
                                exit={{ scale: 0.95 }}
                                onClick={e => e.stopPropagation()}
                                className="relative w-full max-w-4xl aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/15"
                            >
                                <button
                                    onClick={() => setShowTrailerModal(false)}
                                    className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-white/20 transition-all font-bold"
                                    aria-label="Fermer"
                                >
                                    ✕
                                </button>
                                <iframe
                                    src={`https://www.youtube-nocookie.com/embed/${trailer.key}?autoplay=1&rel=0&modestbranding=1`}
                                    title="Bande-annonce"
                                    className="w-full h-full border-none"
                                    allow="autoplay; encrypted-media; fullscreen"
                                    allowFullScreen
                                    referrerPolicy="strict-origin-when-cross-origin"
                                />
                            </motion.div>
                        </motion.div>
                    );
                })()}
            </AnimatePresence>
        </div>
    );
};

export default DetailPage;
