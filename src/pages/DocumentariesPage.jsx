import tmdb from '../services/tmdb';
import { GENRES } from '../config/constants';
import BrowseLayout from '../components/ui/BrowseLayout';
import useGenreBrowse from '../hooks/useGenreBrowse';

// The "genres" here are the two formats a documentary comes in.
const FORMATS = [
    { id: 'movie', name: 'Films documentaires' },
    { id: 'tv', name: 'Séries documentaires' },
];

// Only real documentaries that have artwork make it to the page.
const onlyDocs = (items) => (items || []).filter(item =>
    item.poster_path && Array.isArray(item.genre_ids) && item.genre_ids.includes(GENRES.DOCUMENTARY)
);

const docs = (settled) => (settled.status === 'fulfilled' ? onlyDocs(settled.value.results) : []);

const loadShelves = () => ({
    first: tmdb.getContentByGenre('movie', GENRES.DOCUMENTARY, 1).then(data => [
        { title: 'Documentaires populaires', content: onlyDocs(data.results), ranked: true },
    ]),
    rest: Promise.allSettled([
        tmdb.getContentByGenre('tv', GENRES.DOCUMENTARY, 1),
        tmdb.getContentByGenre('movie', GENRES.DOCUMENTARY, 2),
        tmdb.getContentByGenre('tv', GENRES.DOCUMENTARY, 2),
    ]).then(([series, moreFilms, moreSeries]) => [
        { title: 'Séries documentaires', content: docs(series), isTV: true },
        { title: 'À découvrir', content: docs(moreFilms) },
        { title: 'Encore plus de séries', content: docs(moreSeries), isTV: true },
    ]),
});

const fetchGenrePage = async (format, page) => {
    const data = await tmdb.getContentByGenre(format.id, GENRES.DOCUMENTARY, page);
    return { ...data, results: onlyDocs(data.results) };
};

const DocumentariesPage = () => {
    const browse = useGenreBrowse({ genres: FORMATS, loadShelves, fetchGenrePage });

    return (
        <BrowseLayout
            title="Documentaires"
            allLabel="Tous les documentaires"
            genres={FORMATS}
            selectedGenre={browse.selectedGenre}
            onSelectGenre={browse.selectGenre}
            loading={browse.loading}
            failed={browse.failed}
            onRetry={browse.retry}
            heroItems={browse.heroItems}
            shelves={browse.shelves}
            grid={browse.grid && { ...browse.grid, type: browse.selectedGenre.id }}
        />
    );
};

export default DocumentariesPage;
