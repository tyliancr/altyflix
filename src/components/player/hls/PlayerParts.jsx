// Icônes et éléments de menu propres au lecteur HLS. Les icônes principales viennent de ../NetflixIcons.

export function QualityIcon({ className = 'w-7 h-7' }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 17a8.5 8.5 0 1 1 16 0" />
            <path d="M12 13l4-5" />
            <circle cx="12" cy="13.5" r="1.4" fill="currentColor" stroke="none" />
        </svg>
    );
}

export function NextEpisodeIcon({ className = 'w-7 h-7' }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M5 4.5v15l11-7.5L5 4.5z" />
            <rect x="17.5" y="4.5" width="2.5" height="15" rx="0.8" />
        </svg>
    );
}

/** Entrée de menu à choix unique (piste audio, sous-titres, qualité). */
export function MenuOption({ selected, onSelect, children, hint }) {
    return (
        <button
            type="button"
            role="menuitemradio"
            aria-checked={selected}
            onClick={onSelect}
            className={`w-full flex items-center justify-between gap-3 text-left px-2 py-1.5 rounded outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white ${selected ? 'text-white font-semibold' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
        >
            <span className="truncate">{children}</span>
            <span className="flex items-center gap-2 shrink-0">
                {hint && <span className="text-xs text-gray-500 font-normal">{hint}</span>}
                {selected && <span className="text-[#e50914] font-bold" aria-hidden="true">✓</span>}
            </span>
        </button>
    );
}
