import { usePlayer } from '../../contexts/PlayerContext';
import { useProfile } from '../../contexts/ProfileContext';
import { getBackdropUrl, getContentType, getPosterUrl } from '../../utils/helpers';
import { playHaptic } from '../../utils/interactions';
import SmartImage from '../common/SmartImage';

export default function ResumeRow({ history, title }) {
    const { play } = usePlayer();
    const { removeFromHistory } = useProfile();
    const unfinished = history.filter(item => {
        const p = Number(item.progress);
        return (item.contentId || item.id) && p > 0 && p < 88;
    });
    if (!unfinished.length) return null;

    return (
        <section aria-label={title} className="relative px-[4%] md:px-[5%] mb-4 sm:mb-6">
            <h2 className="mb-3 sm:mb-4 text-[17px] sm:text-xl md:text-[22px] font-bold font-display text-white tracking-tight">{title}</h2>
            <div className="flex snap-x gap-4 overflow-x-auto p-1 pb-4 no-scrollbar">
                {unfinished.map(item => {
                    const id = item.contentId || item.id;
                    const type = getContentType(item, item.season != null ? 'tv' : 'movie');
                    const name = item.title || item.name;
                    const percent = Math.floor(Number(item.progress));
                    const episode = type === 'tv' ? 'S' + (item.season || 1) + ' · E' + (item.episode || 1) : '';
                    const art = item.backdrop_path ? getBackdropUrl(item.backdrop_path, 'w500') : item.poster_path && getPosterUrl(item.poster_path, 'w342');
                    const fallbackArt = item.backdrop_path && item.poster_path ? getPosterUrl(item.poster_path, 'w342') : undefined;
                    return (
                        <div
                            key={type + ':' + id}
                            role="button"
                            tabIndex={0}
                            onClick={() => { playHaptic(); play({ ...item, id, media_type: type }); }}
                            onKeyDown={(e) => { if (e.key === 'Enter') { playHaptic(); play({ ...item, id, media_type: type }); } }}
                            aria-label={['Reprendre ' + name, episode, percent + ' %'].filter(Boolean).join(', ')}
                            className="group relative aspect-video w-64 shrink-0 snap-start overflow-hidden rounded-xl bg-[#101016] text-left sm:w-80 shadow-[0_6px_20px_rgba(0,0,0,0.45)] hover:shadow-[0_16px_40px_rgba(0,0,0,0.8)] transition-all duration-300 ring-1 ring-inset ring-white/[0.07] hover:ring-white/25 cursor-pointer select-none"
                        >
                            {art && (
                                <SmartImage
                                    src={art}
                                    fallbackSrc={fallbackArt}
                                    alt=""
                                    loading="lazy"
                                    decoding="async"
                                    className="absolute inset-0 h-full w-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                                />
                            )}
                            <span className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-transparent" />
                            
                            {/* Remove from continue watching button */}
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    playHaptic();
                                    removeFromHistory(id);
                                }}
                                title="Retirer de la ligne"
                                aria-label={`Retirer ${name} de la ligne`}
                                className="absolute top-3 right-3 z-20 w-8 h-8 rounded-full bg-black/75 hover:bg-[#E50914] text-white/80 hover:text-white flex items-center justify-center transition-all duration-200 opacity-0 group-hover:opacity-100 hover:scale-110 shadow-xl border border-white/15"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>

                            {/* Play icon on hover */}
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                                <div className="w-14 h-14 rounded-full bg-black/60 border border-white/40 flex items-center justify-center text-white backdrop-blur-xl scale-90 group-hover:scale-100 transition-transform">
                                    <svg className="w-6 h-6 ml-0.5 fill-current" viewBox="0 0 24 24">
                                        <path d="M8 5v14l11-7z" />
                                    </svg>
                                </div>
                            </div>

                            <span className="absolute inset-x-4 bottom-4 text-white z-10 pointer-events-none">
                                <strong className="block truncate text-sm sm:text-base font-bold drop-shadow-md">{name}</strong>
                                <span className="text-xs text-white/75 font-medium flex items-center gap-2 mt-0.5">
                                    {episode && <span className="bg-white/10 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">{episode}</span>}
                                    <span>{item.runtime ? `Reste ${Math.max(1, Math.round(item.runtime * (1 - percent / 100)))} min` : `${percent} % visionné`}</span>
                                </span>
                            </span>
                            <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1 bg-white/20 z-10">
                                <span className="block h-full bg-[#E50914]" style={{ width: Math.max(percent, 5) + '%' }} />
                            </span>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
