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
            className="flex flex-col sm:flex-row gap-4 p-4 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/5 transition-all duration-300 cursor-pointer group"
        >
            {/* Left section: Index, Thumbnail */}
            <div className="flex gap-4 items-center flex-shrink-0">
                <div className="flex items-center justify-center w-6 text-white/40 text-sm font-semibold">{number}</div>
                <div className="w-40 aspect-video rounded-lg overflow-hidden bg-[#2f2f2f] relative shadow-md">
                    {episode.still_path ? (
                        <img
                            src={`https://image.tmdb.org/t/p/w300${episode.still_path}`}
                            alt={episode.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                            decoding="async"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-white/20">
                            🎬
                        </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm shadow-lg">
                            <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                            </svg>
                        </div>
                    </div>

                    {/* Progress or Watched Badge */}
                    {isWatched ? (
                        <div className="absolute bottom-0 inset-x-0 bg-emerald-600/90 text-[10px] text-white font-bold py-0.5 text-center flex items-center justify-center gap-1 backdrop-blur-xs">
                            <span>✓ Vu</span>
                        </div>
                    ) : progress > 0 ? (
                        <div className="absolute bottom-0 inset-x-0 h-1.5 bg-black/60">
                            <div className="h-full bg-[#E50914]" style={{ width: `${progress}%` }} />
                        </div>
                    ) : null}
                </div>
            </div>

            {/* Right section: Info, Description, Director, Guest Stars */}
            <div className="flex-1 min-w-0 flex flex-col justify-between">
                <div>
                    <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="text-white text-sm md:text-base font-bold line-clamp-1 group-hover:text-ALTYFLIX-primary transition-colors">{episode.name}</p>
                        {episode.runtime && <span className="text-white/50 text-xs font-semibold flex-shrink-0 bg-white/5 px-2 py-0.5 rounded-full">{episode.runtime}m</span>}
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
                                                <div className="w-full h-full flex items-center justify-center text-[8px] text-white/50">👤</div>
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
