import SmartImage from '../common/SmartImage';

const EpisodeRow = ({ episode, number, onPlay, onPersonClick, isWatched, progress, t }) => {
    const director = episode.crew?.find(c => c.job === 'Director')?.name;
    const guestStars = episode.guest_stars?.slice(0, 5) || [];

    return (
        <div
            role="button"
            tabIndex={0}
            aria-label={`Regarder l’épisode ${number} : ${episode.name}`}
            onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onPlay(); } }}
            onClick={onPlay}
            className="flex flex-col sm:flex-row gap-4 p-3 sm:p-4 rounded-2xl hover:bg-white/[0.05] transition-colors duration-300 cursor-pointer group"
        >
            {/* Left section: Index, Thumbnail */}
            <div className="flex gap-4 items-center flex-shrink-0">
                <div className="w-7 text-center font-display text-xl font-bold text-white/35 group-hover:text-white transition-colors">{number}</div>
                <div className="w-44 aspect-video rounded-xl overflow-hidden bg-[#101016] relative ring-1 ring-inset ring-white/[0.07]">
                    {episode.still_path ? (
                        <SmartImage
                            src={`https://image.tmdb.org/t/p/w300${episode.still_path}`}
                            alt={episode.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                            decoding="async"
                            fallback={
                                <div className="w-full h-full grid place-items-center text-xs font-semibold text-white/25">
                                    Épisode {number}
                                </div>
                            }
                        />
                    ) : (
                        <div className="w-full h-full grid place-items-center text-xs font-semibold text-white/25">
                            Épisode {number}
                        </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-black shadow-lg">
                            <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                            </svg>
                        </div>
                    </div>

                    {/* Progress or Watched Badge */}
                    {isWatched ? (
                        <div className="absolute top-1.5 right-1.5 rounded-md bg-black/70 backdrop-blur-md border border-[#46d369]/30 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#46d369]">
                            Vu
                        </div>
                    ) : progress > 0 ? (
                        <div className="absolute bottom-0 inset-x-0 h-1 bg-white/20">
                            <div className="h-full bg-[#E50914]" style={{ width: `${progress}%` }} />
                        </div>
                    ) : null}
                </div>
            </div>

            {/* Right section: Info, Description, Director, Guest Stars */}
            <div className="flex-1 min-w-0 flex flex-col justify-between">
                <div>
                    <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="text-white text-sm md:text-base font-semibold line-clamp-1">{episode.name}</p>
                        {episode.runtime > 0 && <span className="text-white/45 text-xs font-medium flex-shrink-0 pt-0.5">{episode.runtime} min</span>}
                    </div>
                    <p className="text-white/50 text-xs md:text-sm line-clamp-2 leading-relaxed font-light">
                        {episode.overview || "Aucun synopsis disponible pour cet épisode."}
                    </p>
                </div>

                {/* Director & Guest Stars Row */}
                {(director || guestStars.length > 0) && (
                    <div className="flex flex-wrap items-center justify-between gap-3 mt-3 pt-3 border-t border-white/5 text-[11px]">
                        {/* Guest Stars */}
                        {guestStars.length > 0 && (
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-white/30 font-bold uppercase tracking-wider">{t('detail.guestStars')}</span>
                                <div className="flex -space-x-1">
                                    {guestStars.map(g => (
                                        <div
                                            key={g.id}
                                            role="button"
                                            tabIndex={0}
                                            aria-label={`Voir la fiche de ${g.name}`}
                                            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onPersonClick(g.id); } }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onPersonClick(g.id);
                                            }}
                                            className="w-5 h-5 rounded-full border border-black overflow-hidden bg-[#2f2f2f] cursor-pointer hover:scale-110 hover:z-10 transition-all"
                                            title={`${g.name} (${g.character})`}
                                        >
                                            {g.profile_path ? (
                                                <img src={`https://image.tmdb.org/t/p/w45${g.profile_path}`} className="w-full h-full object-cover" alt={g.name} loading="lazy" decoding="async" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-[8px] font-bold text-white/50">{g.name?.charAt(0)}</div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                <span className="text-white/50 font-medium truncate max-w-[150px] sm:max-w-[250px]">
                                    {guestStars.slice(0, 3).map(g => g.name).join(', ')}
                                    {guestStars.length > 3 && '...'}
                                </span>
                            </div>
                        )}

                        {/* Director */}
                        {director && (
                            <span className="text-white/40 font-semibold flex items-center gap-1 ml-auto">
                                <span className="text-white/20 font-bold uppercase tracking-wider">{t('detail.directorShort')}</span> {director}
                            </span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default EpisodeRow;
