import { useEffect, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const GRID = 'grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 sm:gap-x-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7';

/** Responsive poster grid shared by every listing page. */
export const PosterGrid = ({ children, className = '' }) => (
    <div className={`${GRID} ${className}`}>{children}</div>
);

export const GridSkeleton = ({ count = 12, className = '' }) => (
    <div className={`${GRID} ${className}`} aria-hidden="true">
        {Array.from({ length: count }).map((_, i) => (
            <div key={i}>
                <div className="skeleton aspect-[2/3] !rounded-xl" />
                <div className="skeleton mt-2.5 h-3 w-3/4" />
                <div className="skeleton mt-1.5 h-3 w-1/3" />
            </div>
        ))}
    </div>
);

export const ShelfSkeleton = ({ rows = 3 }) => (
    <div className="space-y-10" aria-hidden="true">
        {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="px-[4%] md:px-[5%]">
                <div className="skeleton mb-4 h-5 w-44" />
                <div className="flex gap-2.5 overflow-hidden md:gap-3.5 lg:gap-4">
                    {Array.from({ length: 9 }).map((__, j) => (
                        <div key={j} className="skeleton flex-none !rounded-xl" style={{ width: 'clamp(118px, 17vw, 208px)', aspectRatio: '2 / 3' }} />
                    ))}
                </div>
            </div>
        ))}
    </div>
);

/** Title block for pages without a hero. */
export const PageHeader = ({ eyebrow, title, subtitle, children }) => (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-5 sm:mb-10">
        <div className="min-w-0">
            {eyebrow && <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.24em] text-[#E50914]">{eyebrow}</p>}
            <h1 className="font-display text-4xl font-bold tracking-tight text-white text-balance sm:text-5xl">{title}</h1>
            {subtitle && <p className="mt-2 text-sm text-white/50 sm:text-base">{subtitle}</p>}
        </div>
        {children && <div className="flex flex-wrap items-center gap-3">{children}</div>}
    </header>
);

export const SectionTitle = ({ children, count, action }) => (
    <div className="mb-5 flex items-baseline justify-between gap-4">
        <h2 className="flex items-baseline gap-3 font-display text-xl font-bold tracking-tight text-white sm:text-[22px]">
            {children}
            {count != null && <span className="text-sm font-medium text-white/35">{count}</span>}
        </h2>
        {action}
    </div>
);

/**
 * Pill switcher with a sliding active marker.
 * options: [{ id, label, count? }]
 */
export const SegmentedControl = ({ options, value, onChange, label, size = 'md' }) => {
    const groupId = useId();
    const pad = size === 'sm' ? 'px-3.5 py-1.5 text-xs' : 'px-4 py-2 text-[13px]';
    return (
        <div role="tablist" aria-label={label} className="no-scrollbar inline-flex max-w-full items-center overflow-x-auto rounded-full border border-white/10 bg-white/[0.05] p-1">
            {options.map(option => {
                const active = option.id === value;
                return (
                    <button
                        key={option.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => onChange(option.id)}
                        className={`relative flex-none whitespace-nowrap rounded-full font-semibold transition-colors duration-300 ${pad} ${active ? 'text-black' : 'text-white/65 hover:text-white'}`}
                    >
                        {active && (
                            <motion.span
                                layoutId={`segment-${groupId}`}
                                className="absolute inset-0 rounded-full bg-white"
                                transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                            />
                        )}
                        <span className="relative">
                            {option.label}
                            {option.count > 0 && <span className={`ml-1.5 text-[11px] ${active ? 'text-black/50' : 'text-white/35'}`}>{option.count}</span>}
                        </span>
                    </button>
                );
            })}
        </div>
    );
};

export const EmptyState = ({ icon, title, children, action, tone = 'neutral' }) => (
    <div role={tone === 'error' ? 'alert' : 'status'} className="mx-auto flex max-w-md flex-col items-center rounded-3xl border border-white/[0.08] bg-white/[0.03] px-8 py-14 text-center">
        {icon && (
            <div className={`mb-5 grid h-14 w-14 place-items-center rounded-full border ${tone === 'error' ? 'border-[#E50914]/30 bg-[#E50914]/10 text-[#ff5a63]' : 'border-white/10 bg-white/5 text-white/45'}`}>
                {icon}
            </div>
        )}
        <h2 className="font-display text-xl font-bold text-white">{title}</h2>
        {children && <div className="mt-2 text-sm leading-relaxed text-white/50">{children}</div>}
        {action && <div className="mt-6">{action}</div>}
    </div>
);

const BUTTON_STYLES = {
    primary: 'bg-white text-black hover:bg-white/85',
    accent: 'bg-[#E50914] text-white hover:bg-[#f6121d]',
    glass: 'bg-white/[0.12] text-white border border-white/15 hover:bg-white/20 backdrop-blur-xl',
    ghost: 'text-white/70 hover:text-white hover:bg-white/10',
};

export const Button = ({ variant = 'primary', size = 'md', className = '', children, ...props }) => (
    <button
        type="button"
        {...props}
        className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-200 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50
            ${size === 'lg' ? 'h-12 px-6 text-base sm:h-[52px] sm:px-7 sm:text-lg' : size === 'sm' ? 'h-9 px-4 text-[13px]' : 'h-11 px-5 text-sm'}
            ${BUTTON_STYLES[variant]} ${className}`}
    >
        {children}
    </button>
);

/** Round icon button with an accessible label, used for secondary title actions. */
export const IconButton = ({ label, active = false, className = '', children, ...props }) => (
    <button
        type="button"
        aria-label={label}
        title={label}
        {...props}
        className={`grid h-12 w-12 flex-none place-items-center rounded-full border backdrop-blur-xl transition-all duration-200 active:scale-95 sm:h-[52px] sm:w-[52px]
            ${active ? 'border-white bg-white/15 text-white' : 'border-white/30 bg-black/30 text-white hover:border-white hover:bg-white/10'} ${className}`}
    >
        {children}
    </button>
);

export const TrailerModal = ({ videoKey, onClose }) => {
    useEffect(() => {
        if (!videoKey) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [videoKey, onClose]);

    return (
        <AnimatePresence>
            {videoKey && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Bande-annonce"
                    className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 p-4 backdrop-blur-md sm:p-8"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ scale: 0.94, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.94, opacity: 0 }}
                        transition={{ type: 'spring', damping: 26, stiffness: 260 }}
                        className="relative aspect-video w-full max-w-5xl overflow-hidden rounded-2xl bg-black shadow-[0_40px_100px_rgba(0,0,0,0.85)] ring-1 ring-white/10"
                        onClick={e => e.stopPropagation()}
                    >
                        <iframe
                            src={`https://www.youtube-nocookie.com/embed/${videoKey}?autoplay=1&modestbranding=1&rel=0`}
                            title="Bande-annonce"
                            className="h-full w-full border-0"
                            allow="autoplay; encrypted-media; fullscreen"
                            allowFullScreen
                            referrerPolicy="strict-origin-when-cross-origin"
                        />
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Fermer"
                            className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-black/60 text-white backdrop-blur-md transition-colors hover:bg-black/85"
                        >
                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
