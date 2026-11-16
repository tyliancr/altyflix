import tmdb from '../services/tmdb';
import { GENRES, GENRE_NAMES } from '../config/constants';
import BrowseLayout from '../components/ui/BrowseLayout';
import useGenreBrowse from '../hooks/useGenreBrowse';

const MOVIE_GENRES = Object.values(GENRES)
    .map(id => ({ id, name: GENRE_NAMES[id] }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));

const results = (settled) => (settled.status === 'fulfilled' ? settled.value.results || [] : []);

const loadShelves = () => ({
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
});

const fetchGenrePage = (genre, page) => tmdb.getContentByGenre('movie', genre.id, page);

const FilmsPage = () => {
    const browse = useGenreBrowse({ genres: MOVIE_GENRES, loadShelves, fetchGenrePage });

    return (
        <BrowseLayout
            title="Films"
            allLabel="Tous les films"
            genres={MOVIE_GENRES}
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
