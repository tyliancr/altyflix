import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getContentByGenre } from '../services/tmdb';
import { GENRES, TV_GENRES, GENRE_NAMES } from '../config/constants';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from '../hooks/useTranslation';
import { useProfile } from '../contexts/ProfileContext';
import PosterCard from '../components/ui/PosterCard';
import { PageHeader, PosterGrid, GridSkeleton, SectionTitle, EmptyState } from '../components/ui/Primitives';

// Movie genre id → the series genre that covers the same ground.
const TV_EQUIVALENT = {
    [GENRES.ACTION]: TV_GENRES.ACTION_ADVENTURE,
    [GENRES.ADVENTURE]: TV_GENRES.ACTION_ADVENTURE,
    [GENRES.SCIENCE_FICTION]: TV_GENRES.SCI_FI_FANTASY,
    [GENRES.FANTASY]: TV_GENRES.SCI_FI_FANTASY,
    [GENRES.WAR]: TV_GENRES.WAR_POLITICS,
};

const BLOCKED_KID_GENRES = [27, 80, 53, 10752, 10768];

const CategoryPage = () => {
    const { id } = useParams(); // movie genre id
    const { t } = useTranslation();
    const { currentProfile } = useProfile();
    const isKid = Boolean(currentProfile?.isKid);
    const [movies, setMovies] = useState([]);
    const [series, setSeries] = useState([]);
    const [loading, setLoading] = useState(true);

    const movieGenreId = parseInt(id, 10);
    const isValidGenreId = Number.isInteger(movieGenreId) && movieGenreId > 0 && (!isKid || !BLOCKED_KID_GENRES.includes(movieGenreId));
    const isTvOnlyGenre = isValidGenreId && Object.values(TV_GENRES).includes(movieGenreId) && !Object.values(GENRES).includes(movieGenreId);
    const genreName = (isValidGenreId && GENRE_NAMES[movieGenreId]) || 'Genre';

    useEffect(() => {
        let active = true;
        window.scrollTo(0, 0);
        if (!isValidGenreId) {
            setMovies([]);
            setSeries([]);
            setLoading(false);
            return () => { active = false; };
        }
        setLoading(true);

        const tvGenreId = TV_EQUIVALENT[movieGenreId]
            ?? (Object.values(TV_GENRES).includes(movieGenreId) ? movieGenreId : null);

        Promise.allSettled([
            isTvOnlyGenre ? Promise.resolve({ results: [] }) : getContentByGenre('movie', movieGenreId, 1),
            tvGenreId ? getContentByGenre('tv', tvGenreId, 1) : Promise.resolve({ results: [] }),
        ]).then(([moviesData, tvData]) => {
            if (!active) return;
            const filterKid = (arr) => isKid
                ? (arr || []).filter(item => !item.adult && !(item.genre_ids || []).some(g => BLOCKED_KID_GENRES.includes(g)))
                : (arr || []);
            setMovies(moviesData.status === 'fulfilled' ? filterKid(moviesData.value.results).slice(0, 14) : []);
            setSeries(tvData.status === 'fulfilled' ? filterKid(tvData.value.results).slice(0, 14) : []);
            setLoading(false);
        });
        return () => { active = false; };
    }, [movieGenreId, isValidGenreId, isTvOnlyGenre, isKid]);

    return (
        <div className="min-h-screen bg-[#060608] px-[4%] pb-12 pt-[calc(env(safe-area-inset-top,0px)+6rem)] md:px-[5%] md:pt-32">
            <Helmet>
                <title>{genreName} - ALTYFLIX</title>
            </Helmet>

            <PageHeader eyebrow="Genre" title={genreName} subtitle={t('category.fullSelection')} />

            {loading ? (
                <GridSkeleton count={14} />
            ) : movies.length === 0 && series.length === 0 ? (
                <EmptyState title="Aucun titre dans ce genre">Revenez un peu plus tard.</EmptyState>
            ) : (
                <div className="space-y-14">
                    {movies.length > 0 && (
                        <section>
                            <SectionTitle
                                action={
                                    <Link to={`/films?genre=${id}`} className="text-sm font-semibold text-white/50 transition-colors hover:text-white">
                                        {t('category.seeMore')} →
                                    </Link>
                                }
                            >
                                {t('category.popularMovies')}
                            </SectionTitle>
                            <PosterGrid>
                                {movies.map(movie => <PosterCard key={movie.id} item={movie} type="movie" />)}
                            </PosterGrid>
                        </section>
                    )}

                    {series.length > 0 && (
                        <section>
                            <SectionTitle>{t('category.recommendedSeries')}</SectionTitle>
                            <PosterGrid>
                                {series.map(show => <PosterCard key={show.id} item={show} type="tv" />)}
                            </PosterGrid>
                        </section>
                    )}
                </div>
            )}
        </div>
    );
};

export default CategoryPage;
