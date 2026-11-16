import tmdb from '../services/tmdb';
import { TV_GENRES, GENRE_NAMES } from '../config/constants';
import BrowseLayout from '../components/ui/BrowseLayout';
import useGenreBrowse from '../hooks/useGenreBrowse';

const SERIES_GENRES = Object.values(TV_GENRES)
    .map(id => ({ id, name: GENRE_NAMES[id] }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));

const results = (settled) => (settled.status === 'fulfilled' ? settled.value.results || [] : []);

const loadShelves = () => ({
    first: tmdb.getPopularSeries().then(popular => [
        { title: 'Séries populaires', content: popular.results || [], ranked: true },
    ]),
    rest: Promise.allSettled([
        tmdb.getOnTheAirSeries(),
        tmdb.getContentByGenre('tv', TV_GENRES.ACTION_ADVENTURE),
        tmdb.getContentByGenre('tv', TV_GENRES.SCI_FI_FANTASY),
        tmdb.getContentByGenre('tv', TV_GENRES.COMEDY),
        tmdb.getContentByGenre('tv', TV_GENRES.ANIMATION),
        tmdb.getContentByGenre('tv', TV_GENRES.DOCUMENTARY),
        tmdb.getTopRatedSeries(),
    ]).then(([onAir, action, sciFi, comedy, animation, documentary, topRated]) => [
        { title: 'En cours de diffusion', content: results(onAir) },
        { title: 'Action & aventure', content: results(action) },
        { title: 'Science-fiction & fantastique', content: results(sciFi) },
        { title: 'Comédie', content: results(comedy) },
        { title: 'Animation', content: results(animation) },
        { title: 'Documentaires', content: results(documentary) },
        { title: 'Les mieux notées', content: results(topRated) },
    ]),
});

const fetchGenrePage = (genre, page) => tmdb.getContentByGenre('tv', genre.id, page);

const SeriesPage = () => {
    const browse = useGenreBrowse({ genres: SERIES_GENRES, loadShelves, fetchGenrePage });

    return (
        <BrowseLayout
            title="Séries"
            allLabel="Toutes les séries"
            isTV
            genres={SERIES_GENRES}
            selectedGenre={browse.selectedGenre}
            onSelectGenre={browse.selectGenre}
            loading={browse.loading}
            failed={browse.failed}
            onRetry={browse.retry}
            heroItems={browse.heroItems}
            shelves={browse.shelves}
            grid={browse.grid && { ...browse.grid, type: 'tv' }}
        />
    );
};

export default SeriesPage;
