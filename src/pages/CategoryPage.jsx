
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getContentByGenre } from '../services/tmdb';
import { GENRES, TV_GENRES } from '../config/constants';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import MovieCard from '../components/home/MovieCard';
import { useTranslation } from '../hooks/useTranslation';

const CategoryPage = () => {
    const { id } = useParams(); // This is the MOVIE genre ID
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [movies, setMovies] = useState([]);
    const [series, setSeries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [genreName, setGenreName] = useState('');

    useEffect(() => {
        const loadCategoryContent = async () => {
            setLoading(true);
            window.scrollTo(0, 0);

            try {
                const movieGenreId = parseInt(id);

                // 1. Get Genre Name from Movie ID
                const nameEntry = Object.entries(GENRES).find(([_key, val]) => val === movieGenreId);
                const name = nameEntry ? nameEntry[0] : 'Genre';
                setGenreName(name);

                // 2. Map to TV Genre ID
                let tvGenreId = null;

                // Smart Mapping: Movie ID -> TV ID
                if (movieGenreId === GENRES.ACTION) tvGenreId = TV_GENRES.ACTION_ADVENTURE;
                else if (movieGenreId === GENRES.ADVENTURE) tvGenreId = TV_GENRES.ACTION_ADVENTURE;
                else if (movieGenreId === GENRES.SCIENCE_FICTION) tvGenreId = TV_GENRES.SCI_FI_FANTASY;
                else if (movieGenreId === GENRES.FANTASY) tvGenreId = TV_GENRES.SCI_FI_FANTASY;
                else if (movieGenreId === GENRES.WAR) tvGenreId = TV_GENRES.WAR_POLITICS;
                else {
                    // Try to find exact match (Comedy=35, Animation=16, etc.)
                    const hasDirectMatch = Object.values(TV_GENRES).includes(movieGenreId);
                    if (hasDirectMatch) tvGenreId = movieGenreId;
                }

                // 3. Fetch Movies & Series in parallel
                const moviesPromise = getContentByGenre('movie', movieGenreId, 1);
                const tvPromise = tvGenreId 
                    ? getContentByGenre('tv', tvGenreId, 1) 
                    : Promise.resolve({ results: [] });

                const [moviesData, tvData] = await Promise.all([moviesPromise, tvPromise]);

                setMovies(moviesData.results?.slice(0, 12) || []);
                setSeries(tvData.results?.slice(0, 12) || []);

            } catch (error) {
                console.error("Error loading category:", error);
            } finally {
                setLoading(false);
            }
        };

        loadCategoryContent();
    }, [id]);

    return (
        <div className="min-h-screen bg-ALTYFLIX-darker">
            <Helmet>
                <title>{genreName} - ALTYFLIX</title>
            </Helmet>

            <div className="pt-24 pb-12 px-[4%] md:px-[5%]">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                >
                    <header className="mb-10 text-center md:text-left">
                        <h1 className="text-4xl md:text-5xl font-black mb-2 text-white uppercase tracking-tight">
                            {genreName.replace(/_/g, ' ')}
                        </h1>
                        <p className="text-xl text-ALTYFLIX-primary font-medium">
                            {t('category.fullSelection')}
                        </p>
                    </header>

                    {loading ? (
                        <div className="flex justify-center h-64 items-center">
                            <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-ALTYFLIX-primary"></div>
                        </div>
                    ) : (
                        <div className="space-y-16">
                            {/* Movies Section */}
                            <section>
                                <div className="flex items-center justify-between mb-6">
                                    <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                                        <span className="w-1.5 h-8 bg-ALTYFLIX-primary rounded-full"></span>
                                        {t('category.popularMovies')}
                                    </h2>
                                    <button
                                        onClick={() => navigate(`/films?genre=${id}`)}
                                        className="text-sm font-medium text-white/50 hover:text-white transition-colors uppercase tracking-wider"
                                    >
                                        {t('category.seeMore')}
                                    </button>
                                </div>
                                <div className="flex flex-wrap gap-4 md:gap-y-12">
                                    {movies.map(movie => (
                                        <div
                                            key={movie.id}
                                            className="flex-none transition-all duration-300"
                                            style={{ width: 'clamp(140px, 15vw, 240px)' }}
                                        >
                                            <MovieCard content={movie} portrait={true} />
                                        </div>
                                    ))}
                                </div>
                            </section>

                            {/* Series Section */}
                            {series.length > 0 && (
                                <section>
                                    <div className="flex items-center justify-between mb-6">
                                        <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                                            <span className="w-1.5 h-8 bg-blue-500 rounded-full"></span>
                                            {t('category.recommendedSeries')}
                                        </h2>
                                    </div>
                                    <div className="flex flex-wrap gap-4 md:gap-y-12">
                                        {series.map(show => (
                                            <div
                                                key={show.id}
                                                className="flex-none transition-all duration-300"
                                                style={{ width: 'clamp(140px, 15vw, 240px)' }}
                                            >
                                                <MovieCard content={show} portrait={true} contentType="tv" />
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            )}
                        </div>
                    )}
                </motion.div>
            </div>
        </div>
    );
};

export default CategoryPage;
