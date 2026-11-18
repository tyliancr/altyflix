import { seasonLabel } from '../utils/seasons';
// Title page: cinematic header (artwork, facts, actions), then tabbed content
// — episodes first for a series, details first for a film.
import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { useProfile } from '../contexts/ProfileContext';
import { useAuth } from '../contexts/AuthContext';
import { usePlayer } from '../contexts/PlayerContext';
import { addOrUpdateReview, getReviewsByContent, deleteReview } from '../services/reviewService';
import { getMovieDetails, getSeriesDetails, getSeasonDetails, getTitleLogo, findByImdbId } from '../services/tmdb';
import { getBackdropUrl, formatRuntime, getYear, getContentType } from '../utils/helpers';
import { isKidSafe } from '../utils/kidsFilter';
import { motion, AnimatePresence } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from '../hooks/useTranslation';
import CastQuickView from '../components/common/CastQuickView';
import { useToast } from '../contexts/ToastContext';
import CastMember from '../components/detail/CastMember';
import EpisodeRow from '../components/detail/EpisodeRow';
import ReviewsSection from '../components/detail/ReviewsSection';
import PosterCard from '../components/ui/PosterCard';
import { PosterGrid, SegmentedControl, EmptyState, Button, IconButton, TrailerModal } from '../components/ui/Primitives';

const EASE = [0.16, 1, 0.3, 1];
const TAB_LABELS = { episodes: 'Épisodes', details: 'Détails', similar: 'Titres similaires', reviews: 'Avis' };

const Fact = ({ label, children }) => (
    <div>
        <dt className="mb-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white/40">{label}</dt>
        <dd className="text-sm leading-relaxed text-white/85">{children}</dd>
    </div>
);

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
    const [logo, setLogo] = useState(undefined); // undefined = still resolving
    const [loading, setLoading] = useState(true);
    const [selectedSeason, setSelectedSeason] = useState(1);
    const [seasonEpisodes, setSeasonEpisodes] = useState([]);
    const [episodesLoading, setEpisodesLoading] = useState(false);
    const [episodesError, setEpisodesError] = useState(false);
    const [retryEpisodes, setRetryEpisodes] = useState(0);
    const [resumeInfo, setResumeInfo] = useState({ season: 1, episode: 1 });
    const [activeTab, setActiveTab] = useState('details');
    const [selectedPersonId, setSelectedPersonId] = useState(null);
    const [showTrailer, setShowTrailer] = useState(false);

    // Reviews state
    const [reviews, setReviews] = useState([]);
    const [userReview, setUserReview] = useState(null);
    const [reviewText, setReviewText] = useState('');
    const [reviewRating, setReviewRating] = useState(0);
    const [hoveredRating, setHoveredRating] = useState(0);
    const [isSubmittingReview, setIsSubmittingReview] = useState(false);

    const type = location.pathname.includes('/tv/') ? 'tv' : 'movie';

    useEffect(() => {
        const controller = new AbortController();
        const fetchDetails = async () => {
            try {
                setLoading(true);
                setContent(null);
                setLogo(undefined);
                window.scrollTo(0, 0);

                const cleanId = String(id || '').replace(/^(movie|tv)-/, '').trim();
                let details = null;
                let resolvedTargetId = cleanId;

                // Support des identifiants IMDb directs (tt...)
                if (/^tt\d+/i.test(cleanId)) {
                    const found = await findByImdbId(cleanId);
                    if (found?.id) {
                        resolvedTargetId = found.id;
                        const targetType = found.media_type === 'tv' ? 'tv' : 'movie';
                        try {
                            details = await (targetType === 'movie' ? getMovieDetails : getSeriesDetails)(found.id);
                        } catch {
                            details = await (targetType === 'movie' ? getSeriesDetails : getMovieDetails)(found.id);
                        }
                    }
                }

                if (!details) {
                    const initialType = Number(resolvedTargetId) === 220102 ? 'tv' : type;
                    try {
                        details = await (initialType === 'movie' ? getMovieDetails : getSeriesDetails)(resolvedTargetId);
                    } catch {
                        // The route type can be wrong (shared links): try the other one.
                        details = await (initialType === 'movie' ? getSeriesDetails : getMovieDetails)(resolvedTargetId);
                    }
                }

                if (controller.signal.aborted) return;
                const isSeries = getContentType(details) === 'tv';
                setContent(details);
                setActiveTab(isSeries ? 'episodes' : 'details');
                if (details?.number_of_seasons) {
                    const expectedType = isSeries ? 'tv' : 'movie';
                    const saved = watchHistory.find(h => {
                        const matchId = String(h.contentId || h.id) === String(id) || String(h.contentId || h.id) === String(resolvedTargetId);
                        if (!matchId) return false;
                        const hType = h.media_type || h.type;
                        return !hType || hType === expectedType;
                    });
                    setSelectedSeason(saved?.season || details.seasons?.find(s => s.season_number > 0)?.season_number || 1);
                }
                getTitleLogo(isSeries ? 'tv' : 'movie', resolvedTargetId).then(url => {
                    if (!controller.signal.aborted) setLogo(url);
                });
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

    const resolvedContentId = content?.id ? String(content.id) : String(id).replace(/^(movie|tv)-/, '');
    const resolvedMediaType = content ? getContentType(content) : type;

    // Resume watch history (réinitialise resumeInfo lors d'un changement de titre sans écraser l'onglet saison choisi)
    useEffect(() => {
        const item = watchHistory.find(h => {
            if (String(h.contentId || h.id) !== resolvedContentId) return false;
            const hType = h.media_type || h.type;
            return !hType || hType === resolvedMediaType;
        });
        if (item?.season && item?.episode) {
            setResumeInfo({ season: item.season, episode: item.episode });
        } else {
            setResumeInfo({ season: 1, episode: 1 });
        }
    }, [watchHistory, resolvedContentId, resolvedMediaType]);

    // Synchroniser la saison initiale uniquement lors du changement de titre
    useEffect(() => {
        const item = watchHistory.find(h => {
            if (String(h.contentId || h.id) !== resolvedContentId) return false;
            const hType = h.media_type || h.type;
            return !hType || hType === resolvedMediaType;
        });
        if (item?.season) {
            setSelectedSeason(item.season);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resolvedContentId, resolvedMediaType]);

    // Load season episodes (utilise content.id numérique même si l'URL contient un IMDb ID tt...)
    useEffect(() => {
        let cancelled = false;
        setSeasonEpisodes([]);
        setEpisodesError(false);
        const loadEpisodes = async () => {
            if (!content || getContentType(content) !== 'tv') return;
            const numericTvId = content.id || id;
            setEpisodesLoading(true);
            try {
                const data = await getSeasonDetails(numericTvId, selectedSeason);
                if (!cancelled) setSeasonEpisodes(data?.episodes || []);
            } catch { if (!cancelled) setEpisodesError(true); }
            finally { if (!cancelled) setEpisodesLoading(false); }
        };
        loadEpisodes();
        return () => { cancelled = true; };
    }, [content, selectedSeason, id, location.pathname, retryEpisodes]);

    // Load reviews (protégé contre les courses async lors d'un changement rapide de fiche)
    useEffect(() => {
        let cancelled = false;
        setReviews([]);
        setUserReview(null);
        setReviewText('');
        setReviewRating(0);
        const loadReviews = async () => {
            if (!content) return;
            const contentId = content.id || content.contentId;
            const fetchedReviews = await getReviewsByContent(contentId);
            if (cancelled) return;
            setReviews(fetchedReviews);

            if (currentUser && currentProfile) {
                const myReview = fetchedReviews.find(r => r.profileId === currentProfile.id);
                setUserReview(myReview || null);
                setReviewText(myReview?.text || '');
                setReviewRating(myReview?.rating || 0);
            }
        };
        loadReviews();
        return () => { cancelled = true; };
    }, [content, currentProfile, currentUser]);

    const handleSubmitReview = async (e) => {
        e.preventDefault();
        if (!reviewRating || !reviewText.trim() || !currentUser || !currentProfile) return;

        setIsSubmittingReview(true);
        const contentId = content.id || content.contentId;
        try {
            const result = await addOrUpdateReview(contentId, currentProfile, currentUser.uid, reviewRating, reviewText.trim());
            if (result?.success) {
                const fetchedReviews = await getReviewsByContent(contentId);
                setReviews(fetchedReviews);
                setUserReview(fetchedReviews.find(r => r.profileId === currentProfile.id));
            } else {
                addToast(result?.error || "Erreur lors de l'enregistrement de l'avis.", 'error');
            }
        } catch {
            addToast("Erreur lors de l'enregistrement de l'avis.", 'error');
        } finally {
            setIsSubmittingReview(false);
        }
    };

    const handleDeleteReview = async () => {
        if (!currentUser || !currentProfile) return;

        const contentId = content.id || content.contentId;
        try {
            const result = await deleteReview(contentId, currentProfile.id);
            if (result?.success) {
                setReviewText('');
                setReviewRating(0);
                setUserReview(null);
                setReviews(await getReviewsByContent(contentId));
            } else {
                addToast(result?.error || "Impossible de supprimer l'avis.", 'error');
            }
        } catch {
            addToast("Impossible de supprimer l'avis.", 'error');
        }
    };

    const handleMarkSeasonWatched = () => {
        if (!content || !seasonEpisodes.length) return;
        addToHistory(content, selectedSeason, seasonEpisodes.at(-1).episode_number, 100);
        addToast(`Saison ${selectedSeason} marquée comme vue !`, 'success');
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#060608]" aria-busy="true">
                <div className="relative h-[78vh] min-h-[520px]">
                    <div className="skeleton absolute inset-0 !rounded-none !bg-[#0c0c10]" />
                    <div className="absolute inset-x-0 bottom-0 h-[50vh] bg-gradient-to-t from-[#060608] to-transparent" />
                    <div className="absolute bottom-16 left-[4%] w-[min(80%,520px)] space-y-4 md:left-[5%]">
                        <div className="skeleton h-16 w-3/4 !rounded-xl sm:h-24" />
                        <div className="skeleton h-4 w-1/2" />
                        <div className="skeleton h-4 w-full" />
                        <div className="skeleton h-12 w-44 !rounded-xl" />
                    </div>
                </div>
            </div>
        );
    }

    if (!content) {
        return (
            <div className="grid min-h-screen place-items-center bg-[#060608] px-6">
                <EmptyState
                    title="Contenu introuvable"
                    action={
                        <div className="flex gap-3 justify-center">
                            <Button onClick={() => window.location.reload()}>Réessayer</Button>
                            <Button variant="secondary" onClick={() => navigate('/')}>Catalogue</Button>
                        </div>
                    }
                >
                    Ce titre n’a pas pu être chargé ou n’est plus disponible.
                </EmptyState>
            </div>
        );
    }

    const isTV = getContentType(content) === 'tv';
    const isKid = Boolean(currentProfile?.isKid);

    if (isKid && !isKidSafe(content)) {
        return (
            <div className="grid min-h-screen place-items-center bg-[#060608] px-6">
                <EmptyState
                    title="Contenu réservé aux profils adultes"
                    action={<Button onClick={() => navigate('/')}>Retour au catalogue Jeunesse</Button>}
                >
                    Ce titre n’est pas accessible avec un profil Enfant.
                </EmptyState>
            </div>
        );
    }

    const title = content.title || content.name;
    const releaseDate = content.release_date || content.first_air_date;
    const cast = content.credits?.cast?.slice(0, 14) || [];
    const director = content.credits?.crew?.find(c => c.job === 'Director')?.name;
    const creators = content.created_by?.slice(0, 3).map(c => c.name).join(', ');
    const seasons = content.seasons?.filter(s => s.season_number > 0) || [];
    const currentSeason = seasons.find(s => s.season_number === selectedSeason);
    const trailer = content.videos?.results?.find(v => v.type === 'Trailer' && v.site === 'YouTube')
        || content.videos?.results?.find(v => v.site === 'YouTube');
    const similar = (content.recommendations?.results?.length > 0
        ? content.recommendations.results
        : content.similar?.results || []).filter(i => i.poster_path && (!isKid || isKidSafe(i))).slice(0, 14);

    const historyItem = watchHistory.find(h => {
        if (String(h.contentId || h.id) !== resolvedContentId) return false;
        const hType = h.media_type || h.type;
        return !hType || hType === (isTV ? 'tv' : 'movie');
    });
    const watchProgress = historyItem?.progress || 0;
    const isWatched = watchProgress >= 90;
    const hasProgress = watchProgress > 0 && watchProgress < 88;
    const resumesHere = hasProgress && (!isTV || selectedSeason === resumeInfo.season);
    const typedContent = { ...content, media_type: isTV ? 'tv' : 'movie' };
    const inList = isInMyList(typedContent);
    const backdropPath = content.backdrop_path || content.poster_path;

    const playLabel = resumesHere
        ? (isTV ? `Reprendre · S${resumeInfo.season} E${resumeInfo.episode}` : 'Reprendre')
        : (isTV && seasons.length > 1 ? `Lecture · ${seasonLabel(currentSeason)}` : 'Lecture');

    const handlePlay = () => play(
        isTV && !resumesHere
            ? { ...content, season: selectedSeason, episode: seasonEpisodes[0]?.episode_number || 1 }
            : content
    );

    const facts = [
        releaseDate && getYear(releaseDate),
        content.number_of_seasons && `${content.number_of_seasons} saison${content.number_of_seasons > 1 ? 's' : ''}`,
        content.runtime > 0 && formatRuntime(content.runtime),
        ...(content.genres?.slice(0, 3).map(g => g.name) || []),
    ].filter(Boolean);

    const tabs = [isTV ? 'episodes' : null, 'details', similar.length ? 'similar' : null, 'reviews'].filter(Boolean);

    const structuredData = {
        '@context': 'https://schema.org',
        '@type': isTV ? 'TVSeries' : 'Movie',
        name: title,
        description: content.overview,
        image: content.poster_path ? `https://image.tmdb.org/t/p/w780${content.poster_path}` : undefined,
        datePublished: releaseDate,
        genre: content.genres?.map(g => g.name),
        aggregateRating: content.vote_average ? {
            '@type': 'AggregateRating',
            ratingValue: content.vote_average.toFixed(1),
            bestRating: '10',
            ratingCount: content.vote_count,
        } : undefined,
        actor: cast.slice(0, 5).map(a => ({ '@type': 'Person', name: a.name })),
        ...(isTV
            ? {
                numberOfSeasons: content.number_of_seasons,
                numberOfEpisodes: content.number_of_episodes,
                creator: content.created_by?.slice(0, 2).map(c => ({ '@type': 'Person', name: c.name })),
            }
            : {
                duration: content.runtime ? `PT${content.runtime}M` : undefined,
                director: director ? { '@type': 'Person', name: director } : undefined,
            }),
    };

    return (
        <div className="min-h-screen bg-[#060608]">
            <Helmet>
                <title>{title} - ALTYFLIX</title>
                <meta name="description" content={content.overview?.slice(0, 160)} />
                <meta property="og:title" content={`${title} - ALTYFLIX`} />
                <meta property="og:description" content={content.overview?.slice(0, 160)} />
                {backdropPath && <meta property="og:image" content={`https://image.tmdb.org/t/p/w1280${backdropPath}`} />}
                <meta property="og:type" content={isTV ? 'video.tv_show' : 'video.movie'} />
                <script type="application/ld+json">{JSON.stringify(structuredData)}</script>
            </Helmet>

            {/* ── Header ── */}
            <header className="relative flex min-h-[78vh] flex-col justify-end overflow-hidden pt-32 md:min-h-[86vh]">
                <div className="absolute inset-0">
                    {backdropPath && (
                        <>
                            <img
                                src={getBackdropUrl(backdropPath, 'w780')}
                                alt=""
                                className="absolute inset-0 h-full w-full object-cover object-[center_20%]"
                                decoding="async"
                            />
                            <motion.img
                                initial={{ opacity: 0, scale: 1.03 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.9, ease: 'easeOut' }}
                                src={getBackdropUrl(backdropPath, 'original')}
                                srcSet={content.backdrop_path ? `${getBackdropUrl(backdropPath, 'w1280')} 1280w, ${getBackdropUrl(backdropPath, 'original')} 2560w` : undefined}
                                sizes="100vw"
                                alt=""
                                className="absolute inset-0 h-full w-full object-cover object-[center_20%]"
                                decoding="async"
                                onError={(e) => {
                                    if (!e.currentTarget.dataset.retried) {
                                        e.currentTarget.dataset.retried = '1';
                                        e.currentTarget.removeAttribute('srcset');
                                        e.currentTarget.src = getBackdropUrl(backdropPath, 'w1280');
                                    }
                                }}
                            />
                        </>
                    )}
                    <div className="absolute inset-y-0 left-0 w-full bg-gradient-to-r from-[#060608]/95 via-[#060608]/60 to-transparent sm:w-[72%]" />
                    <div className="absolute inset-x-0 bottom-0 h-[60%] bg-gradient-to-t from-[#060608] via-[#060608]/75 to-transparent" />
                    <div className="absolute inset-x-0 top-0 h-[22vh] bg-gradient-to-b from-[#060608]/80 to-transparent" />
                </div>

                <motion.div
                    initial="hidden"
                    animate="show"
                    variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.1 } } }}
                    className="relative z-10 max-w-3xl px-[4%] pb-10 md:px-[5%] md:pb-14"
                >
                    <motion.p
                        variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } } }}
                        className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.28em] text-white/70 sm:text-xs"
                    >
                        <span className="text-base font-black leading-none tracking-normal text-[#E50914] sm:text-lg">A</span>
                        {isTV ? 'Série' : 'Film'}
                    </motion.p>

                    <motion.div
                        variants={{ hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { duration: 0.8, ease: EASE } } }}
                        className="mb-5"
                    >
                        {logo ? (
                            <>
                                <h1 className="sr-only">{title}</h1>
                                <img
                                    src={logo}
                                    alt=""
                                    className="max-h-[15vh] w-auto max-w-[78%] object-contain object-left-bottom sm:max-h-[22vh] sm:max-w-[min(520px,42vw)]"
                                    style={{ filter: 'drop-shadow(0 0 1px rgba(255,255,255,0.55)) drop-shadow(0 6px 24px rgba(0,0,0,0.65))' }}
                                    onError={() => setLogo(null)}
                                />
                            </>
                        ) : (
                            <h1
                                className={`font-display font-black leading-[0.94] tracking-[-0.035em] text-white text-balance transition-opacity duration-500
                                    ${title.length <= 16 ? 'text-5xl sm:text-7xl' : title.length <= 30 ? 'text-4xl sm:text-6xl' : 'text-3xl sm:text-5xl'}
                                    ${logo === undefined ? 'opacity-0' : 'opacity-100'}`}
                                style={{ textShadow: '0 8px 40px rgba(0,0,0,0.7)' }}
                            >
                                {title}
                            </h1>
                        )}
                    </motion.div>

                    <motion.div
                        variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } } }}
                        className="mb-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] font-medium text-white/75 sm:text-[15px]"
                    >
                        {content.vote_average > 0 && (
                            <span className="font-bold text-[#46d369]">{Math.round(content.vote_average * 10)}% recommandé</span>
                        )}
                        {facts.map((fact, i) => (
                            <span key={fact} className="flex items-center gap-2.5">
                                {(i > 0 || content.vote_average > 0) && <span aria-hidden="true" className="h-[3px] w-[3px] rounded-full bg-white/40" />}
                                {fact}
                            </span>
                        ))}
                        {isWatched && (
                            <span className="rounded-md border border-[#46d369]/30 bg-[#46d369]/10 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-[#46d369]">Vu</span>
                        )}
                    </motion.div>

                    {content.tagline && (
                        <motion.p
                            variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } } }}
                            className="mb-2 text-sm font-medium italic text-white/60 sm:text-base"
                        >
                            {content.tagline}
                        </motion.p>
                    )}

                    {content.overview && (
                        <motion.p
                            variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } } }}
                            className="mb-7 max-w-xl text-sm leading-relaxed text-white/85 line-clamp-3 sm:text-[1.05rem]"
                        >
                            {content.overview}
                        </motion.p>
                    )}

                    <motion.div
                        variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } } }}
                        className="flex flex-wrap items-center gap-2.5 sm:gap-3"
                    >
                        <Button size="lg" onClick={handlePlay} className="pl-5 font-bold shadow-[0_10px_40px_rgba(0,0,0,0.45)]">
                            <svg className="h-6 w-6 flex-none fill-current sm:h-7 sm:w-7" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                            {playLabel}
                        </Button>

                        <IconButton
                            label={inList ? 'Retirer de ma liste' : 'Ajouter à ma liste'}
                            active={inList}
                            aria-pressed={inList}
                            onClick={() => (inList ? removeFromMyList(content.id, isTV ? 'tv' : 'movie') : addToMyList(typedContent))}
                        >
                            {inList ? (
                                <svg className="h-5 w-5 text-[#46d369]" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                            ) : (
                                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                            )}
                        </IconButton>

                        {trailer?.key && (
                            <IconButton label="Voir la bande-annonce" onClick={() => setShowTrailer(true)}>
                                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                            </IconButton>
                        )}

                        <IconButton
                            label={isWatched ? 'Marquer comme non vu' : 'Marquer comme vu'}
                            active={isWatched}
                            aria-pressed={isWatched}
                            onClick={() => markAsWatched(content, isTV ? selectedSeason : null, isTV ? (resumeInfo?.episode || 1) : null)}
                        >
                            <svg className={`h-5 w-5 ${isWatched ? 'text-[#46d369]' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                <circle cx="12" cy="12" r="3" />
                            </svg>
                        </IconButton>
                    </motion.div>

                    {hasProgress && (
                        <div className="mt-6 max-w-sm" aria-label={`Visionnage : ${Math.round(watchProgress)} %`}>
                            <div className="mb-2 flex justify-between gap-4 text-xs text-white/60">
                                <span>{isTV ? `${seasonLabel(seasons.find(s => s.season_number === resumeInfo.season))} · Épisode ${resumeInfo.episode}` : 'Lecture en cours'}</span>
                                <span>{Math.round(watchProgress)} %</span>
                            </div>
                            <div className="h-1 overflow-hidden rounded-full bg-white/15">
                                <div className="h-full rounded-full bg-[#E50914]" style={{ width: `${Math.min(100, watchProgress)}%` }} />
                            </div>
                        </div>
                    )}
                </motion.div>
            </header>

            {/* ── Tabs ── */}
            <div id="detail-content" className="scroll-mt-20 px-[4%] pb-12 md:px-[5%]">
                <div role="tablist" className="no-scrollbar mb-10 flex gap-7 overflow-x-auto border-b border-white/[0.08]">
                    {tabs.map(tab => (
                        <button
                            key={tab}
                            type="button"
                            role="tab"
                            aria-selected={activeTab === tab}
                            onClick={() => setActiveTab(tab)}
                            className={`relative whitespace-nowrap pb-3.5 text-[15px] font-semibold transition-colors ${activeTab === tab ? 'text-white' : 'text-white/45 hover:text-white/80'}`}
                        >
                            {TAB_LABELS[tab]}
                            {tab === 'reviews' && reviews.length > 0 && <span className="ml-1.5 text-xs text-white/35">{reviews.length}</span>}
                            {activeTab === tab && (
                                <motion.span layoutId="detail-tab" className="absolute inset-x-0 -bottom-px h-[3px] rounded-full bg-[#E50914]" />
                            )}
                        </button>
                    ))}
                </div>

                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeTab}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.22 }}
                    >
                        {activeTab === 'episodes' && isTV && (
                            <div className="max-w-5xl">
                                <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                                    {seasons.length > 1 && seasons.length <= 6 ? (
                                        <SegmentedControl
                                            label="Choisir une saison"
                                            value={selectedSeason}
                                            onChange={setSelectedSeason}
                                            options={seasons.map(s => ({ id: s.season_number, label: seasonLabel(s) }))}
                                        />
                                    ) : seasons.length > 6 ? (
                                        <select
                                            aria-label="Choisir une saison"
                                            value={selectedSeason}
                                            onChange={e => setSelectedSeason(Number(e.target.value))}
                                            className="field-select h-11"
                                        >
                                            {seasons.map(s => (
                                                <option key={s.season_number} value={s.season_number}>
                                                    {seasonLabel(s)}{s.episode_count ? ` · ${s.episode_count} épisodes` : ''}
                                                </option>
                                            ))}
                                        </select>
                                    ) : (
                                        <p className="text-sm text-white/50">{seasonEpisodes.length > 0 && `${seasonEpisodes.length} épisodes`}</p>
                                    )}
                                    {seasonEpisodes.length > 0 && (
                                        <Button variant="ghost" size="sm" onClick={handleMarkSeasonWatched}>
                                            <svg className="h-4 w-4 text-[#46d369]" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                            Marquer la saison comme vue
                                        </Button>
                                    )}
                                </div>

                                {episodesLoading ? (
                                    <div role="status" aria-live="polite" className="space-y-3">
                                        <span className="sr-only">Chargement des épisodes…</span>
                                        {[1, 2, 3, 4].map(n => <div key={n} className="skeleton h-28 !rounded-2xl" />)}
                                    </div>
                                ) : episodesError ? (
                                    <EmptyState tone="error" title="Les épisodes n’ont pas pu être chargés" action={<Button onClick={() => setRetryEpisodes(n => n + 1)}>Réessayer</Button>}>
                                        Vérifiez votre connexion, puis réessayez.
                                    </EmptyState>
                                ) : seasonEpisodes.length > 0 ? (
                                    <div className="space-y-1">
                                        {seasonEpisodes.map(ep => {
                                            const isEpWatched = Boolean(historyItem && (
                                                historyItem.season > selectedSeason ||
                                                (historyItem.season === selectedSeason && (historyItem.episode > ep.episode_number || (historyItem.episode === ep.episode_number && historyItem.progress >= 90)))
                                            ));
                                            const epProgress = historyItem && historyItem.season === selectedSeason && historyItem.episode === ep.episode_number
                                                ? (historyItem.progress || 0)
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
                                        })}
                                    </div>
                                ) : (
                                    <EmptyState title={t('detail.noEpisodes')} />
                                )}
                            </div>
                        )}

                        {activeTab === 'details' && (
                            <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-16">
                                <div className="min-w-0">
                                    {content.overview && (
                                        <p className="max-w-3xl text-base leading-relaxed text-white/80 md:text-lg">{content.overview}</p>
                                    )}

                                    {cast.length > 0 && (
                                        <div className="mt-10">
                                            <h2 className="mb-4 font-display text-xl font-bold tracking-tight text-white">{t('detail.cast')}</h2>
                                            <div className="no-scrollbar -mx-[4%] flex gap-3.5 overflow-x-auto px-[4%] pb-2 md:mx-0 md:px-0">
                                                {cast.map(member => (
                                                    <CastMember key={member.id} member={member} onClick={setSelectedPersonId} />
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <dl className="h-fit space-y-5 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-6">
                                    {director && <Fact label="Réalisation">{director}</Fact>}
                                    {creators && <Fact label="Création">{creators}</Fact>}
                                    {content.genres?.length > 0 && (
                                        <Fact label="Genres">
                                            {content.genres.map((g, i) => (
                                                <span key={g.id}>
                                                    {i > 0 && ', '}
                                                    {isTV ? g.name : <Link to={`/category/${g.id}`} className="underline-offset-4 hover:text-white hover:underline">{g.name}</Link>}
                                                </span>
                                            ))}
                                        </Fact>
                                    )}
                                    {releaseDate && (
                                        <Fact label={isTV ? 'Première diffusion' : 'Sortie'}>
                                            {new Date(releaseDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                                        </Fact>
                                    )}
                                    {content.number_of_episodes > 0 && <Fact label="Épisodes">{content.number_of_episodes}</Fact>}
                                    {content.vote_average > 0 && (
                                        <Fact label="Note TMDB">{content.vote_average.toFixed(1)} / 10 · {content.vote_count?.toLocaleString('fr-FR')} votes</Fact>
                                    )}
                                    {content.production_countries?.length > 0 && (
                                        <Fact label="Pays">{content.production_countries.map(c => c.name).join(', ')}</Fact>
                                    )}
                                </dl>
                            </div>
                        )}

                        {activeTab === 'similar' && (
                            <PosterGrid>
                                {similar.map(item => <PosterCard key={item.id} item={item} type={getContentType(item)} />)}
                            </PosterGrid>
                        )}

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
                    </motion.div>
                </AnimatePresence>
            </div>

            <CastQuickView
                isOpen={!!selectedPersonId}
                onClose={() => setSelectedPersonId(null)}
                personId={selectedPersonId}
            />

            <TrailerModal videoKey={showTrailer ? trailer?.key : null} onClose={() => setShowTrailer(false)} />
        </div>
    );
};

export default DetailPage;
