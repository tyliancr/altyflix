import { useCallback, useMemo } from 'react';
import tmdb from '../services/tmdb';
import { TV_GENRES, GENRE_NAMES } from '../config/constants';
import { useProfile } from '../contexts/ProfileContext';
import BrowseLayout from '../components/ui/BrowseLayout';
import useGenreBrowse from '../hooks/useGenreBrowse';

const ALL_SERIES_GENRES = Object.values(TV_GENRES)
    .map(id => ({ id, name: GENRE_NAMES[id] }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
const KID_SERIES_GENRES = ALL_SERIES_GENRES.filter(g => [TV_GENRES.KIDS, TV_GENRES.ANIMATION, TV_GENRES.FAMILY, TV_GENRES.COMEDY].includes(g.id));
const BLOCKED_KID = [TV_GENRES.CRIME, TV_GENRES.WAR_POLITICS, 27, 53];

const results = (settled) => (settled.status === 'fulfilled' ? settled.value.results || [] : []);
const kidFilter = (items) => (items || []).filter(i => !i.adult && !(i.genre_ids || []).some(g => BLOCKED_KID.includes(g)));

const SeriesPage = () => {
    const { currentProfile } = useProfile();
    const isKid = Boolean(currentProfile?.isKid);
    const genres = useMemo(() => (isKid ? KID_SERIES_GENRES : ALL_SERIES_GENRES), [isKid]);

    const loadShelves = useCallback(() => {
        if (isKid) {
            return {
                first: tmdb.getContentByGenre('tv', TV_GENRES.KIDS).then(kids => [
                    { title: 'Séries jeunesse populaires', content: kidFilter(kids.results), ranked: true },
                ]),
                rest: Promise.allSettled([
                    tmdb.getContentByGenre('tv', TV_GENRES.ANIMATION),
                    tmdb.getContentByGenre('tv', TV_GENRES.FAMILY),
                    tmdb.getContentByGenre('tv', TV_GENRES.COMEDY),
                ]).then(([animation, family, comedy]) => [
                    { title: 'Animation', content: kidFilter(results(animation)) },
                    { title: 'En famille', content: kidFilter(results(family)) },
                    { title: 'Comédie', content: kidFilter(results(comedy)) },
                ]),
            };
        }
        return {
            first: tmdb.getPopularSeries().then(popular => [
                { title: 'Séries populaires', content: popular.results || [], ranked: true },
            ]),
            rest: Promise.allSettled([
                tmdb.getFrenchSeries(),
                tmdb.getOnTheAirSeries(),
                tmdb.getContentByGenre('tv', TV_GENRES.ACTION_ADVENTURE),
                tmdb.getContentByGenre('tv', TV_GENRES.SCI_FI_FANTASY),
                tmdb.getContentByGenre('tv', TV_GENRES.COMEDY),
                tmdb.getContentByGenre('tv', TV_GENRES.ANIMATION),
                tmdb.getContentByGenre('tv', TV_GENRES.DOCUMENTARY),
                tmdb.getTopRatedSeries(),
            ]).then(([french, onAir, action, sciFi, comedy, animation, documentary, topRated]) => [
                { title: 'Séries Françaises & Créations Originales', content: results(french) },
                { title: 'En cours de diffusion', content: results(onAir) },
                { title: 'Action & aventure', content: results(action) },
                { title: 'Science-fiction & fantastique', content: results(sciFi) },
                { title: 'Comédie', content: results(comedy) },
                { title: 'Animation', content: results(animation) },
                { title: 'Documentaires', content: results(documentary) },
                { title: 'Les mieux notées', content: results(topRated) },
            ]),
        };
    }, [isKid]);

    const fetchGenrePage = useCallback(async (genre, page) => {
        const data = await tmdb.getContentByGenre('tv', genre.id, page);
        return isKid ? { ...data, results: kidFilter(data.results) } : data;
    }, [isKid]);

    const browse = useGenreBrowse({ genres, loadShelves, fetchGenrePage });

    return (
        <BrowseLayout
            title="Séries"
            allLabel="Toutes les séries"
            isTV
            genres={genres}
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
