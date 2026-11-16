import { useState, useEffect, useMemo } from 'react';
import {
    getUpcomingMovies, getUpcomingSeries, getReturningSeries,
    getSeriesDetails, getNowPlayingMovies
} from '../services/tmdb';
import { getPosterUrl, getBackdropUrl } from '../utils/helpers';
import { format, differenceInDays, isPast } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Helmet } from 'react-helmet-async';

// ─── Countdown Component ─────────────────────────────────────────────────────
const Countdown = ({ dateStr }) => {
    const days = differenceInDays(new Date(dateStr), new Date());
    if (days <= 0) return <span className="text-green-400 font-black text-sm">Disponible maintenant</span>;
    if (days === 1) return <span className="text-yellow-400 font-black text-sm">Demain !</span>;
    return (
        <div className="flex items-center gap-1.5">
            <div className="bg-white/10 rounded-lg px-3 py-1.5 text-center min-w-[52px]">
                <div className="text-2xl font-black text-white leading-none">{days}</div>
                <div className="text-[9px] text-white/50 uppercase tracking-widest mt-0.5">jours</div>
            </div>
        </div>
    );
};

// ─── Badge Component ─────────────────────────────────────────────────────────
const TypeBadge = ({ type, subtypeLabel }) => {
    const label = subtypeLabel || (type === 'movie' ? 'Film à venir' : 'Nouvelle Série');
    const isSeries = type === 'tv' || label.toLowerCase().includes('série') || label.toLowerCase().includes('saison');
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
            isSeries 
                ? 'bg-white/10 text-white/90 border border-white/15'
                : 'bg-[#E50914]/15 border border-[#E50914]/30 text-red-300'
        }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isSeries ? 'bg-white/80' : 'bg-[#E50914] animate-pulse'}`} />
            {label}
        </span>
    );
};

// ─── Hero Section ────────────────────────────────────────────────────────────
const HeroUpcoming = ({ item, onReminder, isReminded, onTrailer }) => {
    if (!item) return null;
    const backdrop = getBackdropUrl(item.backdrop_path, 'original');
    const poster = getPosterUrl(item.poster_path, 'w500');

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="relative w-full h-[75vh] min-h-[500px] overflow-hidden"
        >
            {/* Background */}
            <div
                className="absolute inset-0 bg-cover bg-center scale-105 animate-hero-pan"
                style={{ backgroundImage: `url(${backdrop})` }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0B0B0F] via-[#0B0B0F]/60 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#0B0B0F] via-[#0B0B0F]/20 to-transparent" />

            {/* Content */}
            <div className="absolute inset-0 flex items-end pb-16 px-[4%] md:px-[5%]">
                <div className="flex items-end gap-8 max-w-4xl">
                    {/* Poster flottant */}
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="hidden md:block flex-none w-44 rounded-xl overflow-hidden shadow-2xl border border-white/10"
                    >
                        <img src={poster} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
                    </motion.div>

                    {/* Info */}
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 }}
                        className="flex-1"
                    >
                        <TypeBadge type={item.type} subtypeLabel={item.subtypeLabel} />
                        <h1 className="text-4xl md:text-6xl font-black mt-3 mb-3 leading-none tracking-tight text-shadow-netflix">
                            {item.title}
                        </h1>
                        {item.date && (
                            <div className="flex items-center gap-4 mb-4">
                                <span className="text-white/60 font-bold">
                                    {isPast(new Date(item.date)) ? 'Sorti le' : 'Le'} {format(new Date(item.date), 'd MMMM yyyy', { locale: fr })}
                                </span>
                                {!isPast(new Date(item.date)) && <Countdown dateStr={item.date} />}
                            </div>
                        )}
                        <p className="text-white/60 text-base leading-relaxed mb-6 max-w-xl line-clamp-2">
                            {item.overview || 'Synopsis bientôt disponible.'}
                        </p>
                        <div className="flex items-center gap-3 flex-wrap">
                            <button
                                onClick={onTrailer}
                                className="flex items-center gap-2 bg-white text-black font-black px-6 py-3 rounded-full hover:bg-gray-200 transition-all shadow-xl hover:scale-105 active:scale-95"
                            >
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M8 5v14l11-7z" />
                                </svg>
                                Bande-annonce
                            </button>
                            <button
                                onClick={onReminder}
                                className={`flex items-center gap-2 font-black px-6 py-3 rounded-full transition-all hover:scale-105 active:scale-95 border ${isReminded
                                    ? 'bg-white text-black border-white shadow-xl'
                                    : 'bg-white/10 text-white border-white/20 hover:bg-white/20'
                                    }`}
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                                        d={isReminded ? "M5 13l4 4L19 7" : "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"} />
                                </svg>
                                {isReminded ? 'Rappel activé' : "M'avertir"}
                            </button>
                        </div>
                    </motion.div>
                </div>
            </div>
        </motion.div>
    );
};

// ─── Upcoming Card ────────────────────────────────────────────────────────────
const UpcomingCard = ({ item, onReminder, isReminded, index }) => {
    const navigate = useNavigate();
    const daysLeft = item.date ? differenceInDays(new Date(item.date), new Date()) : null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.05 }}
            className="group relative bg-white/5 border border-white/8 rounded-2xl overflow-hidden hover:bg-white/10 transition-all duration-300 hover:border-white/20 hover:scale-[1.02] cursor-pointer"
        >
            {/* Poster */}
            <div
                className="relative aspect-[2/3] overflow-hidden"
                onClick={() => navigate(`/${item.type === 'movie' ? 'movie' : 'tv'}/${item.id}`)}
            >
                <img
                    src={getPosterUrl(item.poster_path, 'w342')}
                    alt={item.title}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                    loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                {/* Badge Coming Soon */}
                {daysLeft !== null && daysLeft > 0 && (
                    <div className="absolute top-2.5 left-2.5 z-10">
                        <div className="bg-black/80 backdrop-blur-md border border-white/15 text-white text-[10px] font-bold px-2 py-0.5 rounded-md tracking-wider shadow-lg flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#E50914]" />
                            {daysLeft}j
                        </div>
                    </div>
                )}

                {/* Bouton play (hover) */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
                    <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30">
                        <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                        </svg>
                    </div>
                </div>
            </div>

            {/* Info */}
            <div className="p-3">
                <TypeBadge type={item.type} subtypeLabel={item.subtypeLabel} />
                <h3 className="text-white font-bold text-sm mt-2 leading-tight line-clamp-1">{item.title}</h3>
                {item.date && (
                    <p className="text-white/50 text-xs mt-1 font-medium">
                        {format(new Date(item.date), 'd MMM yyyy', { locale: fr })}
                    </p>
                )}

                {/* Bouton rappel */}
                <button
                    onClick={(e) => { e.stopPropagation(); onReminder(item); }}
                    className={`mt-2.5 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${isReminded
                        ? 'bg-[#E50914] text-white shadow-[0_0_12px_rgba(229,9,20,0.4)]'
                        : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white hover:border-white/20'
                        }`}
                >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d={isReminded ? "M5 13l4 4L19 7" : "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"} />
                    </svg>
                    {isReminded ? 'Rappel activé' : 'Me rappeler'}
                </button>
            </div>
        </motion.div>
    );
};

// ─── Category Section ────────────────────────────────────────────────────────
const CategorySection = ({ title, icon, items, reminders, onReminder }) => {
    if (!items.length) return null;
    return (
        <section>
            <div className="flex items-center gap-3 mb-5 px-[4%] md:px-[5%]">
                <span className="text-2xl">{icon}</span>
                <h2 className="text-xl font-black text-white tracking-tight">{title}</h2>
                <span className="text-white/30 text-sm font-bold">{items.length}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 px-[4%] md:px-[5%]">
                {items.map((item, i) => (
                    <UpcomingCard
                        key={`${item.type}-${item.id}`}
                        item={item}
                        index={i}
                        isReminded={reminders.some(r => (typeof r === 'object' ? r.id === item.id : r === item.id))}
                        onReminder={onReminder}
                    />
                ))}
            </div>
        </section>
    );
};

// ─── Main Page ────────────────────────────────────────────────────────────────
const UpcomingPage = () => {
    const [allItems, setAllItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeFilter, setActiveFilter] = useState('all');
    const [reminders, setReminders] = useState(() => {
        try {
            const saved = localStorage.getItem('ALTYFLIX_reminders');
            return saved ? JSON.parse(saved) : [];
        } catch { return []; }
    });
    const [toast, setToast] = useState(null);

    useEffect(() => {
        const fetchAll = async () => {
            try {
                const [moviesData, newSeriesData, returningSeriesData, nowPlayingData] = await Promise.all([
                    getUpcomingMovies(),
                    getUpcomingSeries(),
                    getReturningSeries(),
                    getNowPlayingMovies()
                ]);

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
                    ...normalize(moviesData.results, 'movie', 'release_date', 'Prochainement'),
                    ...normalize(nowPlayingData.results, 'movie', 'release_date', 'Prochainement'),
                ];
                const rawSeries = normalize(newSeriesData.results, 'tv', 'first_air_date', 'Nouvelle Série');

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
                                subtypeLabel: 'Nouvelle Saison',
                            };
                        } catch { return null; }
                    })
                );
                const validReturning = returning.filter(Boolean);

                const all = [...rawMovies, ...rawSeries, ...validReturning];
                const seen = new Set();
                const filtered = all.filter(item => {
                    if (!item.date || seen.has(item.id)) return false;
                    const d = new Date(item.date);
                    d.setHours(0, 0, 0, 0);
                    if (d < today) return false;
                    seen.add(item.id);
                    return true;
                });

                filtered.sort((a, b) => new Date(a.date) - new Date(b.date));
                setAllItems(filtered);
            } catch (e) {
                console.error('Error fetching upcoming:', e);
            } finally {
                setLoading(false);
            }
        };
        fetchAll();
    }, []);

    const { movies, newSeries, returningSeries, heroItem } = useMemo(() => {
        const movies = allItems.filter(i => i.type === 'movie');
        const newSeries = allItems.filter(i => i.type === 'tv' && i.subtypeLabel === 'Nouvelle Série');
        const returningSeries = allItems.filter(i => i.subtypeLabel === 'Nouvelle Saison');
        const hero = allItems[0] || null;
        return { movies, newSeries, returningSeries, heroItem: hero };
    }, [allItems]);

    const filtered = useMemo(() => {
        if (activeFilter === 'movies') return allItems.filter(i => i.type === 'movie');
        if (activeFilter === 'series') return allItems.filter(i => i.type === 'tv' && i.subtypeLabel !== 'Nouvelle Saison');
        if (activeFilter === 'returning') return allItems.filter(i => i.subtypeLabel === 'Nouvelle Saison');
        return allItems;
    }, [allItems, activeFilter]);

    const toggleReminder = (item) => {
        const exists = reminders.some(r => (typeof r === 'object' ? r.id === item.id : r === item.id));
        const newReminders = exists
            ? reminders.filter(r => (typeof r === 'object' ? r.id !== item.id : r !== item.id))
            : [...reminders, { id: item.id, type: item.type }];
        setReminders(newReminders);
        localStorage.setItem('ALTYFLIX_reminders', JSON.stringify(newReminders));
        window.dispatchEvent(new Event('ALTYFLIX_reminders_updated'));
        setToast(exists ? 'Rappel supprimé' : 'Rappel activé !');
        setTimeout(() => setToast(null), 3000);
    };

    const openTrailer = (item) => {
        window.open(
            `https://www.youtube.com/results?search_query=${encodeURIComponent((item?.title || '') + ' bande annonce officielle')}`,
            '_blank'
        );
    };

    const FILTERS = [
        { id: 'all', label: 'Tout', count: allItems.length },
        { id: 'movies', label: 'Films', count: movies.length },
        { id: 'series', label: 'Séries', count: newSeries.length },
        { id: 'returning', label: 'Retours', count: returningSeries.length },
    ];

    return (
        <div className="min-h-screen bg-[#0B0B0F] text-white">
            <Helmet>
                <title>Prochainement — ALTYFLIX</title>
                <meta name="description" content="Découvrez les prochaines sorties films et séries sur ALTYFLIX." />
            </Helmet>

            {/* Toast */}
            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, y: 50 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 50 }}
                        className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 bg-ALTYFLIX-primary text-white px-6 py-3 rounded-full shadow-2xl font-bold text-sm"
                    >
                        {toast}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Hero */}
            {!loading && heroItem && (
                <HeroUpcoming
                    item={heroItem}
                    isReminded={reminders.some(r => (typeof r === 'object' ? r.id === heroItem.id : r === heroItem.id))}
                    onReminder={() => toggleReminder(heroItem)}
                    onTrailer={() => openTrailer(heroItem)}
                />
            )}

            {/* Filter Tabs */}
            <div className="sticky top-[64px] z-30 bg-[#0B0B0F]/90 backdrop-blur-xl border-b border-white/5">
                <div className="flex items-center gap-1 px-[4%] md:px-[5%] py-3">
                    {FILTERS.map(f => (
                        <button
                            key={f.id}
                            onClick={() => setActiveFilter(f.id)}
                            className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${activeFilter === f.id
                                ? 'bg-white text-black shadow-lg'
                                : 'text-white/50 hover:text-white hover:bg-white/10'
                                }`}
                        >
                            {f.label}
                            {f.count > 0 && (
                                <span className={`ml-1.5 text-xs ${activeFilter === f.id ? 'text-black/60' : 'text-white/30'}`}>
                                    {f.count}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content */}
            <div className="pb-24 pt-10">
                {loading ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 px-[4%] md:px-[5%]">
                        {Array.from({ length: 12 }).map((_, i) => (
                            <div key={i} className="animate-pulse rounded-2xl overflow-hidden">
                                <div className="aspect-[2/3] bg-white/5" />
                                <div className="p-3 space-y-2">
                                    <div className="h-3 bg-white/5 rounded w-2/3" />
                                    <div className="h-3 bg-white/5 rounded w-1/2" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : allItems.length === 0 ? (
                    <div className="text-center py-24 text-white/30">
                        <svg className="w-16 h-16 text-white/20 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
                        </svg>
                        <p className="text-xl font-bold">Aucune sortie prévue pour le moment</p>
                    </div>
                ) : activeFilter !== 'all' ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 px-[4%] md:px-[5%]">
                        {filtered.map((item, i) => (
                            <UpcomingCard
                                key={`${item.type}-${item.id}`}
                                item={item}
                                index={i}
                                isReminded={reminders.some(r => (typeof r === 'object' ? r.id === item.id : r === item.id))}
                                onReminder={toggleReminder}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="space-y-14">
                        <CategorySection
                            title="Films à venir"
                            icon={
                                <svg className="w-5 h-5 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
                                </svg>
                            }
                            items={movies}
                            reminders={reminders}
                            onReminder={toggleReminder}
                        />
                        <CategorySection
                            title="Nouvelles Séries"
                            icon={
                                <svg className="w-5 h-5 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                            }
                            items={newSeries}
                            reminders={reminders}
                            onReminder={toggleReminder}
                        />
                        <CategorySection
                            title="Retour de Saisons"
                            icon={
                                <svg className="w-5 h-5 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89H18v3.54" />
                                </svg>
                            }
                            items={returningSeries}
                            reminders={reminders}
                            onReminder={toggleReminder}
                        />
                    </div>
                )}
            </div>
        </div>
    );
};

export default UpcomingPage;
