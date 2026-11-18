import { memo } from 'react';
import { Link } from 'react-router-dom';
import { useProfile } from '../../contexts/ProfileContext';
import { usePlayer } from '../../contexts/PlayerContext';
import { getContentType, getPosterUrl } from '../../utils/helpers';
import SmartImage from '../common/SmartImage';

const resolveType = (item, hint) => {
    if (hint === 'movie' || hint === 'tv') return hint;
    const detected = item.type || item.media_type || getContentType(item);
    if (detected === 'tv' || detected === 'movie') return detected;
    return (item.first_air_date || item.name || item.number_of_seasons) ? 'tv' : 'movie';
};

/**
 * Poster tile for grids: artwork, title and one line of facts, with play and
 * list actions on hover or keyboard focus. Shelves use MovieCard instead.
 */
const PosterCard = memo(({ item, type: typeHint, badge, caption, onRemove, showType = false }) => {
    const { isInMyList, addToMyList, removeFromMyList } = useProfile();
    const { play } = usePlayer();

    const type = resolveType(item, typeHint);
    const id = item.id || item.contentId;
    const title = item.title || item.name;
    const year = (item.release_date || item.first_air_date || '').slice(0, 4);
    const score = item.vote_average > 0 ? Math.round(item.vote_average * 10) : null;
    const inList = isInMyList(item);
    const facts = caption ?? [year, showType ? (type === 'tv' ? 'Série' : 'Film') : null].filter(Boolean).join(' · ');

    const toggleList = (e) => {
        e.preventDefault();
        if (onRemove) onRemove(id);
        else if (inList) removeFromMyList(id);
        else addToMyList(item);
    };

    return (
        <article className="group relative min-w-0">
            <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-[#101016] ring-1 ring-inset ring-white/[0.07] shadow-[0_6px_20px_rgba(0,0,0,0.45)] transition-[box-shadow,transform] duration-300 group-hover:-translate-y-1 group-hover:shadow-[0_18px_40px_rgba(0,0,0,0.7)] group-focus-within:-translate-y-1">
                <Link to={`/${type}/${id}`} aria-label={title} className="absolute inset-0 block">
                    <SmartImage
                        src={item.poster_path ? getPosterUrl(item.poster_path, 'w342') : ''}
                        srcSet={item.poster_path ? `${getPosterUrl(item.poster_path, 'w185')} 185w, ${getPosterUrl(item.poster_path, 'w342')} 342w` : undefined}
                        sizes="(max-width: 640px) 45vw, (max-width: 1280px) 22vw, 220px"
                        fallbackSrc={item.backdrop_path ? getPosterUrl(item.backdrop_path, 'w300') : undefined}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.06]"
                        fallback={
                            <span className="grid h-full w-full place-items-center p-4 text-center font-display text-sm font-semibold text-white/50">
                                {title}
                            </span>
                        }
                    />
                    <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-within:opacity-100" />
                </Link>

                {badge && (
                    <span className="pointer-events-none absolute left-2 top-2 rounded-md border border-white/15 bg-black/70 px-1.5 py-1 text-[9px] font-bold uppercase leading-none tracking-[0.12em] text-white backdrop-blur-md">
                        {badge}
                    </span>
                )}
                {score !== null && (
                    <span className="pointer-events-none absolute right-2 top-2 rounded-md border border-white/10 bg-black/70 px-1.5 py-1 text-[10px] font-bold leading-none text-[#46d369] opacity-0 backdrop-blur-md transition-opacity duration-300 group-hover:opacity-100">
                        {score}%
                    </span>
                )}

                <div className="absolute inset-x-2.5 bottom-2.5 flex translate-y-2 items-center gap-2 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100">
                    <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); play(item); }}
                        aria-label={`Lire ${title}`}
                        className="grid h-9 w-9 place-items-center rounded-full bg-white text-black transition-transform hover:scale-110 active:scale-95"
                    >
                        <svg className="ml-0.5 h-4 w-4 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                    </button>
                    <button
                        type="button"
                        onClick={toggleList}
                        aria-label={onRemove || inList ? `Retirer ${title} de ma liste` : `Ajouter ${title} à ma liste`}
                        aria-pressed={Boolean(onRemove || inList)}
                        className="grid h-9 w-9 place-items-center rounded-full border border-white/40 bg-black/55 text-white backdrop-blur-md transition-all hover:scale-110 hover:border-white active:scale-95"
                    >
                        {onRemove ? (
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        ) : inList ? (
                            <svg className="h-4 w-4 text-[#46d369]" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        ) : (
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                        )}
                    </button>
                </div>
            </div>

            <h3 className="mt-2.5 truncate px-0.5 text-[13px] font-semibold text-white/90 transition-colors group-hover:text-white">{title}</h3>
            {facts && <p className="truncate px-0.5 text-xs text-white/45">{facts}</p>}
        </article>
    );
});

PosterCard.displayName = 'PosterCard';
export default PosterCard;
