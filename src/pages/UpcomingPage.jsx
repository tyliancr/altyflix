import { useState, useEffect, useMemo } from 'react';
import {
    getUpcomingMovies, getUpcomingSeries, getReturningSeries,
    getSeriesDetails, getNowPlayingMovies, getMovieDetails
} from '../services/tmdb';
import { getPosterUrl, getBackdropUrl } from '../utils/helpers';
import { format, differenceInCalendarDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { useToast } from '../contexts/ToastContext';
import { useProfile } from '../contexts/ProfileContext';
import { PosterGrid, GridSkeleton, SectionTitle, SegmentedControl, EmptyState, Button, TrailerModal } from '../components/ui/Primitives';

const BELL = 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9';
const CHECK = 'M5 13l4 4L19 7';

const daysUntil = (dateStr) => differenceInCalendarDays(new Date(dateStr), new Date());

const countdown = (dateStr) => {
    const days = daysUntil(dateStr);
    if (days <= 0) return "Aujourd'hui";
    if (days === 1) return 'Demain';
    return `Dans ${days} jours`;
};

const pathOf = (item) => `/${item.type === 'movie' ? 'movie' : 'tv'}/${item.id}`;


// ─── Featured release ────────────────────────────────────────────────────────
const HeroUpcoming = ({ item, onReminder, isReminded, onTrailer, trailerLoading }) => (
    <header className="relative flex min-h-[70vh] flex-col justify-end overflow-hidden pt-32">
        <div className="absolute inset-0">
            {item.backdrop_path && (
                <img
                    src={getBackdropUrl(item.backdrop_path, 'w1280')}
                    alt=""
                    className="h-full w-full object-cover object-[center_20%]"
                    decoding="async"
                />
            )}
            <div className="absolute inset-y-0 left-0 w-full bg-gradient-to-r from-[#060608]/95 via-[#060608]/55 to-transparent sm:w-[70%]" />
            <div className="absolute inset-x-0 bottom-0 h-[60%] bg-gradient-to-t from-[#060608] via-[#060608]/70 to-transparent" />
            <div className="absolute inset-x-0 top-0 h-[22vh] bg-gradient-to-b from-[#060608]/80 to-transparent" />
        </div>

        <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 max-w-3xl px-[4%] pb-12 md:px-[5%]"
        >
            <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.24em] text-[#E50914]">Prochainement · {item.subtypeLabel}</p>
            <h1 className="font-display text-4xl font-black leading-[0.95] tracking-[-0.03em] text-white text-balance sm:text-6xl" style={{ textShadow: '0 8px 40px rgba(0,0,0,0.7)' }}>
                {item.title}
            </h1>
            <p className="mt-4 flex flex-wrap items-center gap-x-2.5 text-sm font-medium text-white/75 sm:text-base">
                <span className="font-bold text-white">{countdown(item.date)}</span>
                <span aria-hidden="true" className="h-[3px] w-[3px] rounded-full bg-white/40" />
                <span>{format(new Date(item.date), 'd MMMM yyyy', { locale: fr })}</span>
            </p>
            {item.overview && (
                <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/80 line-clamp-3 sm:text-[1.05rem]">{item.overview}</p>
            )}
            <div className="mt-7 flex flex-wrap items-center gap-2.5 sm:gap-3">
                <Button size="lg" variant={isReminded ? 'glass' : 'primary'} onClick={onReminder} aria-pressed={isReminded} className="font-bold">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d={isReminded ? CHECK : BELL} /></svg>
                    {isReminded ? 'Rappel activé' : 'Me prévenir'}
                </Button>
                <Button size="lg" variant="glass" onClick={onTrailer} disabled={trailerLoading}>
                    {trailerLoading ? 'Chargement…' : 'Bande-annonce'}
                </Button>
                <Link to={pathOf(item)} className="px-3 py-3 text-sm font-semibold text-white/70 underline-offset-4 hover:text-white hover:underline">
                    {"Plus d'infos"}
                </Link>
            </div>
        </motion.div>
    </header>
);

// ─── Release card ────────────────────────────────────────────────────────────
const UpcomingCard = ({ item, onReminder, isReminded }) => (
    <article className="group relative min-w-0">
        <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-[#101016] ring-1 ring-inset ring-white/[0.07] shadow-[0_6px_20px_rgba(0,0,0,0.45)] transition-[box-shadow,transform] duration-300 group-hover:-translate-y-1 group-hover:shadow-[0_18px_40px_rgba(0,0,0,0.7)]">
            <Link to={pathOf(item)} aria-label={item.title} className="absolute inset-0 block">
                {item.poster_path ? (
                    <img
                        src={getPosterUrl(item.poster_path, 'w342')}
                        alt=""
                        className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.06]"
                        loading="lazy"
                        decoding="async"
                    />
                ) : (
                    <span className="grid h-full w-full place-items-center p-4 text-center font-display text-sm font-semibold text-white/50">{item.title}</span>
                )}
            </Link>
            <span className="pointer-events-none absolute left-2 top-2 rounded-md border border-white/15 bg-black/70 px-1.5 py-1 text-[10px] font-bold leading-none text-white backdrop-blur-md">
                {daysUntil(item.date) > 0 ? `J-${daysUntil(item.date)}` : "Aujourd'hui"}
            </span>
            <button
                type="button"
                onClick={() => onReminder(item)}
                aria-pressed={isReminded}
                aria-label={isReminded ? `Retirer le rappel pour ${item.title}` : `Me prévenir de la sortie de ${item.title}`}
                className={`absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full border backdrop-blur-md transition-all hover:scale-110 active:scale-95 ${
                    isReminded ? 'border-white bg-white text-black' : 'border-white/30 bg-black/55 text-white hover:border-white'
                }`}
            >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d={isReminded ? CHECK : BELL} /></svg>
            </button>
        </div>
        <h3 className="mt-2.5 truncate px-0.5 text-[13px] font-semibold text-white/90">{item.title}</h3>
        <p className="truncate px-0.5 text-xs text-white/45">
            {format(new Date(item.date), 'd MMM yyyy', { locale: fr })} · {item.subtypeLabel}
        </p>
    </article>
);

const isRemindedIn = (reminders, item) => reminders.some(r =>
    typeof r === 'object' ? (r.id === item.id && (!r.type || r.type === item.type)) : r === item.id
);

const ReleaseGrid = ({ items, reminders, onReminder }) => (
    <PosterGrid>
        {items.map(item => (
            <UpcomingCard key={`${item.type}-${item.id}`} item={item} isReminded={isRemindedIn(reminders, item)} onReminder={onReminder} />
        ))}
    </PosterGrid>
);

// ─── Main Page ────────────────────────────────────────────────────────────────
const UpcomingPage = () => {
    const { addToast } = useToast();
    const { currentProfile } = useProfile();
    const isKid = Boolean(currentProfile?.isKid);
    const [allItems, setAllItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeFilter, setActiveFilter] = useState('all');
    const [reminders, setReminders] = useState(() => {
        try {
            const saved = localStorage.getItem('ALTYFLIX_reminders');
            return saved ? JSON.parse(saved) : [];
        } catch { return []; }
    });

    useEffect(() => {
        let active = true;
        const fetchAll = async () => {
            try {
                const [moviesRes, newSeriesRes, returningSeriesRes, nowPlayingRes] = await Promise.allSettled([
                    getUpcomingMovies(),
                    getUpcomingSeries(),
                    getReturningSeries(),
                    getNowPlayingMovies()
                ]);
                if (!active) return;

                const moviesData = moviesRes.status === 'fulfilled' ? moviesRes.value : { results: [] };
                const newSeriesData = newSeriesRes.status === 'fulfilled' ? newSeriesRes.value : { results: [] };
                const returningSeriesData = returningSeriesRes.status === 'fulfilled' ? returningSeriesRes.value : { results: [] };
                const nowPlayingData = nowPlayingRes.status === 'fulfilled' ? nowPlayingRes.value : { results: [] };

                const today = new Date();
                today.setHours(0, 0, 0, 0);

                const normalize = (list, type, dateKey, label) =>
                    (list || []).map(item => ({
                        ...item, type,
                        title: item.title || item.name,
                        date: item[dateKey],
                        subtypeLabel: label,
                    }));

                const rawMovies = [
                    ...normalize(moviesData.results, 'movie', 'release_date', 'Film'),
                    ...normalize(nowPlayingData.results, 'movie', 'release_date', 'Film'),
                ];
                const rawSeries = normalize(newSeriesData.results, 'tv', 'first_air_date', 'Nouvelle série');

                // Séries de retour
                const returningRaw = returningSeriesData.results || [];
                const returning = await Promise.all(
                    returningRaw.slice(0, 10).map(async s => {
                        try {
                            const details = await getSeriesDetails(s.id);
                            if (!details.next_episode_to_air) return null;
                            return {
                                ...s, ...details, type: 'tv',
                                title: s.name,
                                date: details.next_episode_to_air.air_date,
                                subtypeLabel: 'Nouvelle saison',
                            };
                        } catch { return null; }
                    })
                );
                if (!active) return;
                const validReturning = returning.filter(Boolean);

                const all = [...rawMovies, ...rawSeries, ...validReturning];
                const seen = new Set();
                const filtered = all.filter(item => {
                    const key = `${item.type}-${item.id}`;
                    if (!item.date || seen.has(key)) return false;
                    const d = new Date(item.date);
                    if (Number.isNaN(d.getTime())) return false;
                    d.setHours(0, 0, 0, 0);
                    if (d < today) return false;
                    seen.add(key);
                    return true;
                });

                filtered.sort((a, b) => new Date(a.date) - new Date(b.date));
                setAllItems(filtered);
            } catch (e) {
                console.error('Error fetching upcoming:', e);
            } finally {
                if (active) setLoading(false);
            }
        };
        fetchAll();
        return () => { active = false; };
    }, []);

    const { visibleItems, movies, newSeries, returningSeries, heroItem } = useMemo(() => {
        const list = isKid
            ? allItems.filter(item => {
                if (item.adult) return false;
                const gids = item.genre_ids || (item.genres || []).map(g => g.id);
                if (gids.some(g => [27, 80, 53, 10752, 10768].includes(g))) return false;
                return gids.some(g => [16, 10751, 10762].includes(g));
            })
            : allItems;
        const movies = list.filter(i => i.type === 'movie');
        const newSeries = list.filter(i => i.type === 'tv' && i.subtypeLabel === 'Nouvelle série');
        const returningSeries = list.filter(i => i.subtypeLabel === 'Nouvelle saison');
        const hero = list.find(i => i.backdrop_path) || list[0] || null;
        return { visibleItems: list, movies, newSeries, returningSeries, heroItem: hero };
    }, [allItems, isKid]);

    const filtered = activeFilter === 'movies' ? movies
        : activeFilter === 'series' ? newSeries
        : activeFilter === 'returning' ? returningSeries
        : visibleItems;

    const [trailerKey, setTrailerKey] = useState(null);
    const [trailerLoading, setTrailerLoading] = useState(false);

    // TMDB lists each title's videos: play the official trailer in place
    const openTrailer = async (item) => {
        setTrailerLoading(true);
        try {
            const details = await (item.type === 'movie' ? getMovieDetails : getSeriesDetails)(item.id);
            const videos = details?.videos?.results || [];
            const trailer = videos.find(v => v.site === 'YouTube' && v.type === 'Trailer') || videos.find(v => v.site === 'YouTube');
            if (trailer?.key) setTrailerKey(trailer.key);
            else addToast('Aucune bande-annonce disponible pour ce titre.', 'error');
        } catch {
            addToast('La bande-annonce n’a pas pu être chargée.', 'error');
        } finally {
            setTrailerLoading(false);
        }
    };

    const toggleReminder = (item) => {
        const exists = isRemindedIn(reminders, item);
        const next = exists
            ? reminders.filter(r => (typeof r === 'object' ? !(r.id === item.id && (!r.type || r.type === item.type)) : r !== item.id))
            : [...reminders, { id: item.id, type: item.type }];
        setReminders(next);
        try { localStorage.setItem('ALTYFLIX_reminders', JSON.stringify(next)); } catch { /* ignore */ }
        window.dispatchEvent(new Event('ALTYFLIX_reminders_updated'));
        addToast(exists ? 'Rappel supprimé' : `Rappel activé pour ${item.title}`, exists ? 'info' : 'success');
    };

    return (
        <div className="min-h-screen bg-[#060608] pb-12 text-white">
            <Helmet>
                <title>Prochainement — ALTYFLIX</title>
                <meta name="description" content="Découvrez les prochaines sorties films et séries sur ALTYFLIX." />
            </Helmet>

            {loading ? (
                <div className="px-[4%] pt-[calc(env(safe-area-inset-top,0px)+6rem)] md:px-[5%] md:pt-32" aria-busy="true">
                    <div className="skeleton mb-10 h-12 w-72" />
                    <GridSkeleton count={14} />
                </div>
            ) : visibleItems.length === 0 ? (
                <div className="px-6 pt-40">
                    <EmptyState
                        title="Aucune sortie prévue pour le moment"
                        icon={<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
                    >
                        Revenez bientôt : le calendrier est mis à jour chaque jour.
                    </EmptyState>
                </div>
            ) : (
                <>
                    {heroItem && (
                        <HeroUpcoming
                            item={heroItem}
                            isReminded={isRemindedIn(reminders, heroItem)}
                            onReminder={() => toggleReminder(heroItem)}
                            onTrailer={() => openTrailer(heroItem)}
                            trailerLoading={trailerLoading}
                        />
                    )}

                    <div className="sticky top-[calc(env(safe-area-inset-top,0px)+5.25rem)] z-30 border-b border-white/[0.06] bg-[#060608]/85 px-[4%] py-3 backdrop-blur-xl md:top-[76px] md:px-[5%]">
                        <SegmentedControl
                            label="Filtrer les sorties"
                            value={activeFilter}
                            onChange={setActiveFilter}
                            options={[
                                { id: 'all', label: 'Tout', count: visibleItems.length },
                                { id: 'movies', label: 'Films', count: movies.length },
                                { id: 'series', label: 'Nouvelles séries', count: newSeries.length },
                                { id: 'returning', label: 'Retours', count: returningSeries.length },
                            ]}
                        />
                    </div>

                    <div className="px-[4%] pt-10 md:px-[5%]">
                        {activeFilter !== 'all' ? (
                            filtered.length > 0
                                ? <ReleaseGrid items={filtered} reminders={reminders} onReminder={toggleReminder} />
                                : <EmptyState title="Rien de prévu dans cette catégorie" />
                        ) : (
                            <div className="space-y-14">
                                {[
                                    { title: 'Films à venir', items: movies },
                                    { title: 'Nouvelles séries', items: newSeries },
                                    { title: 'Retours de saisons', items: returningSeries },
                                ].filter(section => section.items.length > 0).map(section => (
                                    <section key={section.title}>
                                        <SectionTitle count={section.items.length}>{section.title}</SectionTitle>
                                        <ReleaseGrid items={section.items} reminders={reminders} onReminder={toggleReminder} />
                                    </section>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}
            <TrailerModal videoKey={trailerKey} onClose={() => setTrailerKey(null)} />
        </div>
    );
};

export default UpcomingPage;
