import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import tmdb from '../services/tmdb';
import { TV_GENRES } from '../config/constants';
import { useProfile } from '../contexts/ProfileContext';
import { Helmet } from 'react-helmet-async';
import HeroBanner from '../components/home/HeroBanner';
import ContentRow from '../components/home/ContentRow';

const SeriesPage = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const { myList } = useProfile();
    const [loading, setLoading] = useState(true);
    const [heroContent, setHeroContent] = useState(null);
    const [categories, setCategories] = useState([]);
    const [showGenreDropdown, setShowGenreDropdown] = useState(false);

    const _favoriteIds = useMemo(() => myList.map(item => item.id || item.contentId), [myList]);

    const genres = useMemo(() =>
        Object.entries(TV_GENRES).map(([name, id]) => ({ name: name.replace(/_/g, ' '), id })),
        []);

    const genreParam = searchParams.get('genre');
    const selectedGenre = useMemo(() => {
        if (!genreParam) return null;
        return genres.find(g => String(g.id) === String(genreParam)) || null;
    }, [genreParam, genres]);

    const handleSelectGenre = (genre) => {
        setShowGenreDropdown(false);
        if (genre) {
            setSearchParams({ genre: String(genre.id) });
        } else {
            setSearchParams({});
        }
    };

    useEffect(() => {
        loadPageData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedGenre]);

    const loadPageData = async () => {
        setLoading(true);
        try {
            if (selectedGenre) {
                // Phase 1: load genre series
                const data = await tmdb.getContentByGenre('tv', selectedGenre.id);
                setHeroContent(data.results[0]);
                setCategories([
                    { title: `Séries : ${selectedGenre.name}`, content: data.results }
                ]);
                setLoading(false);

                // Phase 2: load popular series in background
                tmdb.getPopularSeries().then((popularData) => {
                    setCategories(prev => [
                        ...prev,
                        { title: "Les plus populaires", content: popularData.results }
                    ]);
                });
            } else {
                // Phase 1: load popular series
                const popular = await tmdb.getPopularSeries();
                setHeroContent(popular.results[0]);
                setCategories([
                    { title: "Séries populaires", content: popular.results }
                ]);
                setLoading(false);

                // Phase 2: load the rest in background
                Promise.allSettled([
                    tmdb.getTopRatedSeries(),
                    tmdb.getOnTheAirSeries(),
                    tmdb.getContentByGenre('tv', 10759), // Action & Adventure
                    tmdb.getContentByGenre('tv', 10765), // Sci-Fi & Fantasy
                    tmdb.getContentByGenre('tv', 16), // Animation
                    tmdb.getContentByGenre('tv', 99), // Documentary
                    tmdb.getContentByGenre('tv', 35) // Comedy
                ]).then((results) => {
                    const topRated = results[0].status === 'fulfilled' ? results[0].value.results : [];
                    const onAir = results[1].status === 'fulfilled' ? results[1].value.results : [];
                    const action = results[2].status === 'fulfilled' ? results[2].value.results : [];
                    const scifi = results[3].status === 'fulfilled' ? results[3].value.results : [];
                    const animation = results[4].status === 'fulfilled' ? results[4].value.results : [];
                    const documentary = results[5].status === 'fulfilled' ? results[5].value.results : [];
                    const comedy = results[6].status === 'fulfilled' ? results[6].value.results : [];

                    setCategories(prev => [
                        ...prev,
                        { title: "Séries d'Action & Aventure", content: action },
                        { title: "Séries de Science-Fiction & Fantasy", content: scifi },
                        { title: "Séries d'Animation", content: animation },
                        { title: "Séries de Comédie", content: comedy },
                        { title: "Documentaires", content: documentary },
                        { title: "Les mieux notées", content: topRated },
                        { title: "En cours de diffusion", content: onAir }
                    ]);
                });
            }
        } catch (error) {
            console.error("Error loading SeriesPage:", error);
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#060608] pb-24">
            <Helmet>
                <title>Séries - ALTYFLIX</title>
            </Helmet>

            {/* Sub-Header with Luxury Genre Selector */}
            <div className="absolute top-[80px] left-0 right-0 z-30 px-[4%] md:px-[5%] py-4 flex items-center gap-6 pointer-events-none">
                <div className="pointer-events-auto flex items-center gap-4 sm:gap-6 flex-wrap">
                    <h1 className="text-white text-3xl sm:text-4xl font-black tracking-tight text-shadow-netflix uppercase font-sans">Séries</h1>

                    <div className="relative">
                        <button
                            onClick={() => setShowGenreDropdown(!showGenreDropdown)}
                            className="bg-black/50 backdrop-blur-2xl border border-white/20 hover:border-white/40 text-white px-5 py-2 rounded-full text-xs sm:text-sm font-bold flex items-center gap-2.5 transition-all shadow-xl hover:scale-105 active:scale-95"
                        >
                            <span>{selectedGenre ? selectedGenre.name : 'Tous les genres'}</span>
                            <svg className={`w-3.5 h-3.5 transition-transform duration-300 ${showGenreDropdown ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>

                        {showGenreDropdown && (
                            <div className="absolute top-full left-0 mt-3 w-[320px] sm:w-[360px] bg-black/85 backdrop-blur-3xl rounded-3xl p-5 gap-x-5 gap-y-2 grid grid-cols-2 z-[100] animate-fade-in shadow-[0_25px_60px_rgba(0,0,0,0.9)] border border-white/15">
                                <button
                                    onClick={() => handleSelectGenre(null)}
                                    className="text-left text-xs font-black text-[#E50914] hover:text-white transition-colors py-2 col-span-2 border-b border-white/10 mb-2 uppercase tracking-widest"
                                >
                                    Toutes les séries
                                </button>
                                {genres.map(g => (
                                    <button
                                        key={g.id}
                                        onClick={() => handleSelectGenre(g)}
                                        className={`text-left text-xs sm:text-[13px] py-1.5 truncate transition-all rounded-lg px-2 ${selectedGenre?.id === g.id ? 'text-white font-bold bg-white/10' : 'text-white/70 hover:text-white hover:bg-white/5'}`}
                                    >
                                        {g.name}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="pt-[200px] flex items-center justify-center">
                    <div className="w-12 h-12 border-4 border-red-600/30 border-t-red-600 rounded-full animate-spin"></div>
                </div>
            ) : (
                <>
                    {heroContent && <HeroBanner movie={heroContent} />}

                    <div className="relative -mt-[5vh] md:-mt-[10vh] z-20 space-y-8">
                        {categories.map((cat, i) => (
                            <ContentRow
                                key={i}
                                title={cat.title}
                                items={cat.content}
                                isTV={true}
                            />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

export default SeriesPage;
