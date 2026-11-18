import { useRef, useState, memo, useCallback, useEffect } from 'react';
import MovieCard from '../home/MovieCard';

const BASE_WIDTH = 'clamp(118px, 17vw, 208px)';

const ArrowButton = ({ direction, visible, onClick }) => (
    <button
        aria-label={direction === 'left' ? 'Précédent' : 'Suivant'}
        onClick={onClick}
        tabIndex={visible ? 0 : -1}
        className={`group/arrow hidden lg:flex absolute top-0 bottom-0 z-40 w-[5%] min-w-[56px] items-center justify-center transition-opacity duration-300
            ${direction === 'left' ? 'left-0 bg-gradient-to-r' : 'right-0 bg-gradient-to-l'} from-[#060608]/90 via-[#060608]/40 to-transparent
            ${visible ? 'opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100' : 'opacity-0 pointer-events-none'}`}
    >
        <span className="grid place-items-center w-10 h-10 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white transition-all duration-200 group-hover/arrow:bg-white group-hover/arrow:text-black group-hover/arrow:scale-110">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={direction === 'left' ? 'M15 19l-7-7 7-7' : 'M9 5l7 7-7 7'} />
            </svg>
        </span>
    </button>
);

/**
 * Horizontal shelf of titles.
 * `ranked` turns the shelf into a numbered chart (1–10) with oversized numerals.
 */
const ContentRow = memo(({ title, subtitle, items = [], isTV = false, showMatchScore = false, matchScores = new Map(), isTop10Row = false, ranked = false }) => {
    const rowRef = useRef(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);
    const [expandedIndex, setExpandedIndex] = useState(null);

    const isTop10Category = Boolean(!ranked && (isTop10Row || (title && /top\s*10/i.test(title))));
    const shown = ranked ? items.slice(0, 10) : items;

    const updateScrollState = useCallback(() => {
        if (!rowRef.current) return;
        const { scrollLeft, scrollWidth, clientWidth } = rowRef.current;
        setCanScrollLeft(scrollLeft > 10);
        setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10);
    }, []);

    // Arrows reflect what is actually scrollable, including after a resize
    useEffect(() => {
        updateScrollState();
        window.addEventListener('resize', updateScrollState);
        return () => window.removeEventListener('resize', updateScrollState);
    }, [updateScrollState, shown.length]);

    const scroll = useCallback((dir) => {
        if (!rowRef.current) return;
        rowRef.current.scrollBy({
            left: (dir === 'left' ? -1 : 1) * rowRef.current.clientWidth * 0.8,
            behavior: 'smooth',
        });
    }, []);

    const handleExpand = useCallback((idx) => setExpandedIndex(idx), []);
    const handleCollapse = useCallback(() => setExpandedIndex(null), []);

    if (!shown.length) return null;

    return (
        <section aria-label={title} className="relative mb-8 md:mb-12">

            {/* ── Shelf heading ─────────────────────────────────────────────── */}
            <div className="px-[4%] md:px-[5%] mb-3 sm:mb-4">
                <h2 className="flex items-baseline gap-3 text-white text-[17px] sm:text-xl md:text-[22px] font-bold font-display tracking-tight">
                    {ranked && (
                        <span className="self-center text-[10px] font-black uppercase tracking-[0.2em] text-white bg-[#E50914] rounded px-1.5 py-1 leading-none">
                            Top 10
                        </span>
                    )}
                    <span>{title}</span>
                </h2>
                {subtitle && (
                    <p className="text-white/50 text-xs sm:text-sm mt-1 truncate max-w-2xl">{subtitle}</p>
                )}
            </div>

            {/* ── Scroll track ─────────────────────────────────────────────── */}
            <div className="relative group/row">
                <ArrowButton direction="left" visible={canScrollLeft} onClick={() => scroll('left')} />
                <ArrowButton direction="right" visible={canScrollRight} onClick={() => scroll('right')} />

                <div
                    ref={rowRef}
                    onScroll={updateScrollState}
                    className={`flex items-end overflow-x-auto overflow-y-visible py-12 -my-12 px-[4%] md:px-[5%] no-scrollbar ${ranked ? 'gap-1 md:gap-2' : 'gap-2.5 md:gap-3.5 lg:gap-4'}`}
                    style={{
                        WebkitOverflowScrolling: 'touch',
                        // NO scroll-snap — it fights with the card expansion animation
                        scrollPaddingLeft: 'clamp(4%, 5vw, 5%)',
                    }}
                >
                    {shown.map((item, index) => {
                        const isExpanded = expandedIndex === index;

                        return (
                            <div
                                key={`${item.media_type || item.type || (isTV ? 'tv' : 'movie')}-${item.id || item.contentId || index}`}
                                className={`flex-none flex items-end relative ${isExpanded ? 'z-[200]' : 'z-[1]'}`}
                            >
                                {ranked && (
                                    <span
                                        aria-hidden="true"
                                        className="rank-numeral select-none pointer-events-none"
                                        style={{
                                            fontSize: `calc(${BASE_WIDTH} * 1.18)`,
                                            opacity: isExpanded ? 0.25 : 1,
                                        }}
                                    >
                                        {index + 1}
                                    </span>
                                )}

                                <div
                                    className="relative"
                                    style={{
                                        width: isExpanded ? `calc(${BASE_WIDTH} * 2.4)` : BASE_WIDTH,
                                        transition: 'width 420ms cubic-bezier(0.4, 0, 0.2, 1)',
                                        willChange: 'width',
                                    }}
                                >
                                    {/* Match score badge (top-right so it never collides with the left badge) */}
                                    {showMatchScore && matchScores.has(item.id) && (
                                        <div
                                            className="absolute top-2 right-2 z-20 pointer-events-none"
                                            style={{ opacity: isExpanded ? 0 : 1, transition: 'opacity 200ms' }}
                                        >
                                            <span className="block text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-black/70 backdrop-blur-md border border-white/10 text-[#46d369]">
                                                {matchScores.get(item.id)}%
                                            </span>
                                        </div>
                                    )}

                                    <MovieCard
                                        content={item}
                                        portrait={true}
                                        contentType={isTV ? 'tv' : 'mixed'}
                                        onExpand={handleExpand}
                                        onCollapse={handleCollapse}
                                        myIndex={index}
                                        isExpanded={isExpanded}
                                        isTop10={isTop10Category && index < 10}
                                        eager={index < 7}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
});

ContentRow.displayName = 'ContentRow';
export default ContentRow;
