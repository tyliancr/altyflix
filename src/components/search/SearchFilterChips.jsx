import { GENRE_CHIPS, SEARCH_TYPES } from './SearchConstants';
import { SegmentedControl } from '../ui/Primitives';

const SORTS = [
    { id: 'popularity', label: 'Pertinence' },
    { id: 'date', label: 'Récents' },
    { id: 'rating', label: 'Mieux notés' },
];

const chip = (active) => `flex-none whitespace-nowrap rounded-full border px-4 py-2 text-[13px] font-semibold transition-colors duration-200 ${
    active
        ? 'border-white bg-white text-black'
        : 'border-white/12 bg-white/[0.04] text-white/70 hover:border-white/30 hover:text-white'
}`;

export default function SearchFilterChips({
    isSearching,
    isKid = false,
    recentSearches,
    setQuery,
    setDebouncedQuery,
    clearAllRecentSearches,
    deleteRecentSearch,
    selectedGenre,
    setSelectedGenre,
    filter,
    setFilter,
    sortBy,
    setSortBy,
    t
}) {
    if (isSearching) {
        return (
            <div className="mb-7 flex flex-wrap items-center justify-between gap-3 px-4 md:px-[5%]">
                <SegmentedControl
                    label="Type de résultat"
                    value={filter}
                    onChange={setFilter}
                    options={SEARCH_TYPES.filter(type => !isKid || type.key !== 'person').map(type => ({ id: type.key, label: t(`search.filters.${type.labelKey}`) }))}
                />
                <label className="flex items-center gap-2.5 text-xs font-semibold text-white/45">
                    <span className="hidden sm:inline">Trier par</span>
                    <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="field-select h-9 text-xs" aria-label="Trier les résultats">
                        {SORTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                </label>
            </div>
        );
    }

    return (
        <div className="px-4 md:px-[5%]">
            {recentSearches.length > 0 && (
                <div className="mb-7">
                    <div className="mb-3 flex items-center justify-between">
                        <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/40">{t('search.recentSearches')}</h2>
                        <button type="button" onClick={clearAllRecentSearches} className="text-xs font-semibold text-white/40 transition-colors hover:text-white">
                            {t('search.clearAll')}
                        </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {recentSearches.map(term => (
                            <span key={term} className="flex items-center rounded-full border border-white/12 bg-white/[0.04] text-[13px] font-semibold text-white/75 transition-colors hover:border-white/30 hover:text-white">
                                <button type="button" onClick={() => { setQuery(term); setDebouncedQuery(term); }} className="flex items-center gap-2 py-2 pl-3.5 pr-1.5">
                                    <svg className="h-3.5 w-3.5 text-white/35" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    {term}
                                </button>
                                <button type="button" onClick={(e) => deleteRecentSearch(e, term)} aria-label={`Supprimer « ${term} » de l’historique`} className="grid h-full place-items-center py-2 pl-1 pr-3 text-white/35 transition-colors hover:text-white">
                                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </span>
                        ))}
                    </div>
                </div>
            )}

            <div className="no-scrollbar -mx-4 mb-9 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
                {(isKid ? GENRE_CHIPS.filter(g => g.kidSafe) : GENRE_CHIPS).map(genre => {
                    const active = genre.id === null ? selectedGenre === null : selectedGenre === genre.id;
                    const translated = genre.labelKey === 'all'
                        ? t('search.filters.all')
                        : t(`search.genres.${genre.labelKey}`);
                    const label = translated && !translated.startsWith('search.') ? translated : genre.fallback;
                    return (
                        <button key={genre.id ?? 'all'} type="button" aria-pressed={active} onClick={() => setSelectedGenre(genre.id)} className={chip(active)}>
                            {label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
