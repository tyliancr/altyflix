// Home Page Refactored for new UI
import { useState, useEffect } from 'react';
import { useProfile } from '../contexts/ProfileContext';
import tmdb from '../services/tmdb';
import { Helmet } from 'react-helmet-async';
import HeroBanner from '../components/home/HeroBanner';
import ContentRow from '../components/home/ContentRow';

import { motion } from 'framer-motion';
import { useTranslation } from '../hooks/useTranslation';
import useRecommendations from '../hooks/useRecommendations';
import ResumeRow from '../components/home/ResumeRow';

const Home = () => {
    const { currentProfile, watchHistory } = useProfile();
    const [loading, setLoading] = useState(true);
    const [heroContent, setHeroContent] = useState([]);
    const [categories, setCategories] = useState([]);
    const { t } = useTranslation();

    // Smart recommendations hook
    const {
        recommendations: recommendedContent,
        matchScores,
        seedTitle,
    } = useRecommendations();

    const [request, setRequest] = useState(0);
    const [catalogueFailed, setCatalogueFailed] = useState(false);
    const kids = Boolean(currentProfile?.isKid || currentProfile?.name?.toLowerCase() === 'enfant');
    const profileId = currentProfile?.id;
    useEffect(() => {
        if (!profileId) return;
        let active = true;
        const loadContent = async () => {
            try {
                setLoading(true);
                setHeroContent([]);
                setCategories([]);

                // KIDS MODE LOGIC
                setCatalogueFailed(false);

                if (kids) {
                    const [
                        kidsMovies,
                        kidsSeries,
                        allKidsMovies
                    ] = await Promise.all([
                        tmdb.getKidsMovies(1),
                        tmdb.getKidsSeries(1),
                        tmdb.getKidsMovies(2)
                    ]);

                    if (!active) return;
                    const topKidsContent = kidsMovies.results?.slice(0, 5) || [];
                    setHeroContent(topKidsContent);

                    setCategories([
                        { title: 'Dessins Animés Populaires', content: kidsSeries.results || [] },
                        { title: 'Films pour toute la famille', content: kidsMovies.results || [] },
                        { title: 'Aventures Magiques', content: allKidsMovies.results || [] },
                    ]);


                    setLoading(false);
                } else {
                    // STANDARD MODE - Phase 1 (Critical initial content)
                    const phase1Results = await Promise.allSettled([
                        tmdb.getTrending(),
                        tmdb.getLatestReleasedMovies(),
                        tmdb.getLatestReleasedSeries(),
                        tmdb.getAiringTodaySeries(),
                    ]);

                    if (!active) return;
                    const getPhase1Val = (idx) => phase1Results[idx].status === 'fulfilled' ? phase1Results[idx].value : { results: [] };

                    const trendingData = getPhase1Val(0);
                    const latestMoviesData = getPhase1Val(1);
                    const latestSeriesData = getPhase1Val(2);
                    const airingTodayData = getPhase1Val(3);

                    // Set Hero Content
                    const topTrending = trendingData.results?.slice(0, 5) || [];
                    setHeroContent(topTrending);

                    // Nouveautés Strategy
                    const latestMovies = latestMoviesData.results || [];
                    const newShows = latestSeriesData.results || [];
                    const airingToday = (airingTodayData.results || []).map(item => ({
                        ...item,
                        effectiveDate: new Date().toISOString()
                    }));

                    const allRecentContent = [
                        ...latestMovies.map(m => ({ ...m, type: 'movie', sortDate: m.release_date })),
                        ...newShows.map(s => ({ ...s, type: 'tv', sortDate: s.first_air_date })),
                        ...airingToday.map(s => ({ ...s, type: 'tv', sortDate: s.effectiveDate }))
                    ].sort((a, b) => new Date(b.sortDate) - new Date(a.sortDate));

                    const uniqueContent = Array.from(new Map(allRecentContent.map(item => [item.id, item])).values())
                        .sort((a, b) => new Date(b.sortDate) - new Date(a.sortDate));

                    const newReleasesList = uniqueContent.slice(0, 20);

                    // Initial Categories (Trending + New Releases)
                    const initialCategories = [
                        { title: t('home.trending'), content: trendingData.results || [], ranked: true },
                        { title: t('home.newReleases'), content: newReleasesList }
                    ];
                    setCategories(initialCategories);

                    // First Paint
                    setLoading(false);

                    // Phase 2 - Background Content Fetching
                    Promise.allSettled([
                        tmdb.getPopularMovies(),
                        tmdb.getPopularSeries(),
                        tmdb.getTopRatedMovies(),
                        tmdb.getTopRatedSeries(),
                        tmdb.getNowPlayingMovies(),
                        tmdb.getUpcomingMovies(),
                        tmdb.getOnTheAirSeries(),
                        tmdb.getContentByGenre('movie', 28), // Action Movies
                        tmdb.getContentByGenre('movie', 878), // Sci-Fi Movies
                        tmdb.getContentByGenre('tv', 10759), // Action Series
                        tmdb.getContentByGenre('tv', 10765), // Sci-Fi Series
                        tmdb.getContentByGenre('tv', 16), // Animation Series
                    ]).then((phase2Results) => {
                        if (!active) return;
                        const getPhase2Val = (idx) => phase2Results[idx].status === 'fulfilled' ? phase2Results[idx].value : { results: [] };

                        const popularMoviesData = getPhase2Val(0);
                        const popularSeriesData = getPhase2Val(1);
                        const topRatedMoviesData = getPhase2Val(2);
                        const topRatedSeriesData = getPhase2Val(3);
                        const nowPlayingData = getPhase2Val(4);
                        const upcomingMoviesData = getPhase2Val(5);
                        const onTheAirData = getPhase2Val(6);
                        const actionMoviesData = getPhase2Val(7);
                        const sciFiMoviesData = getPhase2Val(8);
                        const actionSeriesData = getPhase2Val(9);
                        const sciFiSeriesData = getPhase2Val(10);
                        const animationSeriesData = getPhase2Val(11);

                        const topRatedMixed = [
                            ...(topRatedMoviesData.results || []).map(m => ({ ...m, type: 'movie' })),
                            ...(topRatedSeriesData.results || []).map(s => ({ ...s, type: 'tv' }))
                        ].sort((a, b) => b.vote_average - a.vote_average);

                        const baseCategories = [
                            { title: t('home.trending'), content: trendingData.results || [], ranked: true },
                            { title: t('home.newReleases'), content: newReleasesList },
                            { title: t('home.seriesTrending'), content: popularSeriesData.results || [] },
                            { title: t('home.seriesAction'), content: actionSeriesData.results || [] },
                            { title: t('home.seriesSciFi'), content: sciFiSeriesData.results || [] },
                            { title: t('home.seriesAnimation'), content: animationSeriesData.results || [] },
                            { title: t('home.seriesAiring'), content: onTheAirData.results || [] },
                            { title: t('home.moviesPlaying'), content: nowPlayingData.results || [] },
                            { title: t('home.moviesPopular'), content: popularMoviesData.results || [] },
                            { title: t('home.moviesAction'), content: actionMoviesData.results || [] },
                            { title: t('home.moviesSciFi'), content: sciFiMoviesData.results || [] },
                            { title: t('home.topRated'), content: topRatedMixed.slice(0, 20) },
                            { title: t('home.upcoming'), content: upcomingMoviesData.results || [] }
                        ];

                        setCatalogueFailed(!baseCategories.some(row => row.content.length) && [...phase1Results, ...phase2Results].some(result => result.status === 'rejected'));
                        setCategories(baseCategories);
                    });
                }
            } catch (error) {
                if (!active) return;
                setCatalogueFailed(true);
                console.error('Error loading catalogue:', error);
                setLoading(false);
            }
        };
        loadContent();
        return () => { active = false; };
        // Titles are resolved again when the profile language changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [profileId, currentProfile?.language, kids, request]);

    if (loading) {
        return (
            <div className="min-h-screen bg-[#060608]" aria-busy="true" aria-label="Chargement du catalogue">
                <HeroBanner movies={[]} />
                <div className="relative -mt-[3vh] sm:-mt-[10vh] z-10 space-y-10">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="px-[4%] md:px-[5%]">
                            <div className="skeleton h-5 w-44 mb-4" />
                            <div className="flex gap-2.5 md:gap-3.5 lg:gap-4 overflow-hidden">
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(j => (
                                    <div key={j} className="skeleton flex-none !rounded-xl" style={{ width: 'clamp(118px, 17vw, 208px)', aspectRatio: '2 / 3' }} />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#060608] pb-24 md:pb-8">
            <Helmet>
                <title>Accueil - ALTYFLIX</title>
                <meta name="description" content="Découvrez les dernières sorties films et séries sur ALTYFLIX." />
            </Helmet>

            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
            >
                {heroContent.length > 0 && <HeroBanner movies={heroContent} rankLabel={kids ? undefined : 'des tendances'} />}
            </motion.div>

            {/* Netflix carousels overlap the hero bottom */}
            <div className={`relative z-20 space-y-6 sm:space-y-8 ${heroContent.length ? '-mt-[3vh] sm:-mt-[10vh]' : 'pt-24'}`}>
                {/* Reprendre la lecture */}
                {catalogueFailed && (
                    <div role="status" className="mx-[4%] md:mx-[5%] flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-5">
                        <div>
                            <p className="font-semibold text-white">Le catalogue est temporairement indisponible.</p>
                            <p className="mt-0.5 text-sm text-white/55">Vérifiez votre connexion, puis réessayez.</p>
                        </div>
                        <button type="button" className="h-10 rounded-lg bg-white px-5 text-sm font-bold text-black transition-colors hover:bg-white/85" onClick={() => setRequest(n => n + 1)}>Réessayer</button>
                    </div>
                )}
                <ResumeRow history={watchHistory} title={t('home.resume')} />

                {/* Recommandé pour vous */}
                {recommendedContent.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.05, duration: 0.35, ease: "easeOut" }}
                    >
                        <ContentRow
                            title={t('home.recommended')}
                            subtitle={seedTitle ? `${t('home.recommendedBecause')} ${seedTitle}` : undefined}
                            items={recommendedContent}
                            isTV={false}
                            showMatchScore={true}
                            matchScores={matchScores}
                        />
                    </motion.div>
                )}

                {/* Dynamic Categories with smooth stagger */}
                {categories.map((category, index) => (
                    <motion.div
                        key={`cat-${index}`}
                        initial={{ opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ 
                            delay: Math.min(index * 0.05 + 0.1, 0.45), 
                            duration: 0.35, 
                            ease: "easeOut" 
                        }}
                    >
                        <ContentRow
                            title={category.title}
                            items={category.content}
                            ranked={Boolean(category.ranked)}
                            isTV={category.title.toLowerCase().includes('série')}
                        />
                    </motion.div>
                ))}
            </div>
        </div>
    );
};

export default Home;

