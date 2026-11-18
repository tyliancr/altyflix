import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

const uniqueById = (items) => Array.from(new Map(items.map(item => [item.id, item])).values());

/**
 * State for a browse page (Films, Séries, Documentaires).
 *
 * Without a genre it shows shelves: `loadShelves()` returns
 * `{ first, rest }`, two promises of shelf lists, so the page paints as soon
 * as the first shelf arrives. With `?genre=` it shows a paginated grid fed by
 * `fetchGenrePage(genre, page)`.
 */
export default function useGenreBrowse({ genres, loadShelves, fetchGenrePage, genreTitle }) {
    const [searchParams, setSearchParams] = useSearchParams();
    const genreParam = searchParams.get('genre');
    const selectedGenre = useMemo(
        () => genres.find(g => String(g.id) === String(genreParam)) || null,
        [genres, genreParam]
    );

    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const [shelves, setShelves] = useState([]);
    const [gridItems, setGridItems] = useState([]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [loadingMore, setLoadingMore] = useState(false);

    // Loaders are passed inline by pages; keep the latest without retriggering the effect.
    const loaders = useRef({ loadShelves, fetchGenrePage });
    loaders.current = { loadShelves, fetchGenrePage };
    const genreVersionRef = useRef(0);

    useEffect(() => {
        let active = true;
        genreVersionRef.current += 1;
        setLoading(true);
        setLoadingMore(false);
        setFailed(false);
        setShelves([]);
        setGridItems([]);
        setPage(1);
        setTotalPages(1);

        (async () => {
            try {
                if (selectedGenre) {
                    const data = await loaders.current.fetchGenrePage(selectedGenre, 1);
                    if (!active) return;
                    setGridItems(uniqueById(data.results || []));
                    setTotalPages(Math.min(data.total_pages || 1, 500));
                    setLoading(false);
                } else {
                    const { first, rest } = loaders.current.loadShelves();
                    const firstShelves = (await first).filter(s => s.content?.length);
                    if (!active) return;
                    setShelves(firstShelves);
                    setLoading(false);
                    try {
                        const more = (await rest).filter(s => s.content?.length);
                        if (active) setShelves([...firstShelves, ...more]);
                    } catch (restError) {
                        console.warn('Error loading secondary shelves:', restError);
                    }
                }
            } catch (error) {
                if (!active) return;
                console.error('Error loading catalogue:', error);
                setFailed(true);
                setLoading(false);
            }
        })();
        return () => { active = false; };
    }, [selectedGenre, attempt, loadShelves, fetchGenrePage]);

    const loadMore = useCallback(async () => {
        if (!selectedGenre || loadingMore || page >= totalPages) return;
        const version = genreVersionRef.current;
        setLoadingMore(true);
        try {
            const data = await loaders.current.fetchGenrePage(selectedGenre, page + 1);
            if (version !== genreVersionRef.current) return;
            setGridItems(prev => uniqueById([...prev, ...(data.results || [])]));
            setPage(prev => prev + 1);
        } catch (error) {
            if (version !== genreVersionRef.current) return;
            console.error('Error loading more titles:', error);
        } finally {
            if (version === genreVersionRef.current) setLoadingMore(false);
        }
    }, [selectedGenre, loadingMore, page, totalPages]);

    const selectGenre = useCallback((genre) => {
        setSearchParams(genre ? { genre: String(genre.id) } : {});
    }, [setSearchParams]);

    const heroItems = useMemo(() => {
        const source = selectedGenre ? gridItems : (shelves[0]?.content || []);
        return source.filter(item => item.backdrop_path).slice(0, selectedGenre ? 1 : 5);
    }, [selectedGenre, gridItems, shelves]);

    const grid = selectedGenre ? {
        title: genreTitle ? genreTitle(selectedGenre) : selectedGenre.name,
        items: gridItems,
        canLoadMore: page < totalPages,
        loadingMore,
        onLoadMore: loadMore,
    } : null;

    return {
        selectedGenre,
        selectGenre,
        loading,
        failed,
        retry: () => setAttempt(n => n + 1),
        heroItems,
        shelves,
        grid,
    };
}
