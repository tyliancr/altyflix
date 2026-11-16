import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getPersonDetails } from '../services/tmdb';
import { getPosterUrl } from '../utils/helpers';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import MovieCard from '../components/home/MovieCard';
import { useTranslation } from '../hooks/useTranslation';

const LOCALE_MAP = { fr: 'fr-FR', en: 'en-US', es: 'es-ES', de: 'de-DE', it: 'it-IT' };

const PersonPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { t, language } = useTranslation();
    const [person, setPerson] = useState(null);
    const [loading, setLoading] = useState(true);
    const locale = LOCALE_MAP[language] || 'fr-FR';

    // Filters and sorting states
    const [activeTab, setActiveTab] = useState('all'); // 'all', 'movie', 'tv'
    const [sortBy, setSortBy] = useState('popularity'); // 'popularity', 'date-desc', 'date-asc'
    const [visibleCount, setVisibleCount] = useState(12);

    useEffect(() => {
        setVisibleCount(12);
    }, [activeTab, sortBy]);

    useEffect(() => {
        const fetchPerson = async () => {
            try {
                setLoading(true);
                window.scrollTo(0, 0);
                const data = await getPersonDetails(id);
                setPerson(data);
            } catch (error) {
                console.error("Failed to fetch person", error);
            } finally {
                setLoading(false);
            }
        };
        fetchPerson();
    }, [id]);

    const combinedCredits = useMemo(() => {
        if (!person) return [];

        const rawMovieCredits = [
            ...(person.movie_credits?.cast || []),
            ...(person.movie_credits?.crew || [])
        ];
        const rawTvCredits = [
            ...(person.tv_credits?.cast || []),
            ...(person.tv_credits?.crew || [])
        ];

        const movieCredits = rawMovieCredits.map(item => ({ ...item, media_type: 'movie' }));
        const tvCredits = rawTvCredits.map(item => ({ ...item, media_type: 'tv' }));
        const list = [...movieCredits, ...tvCredits];

        const uniqueList = [];
        const seenIds = new Set();
        for (const item of list) {
            if (item.poster_path && !seenIds.has(item.id)) {
                seenIds.add(item.id);
                uniqueList.push(item);
            }
        }

        let filtered = uniqueList;
        if (activeTab !== 'all') {
            filtered = uniqueList.filter(item => item.media_type === activeTab);
        }

        if (sortBy === 'popularity') {
            filtered.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
        } else if (sortBy === 'date-desc') {
            filtered.sort((a, b) => {
                const dateA = new Date(a.release_date || a.first_air_date || '1900-01-01');
                const dateB = new Date(b.release_date || b.first_air_date || '1900-01-01');
                return dateB - dateA;
            });
        } else if (sortBy === 'date-asc') {
            filtered.sort((a, b) => {
                const dateA = new Date(a.release_date || a.first_air_date || '1900-01-01');
                const dateB = new Date(b.release_date || b.first_air_date || '1900-01-01');
                return dateA - dateB;
            });
        }

        return filtered;
    }, [person, activeTab, sortBy]);

    if (loading) {
        return (
            <div className="min-h-screen bg-[#141414] pt-24 px-[4%]">
                <div className="animate-pulse flex flex-col md:flex-row gap-8">
                    <div className="w-48 md:w-64 h-72 md:h-96 bg-[#2f2f2f] rounded"></div>
                    <div className="flex-1 space-y-4">
                        <div className="h-10 bg-[#2f2f2f] rounded w-1/3"></div>
                        <div className="h-4 bg-[#2f2f2f] rounded w-full"></div>
                        <div className="h-4 bg-[#2f2f2f] rounded w-5/6"></div>
                    </div>
                </div>
            </div>
        );
    }

    if (!person) {
        return (
            <div className="min-h-screen bg-[#141414] flex items-center justify-center">
                <div className="text-center">
                    <p className="text-white/50 text-xl mb-4">{t('person.notFound')}</p>
                    <button onClick={() => navigate(-1)} className="text-white/70 hover:text-white underline">{t('person.back')}</button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#141414] pb-24 text-white">
            <Helmet>
                <title>{person.name} - ALTYFLIX</title>
                <meta name="description" content={person.biography?.substring(0, 160) || `${t('person.discover')} ${person.name}`} />
            </Helmet>

            <div className="pt-24 px-[4%] max-w-7xl mx-auto">
                <button
                    onClick={() => navigate(-1)}
                    className="mb-8 flex items-center gap-2 text-white/50 hover:text-white transition-colors text-sm font-medium"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    {t('person.back')}
                </button>

                <div className="flex flex-col md:flex-row gap-8 md:gap-12 mb-16">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex-shrink-0 w-48 md:w-72 mx-auto md:mx-0"
                    >
                        <div className="aspect-[2/3] rounded-lg overflow-hidden bg-[#2f2f2f] shadow-2xl relative">
                            {person.profile_path ? (
                                <img
                                    src={getPosterUrl(person.profile_path, 'h632')}
                                    alt={person.name}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <svg className="w-20 h-20 text-white/20" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M12 12c2.67 0 8 1.34 8 4v2H4v-2c0-2.66 5.33-4 8-4zm0-2a4 4 0 100-8 4 4 0 000 8z" />
                                    </svg>
                                </div>
                            )}
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 }}
                        className="flex-1"
                    >
                        <h1 className="text-4xl md:text-6xl font-black mb-4 font-display uppercase tracking-tighter">
                            {person.name}
                        </h1>

                        <div className="flex flex-wrap gap-4 text-sm text-white/60 mb-6 font-medium">
                            {person.known_for_department && (
                                <span className="px-2 py-1 bg-white/10 rounded">{person.known_for_department}</span>
                            )}
                            {person.birthday && (
                                <span>{t('person.born')} {new Date(person.birthday).toLocaleDateString(locale)}</span>
                            )}
                            {person.place_of_birth && (
                                <span>{t('person.place')} {person.place_of_birth}</span>
                            )}
                        </div>

                        {person.biography && (
                            <div className="text-white/80 leading-relaxed space-y-4">
                                <h3 className="text-white font-semibold text-xl mb-2">{t('person.biography')}</h3>
                                <p className="whitespace-pre-line text-sm md:text-base">
                                    {person.biography}
                                </p>
                            </div>
                        )}
                    </motion.div>
                </div>

                {/* Filmography Section */}
                <div className="mt-16 border-t border-white/10 pt-10 px-[4%] md:px-0 select-none animate-fade-in">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                        <div>
                            <h2 className="text-2xl md:text-3xl font-black font-display uppercase tracking-tight text-white flex items-center gap-3">
                                <span className="w-1.5 h-8 bg-[#E50914] rounded-full"></span>
                                {t('person.filmography')}
                            </h2>
                            <p className="text-white/40 text-xs font-semibold uppercase tracking-wider mt-1">
                                {combinedCredits.length} {combinedCredits.length > 1 ? 'titres' : 'titre'}
                            </p>
                        </div>

                        {/* Controls: Tabs & Sort */}
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                            {/* Tabs */}
                            <div className="flex bg-white/5 border border-white/10 rounded-full p-1 self-start sm:self-auto">
                                {[
                                    { id: 'all', label: t('person.all') },
                                    { id: 'movie', label: t('person.movies') },
                                    { id: 'tv', label: t('person.series') }
                                ].map(tab => (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all duration-300 ${
                                            activeTab === tab.id
                                                ? 'bg-white text-black shadow-md scale-105'
                                                : 'text-white/60 hover:text-white'
                                        }`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            {/* Sort Dropdown */}
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-white/40 font-bold uppercase tracking-wider whitespace-nowrap">
                                    {t('person.sortBy')}
                                </span>
                                <select
                                    value={sortBy}
                                    onChange={(e) => setSortBy(e.target.value)}
                                    className="bg-black/50 border border-white/20 text-white text-xs font-bold uppercase tracking-wider px-3.5 py-2 rounded-xl cursor-pointer hover:border-white/40 transition-colors focus:outline-none focus:border-[#E50914]"
                                >
                                    <option value="popularity">{t('person.popularity')}</option>
                                    <option value="date-desc">{t('person.releaseDateDesc')}</option>
                                    <option value="date-asc">{t('person.releaseDateAsc')}</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Grid */}
                    {combinedCredits.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6 mt-6">
                            {combinedCredits.slice(0, visibleCount).map((item) => (
                                <div
                                    key={`${item.media_type}-${item.id}`}
                                    className="transition-all duration-300 hover:scale-[1.03]"
                                >
                                    <MovieCard
                                        content={item}
                                        portrait={true}
                                        contentType={item.media_type}
                                    />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-16 text-white/40 bg-white/5 rounded-2xl border border-white/5">
                            <p className="text-base font-semibold">Aucun titre disponible dans cette catégorie.</p>
                        </div>
                    )}

                    {/* Show More Button */}
                    {combinedCredits.length > visibleCount && (
                        <div className="flex justify-center mt-12">
                            <button
                                type="button"
                                onClick={() => setVisibleCount(prev => prev + 12)}
                                className="px-8 py-3 bg-white/5 hover:bg-white/10 text-white font-bold rounded-full border border-white/10 hover:border-white/20 transition-all flex items-center gap-2 hover:scale-105 active:scale-95 shadow-md text-xs tracking-widest uppercase"
                            >
                                <svg className="w-4.5 h-4.5 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 13l-7 7-7-7m14-6l-7 7-7-7" />
                                </svg>
                                {t('person.showMore')}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PersonPage;
