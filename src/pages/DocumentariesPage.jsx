import { useCallback } from 'react';
import tmdb from '../services/tmdb';
import { GENRES } from '../config/constants';
import { useProfile } from '../contexts/ProfileContext';
import BrowseLayout from '../components/ui/BrowseLayout';
import useGenreBrowse from '../hooks/useGenreBrowse';

// The "genres" here are the two formats a documentary comes in.
const FORMATS = [
    { id: 'movie', name: 'Films documentaires' },
    { id: 'tv', name: 'Séries documentaires' },
];

const BLOCKED_KID = [GENRES.HORROR, GENRES.CRIME, GENRES.THRILLER, GENRES.WAR, 10768];

// Only real documentaries that have artwork make it to the page (and exclude adult/crime/war docs in Kids Mode).
const onlyDocs = (items, isKid = false) => (items || []).filter(item =>
    item.poster_path &&
    Array.isArray(item.genre_ids) &&
    item.genre_ids.includes(GENRES.DOCUMENTARY) &&
    (!isKid || (!item.adult && !item.genre_ids.some(g => BLOCKED_KID.includes(g))))
);

const DocumentariesPage = () => {
    const { currentProfile } = useProfile();
    const isKid = Boolean(currentProfile?.isKid);

    const loadShelves = useCallback(() => {
        const docs = (settled) => (settled.status === 'fulfilled' ? onlyDocs(settled.value.results, isKid) : []);
        return {
            first: tmdb.getContentByGenre('movie', GENRES.DOCUMENTARY, 1).then(data => [
                { title: 'Documentaires populaires', content: onlyDocs(data.results, isKid), ranked: true },
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
        };
    }, [isKid]);

    const fetchGenrePage = useCallback(async (format, page) => {
        const data = await tmdb.getContentByGenre(format.id, GENRES.DOCUMENTARY, page);
        return { ...data, results: onlyDocs(data.results, isKid) };
    }, [isKid]);

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
