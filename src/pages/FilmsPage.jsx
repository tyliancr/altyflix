import { useCallback, useMemo } from 'react';
import tmdb from '../services/tmdb';
import { GENRES, GENRE_NAMES } from '../config/constants';
import { useProfile } from '../contexts/ProfileContext';
import BrowseLayout from '../components/ui/BrowseLayout';
import useGenreBrowse from '../hooks/useGenreBrowse';

const ALL_MOVIE_GENRES = Object.values(GENRES)
    .map(id => ({ id, name: GENRE_NAMES[id] }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
const KID_MOVIE_GENRES = ALL_MOVIE_GENRES.filter(g => [GENRES.ANIMATION, GENRES.FAMILY, GENRES.ADVENTURE, GENRES.COMEDY, GENRES.FANTASY].includes(g.id));
const BLOCKED_KID = [GENRES.HORROR, GENRES.CRIME, GENRES.THRILLER, GENRES.WAR];

const results = (settled) => (settled.status === 'fulfilled' ? settled.value.results || [] : []);
const kidFilter = (items) => (items || []).filter(i => !i.adult && !(i.genre_ids || []).some(g => BLOCKED_KID.includes(g)));

const FilmsPage = () => {
    const { currentProfile } = useProfile();
    const isKid = Boolean(currentProfile?.isKid);
    const genres = useMemo(() => (isKid ? KID_MOVIE_GENRES : ALL_MOVIE_GENRES), [isKid]);

    const loadShelves = useCallback(() => {
        if (isKid) {
            return {
                first: tmdb.getContentByGenre('movie', GENRES.ANIMATION).then(anim => [
                    { title: 'Films d’animation populaires', content: kidFilter(anim.results), ranked: true },
                ]),
                rest: Promise.allSettled([
                    tmdb.getContentByGenre('movie', GENRES.FAMILY),
                    tmdb.getContentByGenre('movie', GENRES.ADVENTURE),
                    tmdb.getContentByGenre('movie', GENRES.FANTASY),
                    tmdb.getContentByGenre('movie', GENRES.COMEDY),
                ]).then(([family, adventure, fantasy, comedy]) => [
                    { title: 'En famille', content: kidFilter(results(family)) },
                    { title: 'Aventure', content: kidFilter(results(adventure)) },
                    { title: 'Fantastique', content: kidFilter(results(fantasy)) },
                    { title: 'Comédie', content: kidFilter(results(comedy)) },
                ]),
            };
        }
        return {
            first: tmdb.getPopularMovies().then(popular => [
                { title: 'Films populaires', content: popular.results || [], ranked: true },
            ]),
            rest: Promise.allSettled([
                tmdb.getNowPlayingMovies(),
                tmdb.getTopRatedMovies(),
                tmdb.getContentByGenre('movie', GENRES.ACTION),
                tmdb.getContentByGenre('movie', GENRES.COMEDY),
                tmdb.getContentByGenre('movie', GENRES.SCIENCE_FICTION),
                tmdb.getContentByGenre('movie', GENRES.THRILLER),
                tmdb.getUpcomingMovies(),
            ]).then(([nowPlaying, topRated, action, comedy, sciFi, thriller, upcoming]) => [
                { title: 'Actuellement au cinéma', content: results(nowPlaying) },
                { title: 'Les mieux notés', content: results(topRated) },
                { title: 'Action', content: results(action) },
                { title: 'Comédie', content: results(comedy) },
                { title: 'Science-fiction', content: results(sciFi) },
                { title: 'Thriller', content: results(thriller) },
                { title: 'À venir', content: results(upcoming) },
            ]),
        };
    }, [isKid]);

    const fetchGenrePage = useCallback(async (genre, page) => {
        const data = await tmdb.getContentByGenre('movie', genre.id, page);
        return isKid ? { ...data, results: kidFilter(data.results) } : data;
    }, [isKid]);

    const browse = useGenreBrowse({ genres, loadShelves, fetchGenrePage });

    return (
        <BrowseLayout
            title="Films"
            allLabel="Tous les films"
            genres={genres}
            selectedGenre={browse.selectedGenre}
            onSelectGenre={browse.selectGenre}
            loading={browse.loading}
            failed={browse.failed}
            onRetry={browse.retry}
            heroItems={browse.heroItems}
            shelves={browse.shelves}
            grid={browse.grid && { ...browse.grid, type: 'movie' }}
        />
    );
};

export default FilmsPage;
