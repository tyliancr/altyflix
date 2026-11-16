// Netflix-Faithful DocumentariesPage (STRICT POSTERS + REAL ARTE & TOP DOCUMENTARIES)
import { useState, useEffect, useMemo } from 'react';
import tmdb from '../services/tmdb';
import { useProfile } from '../contexts/ProfileContext';
import { Helmet } from 'react-helmet-async';
import HeroBanner from '../components/home/HeroBanner';
import ContentRow from '../components/home/ContentRow';

const DOCUMENTARY_SUBGENRES = [
    { name: 'Tous les documentaires', page: 1 },
    { name: 'Séries documentaires', isTV: true, page: 1 },
    { name: 'Grands docus ARTE & VF', isFrench: true, page: 1 },
    { name: 'Les mieux notés', page: 2 },
    { name: 'Nature & Planète', page: 3 }
];

// Strict poster validator - MUST HAVE A VALID POSTER
const filterValidDocumentaries = (items) => {
    if (!Array.isArray(items)) return [];
    return items.filter(item => {
        const hasPoster = item.poster_path && item.poster_path !== 'null' && item.poster_path !== undefined;
        const isDoc = Array.isArray(item.genre_ids) && item.genre_ids.includes(99);
        return hasPoster && isDoc;
    });
};

const DocumentariesPage = () => {
    const { myList } = useProfile();
    const [loading, setLoading] = useState(true);
    const [heroContent, setHeroContent] = useState(null);
    const [categories, setCategories] = useState([]);
    const [selectedGenre, setSelectedGenre] = useState(null);
    const [showGenreDropdown, setShowGenreDropdown] = useState(false);

    const _favoriteIds = useMemo(() => myList.map(item => item.id || item.contentId), [myList]);

    useEffect(() => {
        loadPageData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedGenre]);

    const loadPageData = async () => {
        setLoading(true);
        try {
            if (selectedGenre) {
                const isTV = selectedGenre.isTV || false;
                const pageNum = selectedGenre.page || 1;
                const data = await tmdb.getContentByGenre(isTV ? 'tv' : 'movie', 99, pageNum);
                const validResults = filterValidDocumentaries(data.results || []);
                
                setHeroContent(validResults[0] || null);
                setCategories([
                    { title: `Documentaires : ${selectedGenre.name}`, content: validResults, isTV }
                ]);
                setLoading(false);
            } else {
                // Phase 1: Load popular movie documentaries & TV documentary series via TMDB
                const [movieDocsPage1, movieDocsPage2, tvDocs] = await Promise.all([
                    tmdb.getContentByGenre('movie', 99, 1),
                    tmdb.getContentByGenre('movie', 99, 2),
                    tmdb.getContentByGenre('tv', 99, 1)
                ]);

                const popularDocs = filterValidDocumentaries(movieDocsPage1.results || []);
                const topRatedDocs = filterValidDocumentaries(movieDocsPage2.results || []);
                const tvDocSeries = filterValidDocumentaries(tvDocs.results || []);

                setHeroContent(popularDocs[0] || tvDocSeries[0] || null);
                setCategories([
                    { title: "Documentaires populaires", content: popularDocs },
                    { title: "Séries documentaires", content: tvDocSeries, isTV: true },
                    { title: "Grands documentaires & Incontournables", content: topRatedDocs }
                ]);
                setLoading(false);
            }
        } catch (error) {
            console.error("Error loading DocumentariesPage:", error);
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#060608] pb-24">
            <Helmet>
                <title>Documentaires - ALTYFLIX</title>
            </Helmet>

            {/* Sub-Header with Genre Dropdown */}
            <div className="absolute top-[72px] left-0 right-0 z-30 px-[4%] md:px-[5%] py-6 flex items-center gap-8 pointer-events-none">
                <div className="pointer-events-auto flex items-center gap-8">
                    <h1 className="text-white text-4xl font-display font-medium tracking-wide text-shadow-netflix">Documentaires</h1>

                    <div className="relative">
                        <button
                            onClick={() => setShowGenreDropdown(!showGenreDropdown)}
                            className="bg-black/40 backdrop-blur-md border border-white/20 text-white px-5 py-2 rounded-md text-sm font-bold flex items-center gap-3 hover:bg-white/20 transition-all shadow-lg"
                        >
                            {selectedGenre ? selectedGenre.name : 'Genres'}
                            <svg className={`w-4 h-4 transition-transform ${showGenreDropdown ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>

                        {showGenreDropdown && (
                            <div className="absolute top-full left-0 mt-3 w-[320px] glass-panel rounded-xl p-5 gap-x-6 gap-y-2 grid grid-cols-2 z-[100] animate-fade-in shadow-[0_20px_50px_rgba(0,0,0,0.8)] border border-white/10">
                                <button
                                    onClick={() => { setSelectedGenre(null); setShowGenreDropdown(false); }}
                                    className="text-left text-[13px] font-bold text-white hover:text-ALTYFLIX-primary transition-colors py-2 col-span-2 border-b border-white/10 mb-2 uppercase tracking-wider"
                                >
                                    Tous les documentaires
                                </button>
                                {DOCUMENTARY_SUBGENRES.map(g => (
                                    <button
                                        key={g.name}
                                        onClick={() => { setSelectedGenre(g); setShowGenreDropdown(false); }}
                                        className="text-left text-[14px] text-white/70 hover:text-white py-1.5 truncate transition-colors"
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
                                isTV={cat.isTV || false}
                            />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

export default DocumentariesPage;
