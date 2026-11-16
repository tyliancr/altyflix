import { useState } from 'react';
import { useProfile } from '../contexts/ProfileContext';
import { usePlayer } from '../contexts/PlayerContext';
import { Helmet } from 'react-helmet-async';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

const POSTER_BASE = 'https://image.tmdb.org/t/p/w342';

// Single card with remove on hover
const ListCard = ({ item, onRemove, index }) => {
    const navigate = useNavigate();
    const { play } = usePlayer();
    const [hovered, setHovered] = useState(false);
    const [removing, setRemoving] = useState(false);

    const contentId = item.id || item.contentId;
    const title = item.title || item.name;
    const isTV = item.type === 'tv' || item.media_type === 'tv' || !!item.first_air_date || !!item.number_of_seasons;
    const path = isTV ? `/tv/${contentId}` : `/movie/${contentId}`;
    const poster = item.poster_path ? `${POSTER_BASE}${item.poster_path}` : null;
    const year = (item.release_date || item.first_air_date || '').slice(0, 4);

    const handleRemove = async (e) => {
        e.stopPropagation();
        setRemoving(true);
        await onRemove(contentId);
    };

    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.88, y: -10 }}
            transition={{ delay: index * 0.04, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="relative cursor-pointer select-none"
            style={{ width: 'clamp(130px, 14vw, 220px)' }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onClick={() => navigate(path)}
        >
            {/* Poster */}
            <div className="relative rounded-2xl overflow-hidden aspect-[2/3] bg-[#1a1a22] border border-white/10 hover:border-white/30 shadow-[0_10px_30px_rgba(0,0,0,0.6)] hover:shadow-[0_16px_40px_rgba(229,9,20,0.25)] transition-all duration-300 mb-2.5">
                {poster ? (
                    <img
                        src={poster}
                        alt={title}
                        className={`w-full h-full object-cover transition-all duration-500 ${hovered ? 'scale-110 brightness-50' : 'scale-100 brightness-100'}`}
                        loading="lazy"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/20">
                        <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M4 4h16v16H4V4zm2 2v12h12V6H6z" />
                        </svg>
                    </div>
                )}

                {/* Hover overlay */}
                <AnimatePresence>
                    {hovered && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-3"
                        >
                            {/* Play button */}
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    play(item);
                                }}
                                aria-label={`Lire ${title}`}
                                className="w-12 h-12 bg-white hover:bg-[#E50914] text-black hover:text-white rounded-full flex items-center justify-center shadow-2xl transition-all duration-200 hover:scale-110 active:scale-95 group/play"
                            >
                                <svg className="w-5 h-5 ml-0.5 fill-current" viewBox="0 0 24 24">
                                    <path d="M8 5v14l11-7z" />
                                </svg>
                            </button>

                            {/* Remove button */}
                            <button
                                onClick={handleRemove}
                                disabled={removing}
                                className="text-xs font-semibold text-white/80 hover:text-red-400 transition-colors flex items-center gap-1 bg-black/50 px-3 py-1.5 rounded-full backdrop-blur-sm"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                                Retirer
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* TV badge */}
                {isTV && (
                    <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm text-white text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">
                        Série
                    </div>
                )}
            </div>

            {/* Info */}
            <p className="text-white text-xs font-semibold line-clamp-1 px-0.5">{title}</p>
            {year && <p className="text-white/40 text-[11px] px-0.5">{year}</p>}
        </motion.div>
    );
};

// ── Main Page ──────────────────────────────────────────
const MyList = () => {
    const { myList, removeFromMyList } = useProfile();
    const [filter, setFilter] = useState('all'); // 'all' | 'movie' | 'tv'

    const filtered = myList.filter(item => {
        if (filter === 'all') return true;
        const isTV = item.type === 'tv' || item.first_air_date || item.name;
        return filter === 'tv' ? isTV : !isTV;
    });

    const filters = [
        { id: 'all', label: 'Tout' },
        { id: 'movie', label: 'Films' },
        { id: 'tv', label: 'Séries' },
    ];

    return (
        <div className="min-h-screen bg-[#060608] pb-24">
            <Helmet>
                <title>Ma Liste - ALTYFLIX</title>
                <meta name="robots" content="noindex" />
            </Helmet>

            <div className="pt-28 px-[4%] md:px-[5%]">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="mb-8"
                >
                    <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight mb-1">
                        Ma Liste
                    </h1>
                    <p className="text-[#E50914] font-semibold text-base">
                        {myList.length} titre{myList.length !== 1 ? 's' : ''}
                    </p>
                </motion.div>

                {/* Filter pills */}
                {myList.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.1 }}
                        className="flex gap-2 mb-8"
                    >
                        {filters.map(f => (
                            <button
                                key={f.id}
                                onClick={() => setFilter(f.id)}
                                className={`px-5 py-2 rounded-full text-sm font-semibold transition-all duration-300 ${
                                    filter === f.id
                                        ? 'bg-white text-black'
                                        : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
                                }`}
                            >
                                {f.label}
                            </button>
                        ))}
                    </motion.div>
                )}

                {/* Grid */}
                <AnimatePresence mode="popLayout">
                    {filtered.length > 0 ? (
                        <motion.div
                            layout
                            className="flex flex-wrap gap-4 md:gap-x-5 md:gap-y-10"
                        >
                            {filtered.map((item, index) => (
                                <ListCard
                                    key={item.id || item.contentId}
                                    item={item}
                                    index={index}
                                    onRemove={removeFromMyList}
                                />
                            ))}
                        </motion.div>
                    ) : myList.length === 0 ? (
                        /* Totally empty */
                        <motion.div
                            initial={{ opacity: 0, scale: 0.97 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="text-center py-24"
                        >
                            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-white/5 flex items-center justify-center">
                                <svg className="w-10 h-10 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                </svg>
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-2">Votre liste est vide</h2>
                            <p className="text-white/40 text-sm max-w-xs mx-auto">
                                Ajoutez des films et séries avec le bouton <strong className="text-white/60">+ Ma Liste</strong> sur chaque fiche.
                            </p>
                        </motion.div>
                    ) : (
                        /* Filter returned nothing */
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-center py-24 text-white/40"
                        >
                            Aucun contenu dans cette catégorie.
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default MyList;
