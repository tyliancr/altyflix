import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Genre picker: a quiet pill that opens a two-column panel.
 * Closes on outside click and Escape, and returns focus to the trigger.
 */
const GenreMenu = ({ genres, selected, onSelect, allLabel = 'Tous les genres' }) => {
    const [open, setOpen] = useState(false);
    const rootRef = useRef(null);
    const triggerRef = useRef(null);

    useEffect(() => {
        if (!open) return undefined;
        const onPointer = (e) => { if (!rootRef.current?.contains(e.target)) setOpen(false); };
        const onKey = (e) => {
            if (e.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); }
        };
        document.addEventListener('pointerdown', onPointer);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('pointerdown', onPointer);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const choose = (genre) => { setOpen(false); onSelect(genre); };

    return (
        <div ref={rootRef} className="relative">
            <button
                ref={triggerRef}
                type="button"
                aria-haspopup="listbox"
                aria-expanded={open}
                onClick={() => setOpen(v => !v)}
                className={`flex h-10 items-center gap-2.5 rounded-full border px-4 text-[13px] font-semibold backdrop-blur-xl transition-colors
                    ${selected ? 'border-white bg-white text-black' : 'border-white/20 bg-black/40 text-white hover:border-white/45'}`}
            >
                <span>{selected ? selected.name : 'Genres'}</span>
                <svg className={`h-3.5 w-3.5 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        role="listbox"
                        aria-label="Genres"
                        initial={{ opacity: 0, y: -6, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.98 }}
                        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                        className="absolute left-0 top-full z-[100] mt-2 w-[min(88vw,380px)] origin-top-left rounded-2xl border border-white/10 bg-[#0d0d13]/95 p-2 shadow-[0_24px_60px_rgba(0,0,0,0.8)] backdrop-blur-2xl"
                    >
                        <button
                            type="button"
                            role="option"
                            aria-selected={!selected}
                            onClick={() => choose(null)}
                            className={`mb-1 flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold transition-colors ${!selected ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/[0.06] hover:text-white'}`}
                        >
                            {allLabel}
                            {!selected && <Check />}
                        </button>
                        <div className="grid grid-cols-2 gap-0.5 border-t border-white/[0.07] pt-1.5">
                            {genres.map(genre => {
                                const active = selected?.id === genre.id && selected?.name === genre.name;
                                return (
                                    <button
                                        key={`${genre.id}-${genre.name}`}
                                        type="button"
                                        role="option"
                                        aria-selected={active}
                                        onClick={() => choose(genre)}
                                        className={`flex items-center justify-between gap-2 truncate rounded-xl px-3 py-2 text-left text-[13px] transition-colors ${active ? 'bg-white/10 font-semibold text-white' : 'text-white/65 hover:bg-white/[0.06] hover:text-white'}`}
                                    >
                                        <span className="truncate">{genre.name}</span>
                                        {active && <Check />}
                                    </button>
                                );
                            })}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

const Check = () => (
    <svg className="h-3.5 w-3.5 flex-none text-[#E50914]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
    </svg>
);

export default GenreMenu;
