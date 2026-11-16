import { useRef, useState, memo, useCallback } from 'react';
import { motion } from 'framer-motion';
import MovieCard from '../home/MovieCard';

const ContentRow = memo(({ title, subtitle, items = [], isTV = false, showMatchScore = false, matchScores = new Map(), isTop10Row = false }) => {
    const rowRef = useRef(null);
    const [isScrolled, setIsScrolled] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(true);
    const [expandedIndex, setExpandedIndex] = useState(null);

    const isTop10Category = Boolean(isTop10Row || (title && /top\s*10/i.test(title)));

    const updateScrollState = useCallback(() => {
        if (!rowRef.current) return;
        const { scrollLeft, scrollWidth, clientWidth } = rowRef.current;
        setIsScrolled(scrollLeft > 10);
        setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10);
    }, []);

    const scroll = useCallback((dir) => {
        if (!rowRef.current) return;
        rowRef.current.scrollBy({
            left: dir === 'left' ? -rowRef.current.clientWidth * 0.75 : rowRef.current.clientWidth * 0.75,
            behavior: 'smooth',
        });
    }, []);

    const handleExpand = useCallback((idx) => setExpandedIndex(idx), []);
    const handleCollapse = useCallback(() => setExpandedIndex(null), []);

    if (!items?.length) return null;

    return (
        <div className="relative mb-8 md:mb-12">

            {/* ── Row Title ─────────────────────────────────────────────────── */}
            <div className="px-[4%] md:px-[5%] mb-2 sm:mb-3">
                <motion.h2
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5 }}
                    className="text-white text-base sm:text-xl md:text-2xl font-black tracking-tight flex items-center gap-2.5 group cursor-pointer w-fit font-sans"
                >
                    <span className="group-hover:text-white transition-colors">{title}</span>
                    <span className="flex items-center text-[#E50914] text-xs font-bold uppercase tracking-wider opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300">
                        Explorer
                        <svg className="w-3.5 h-3.5 ml-1 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                        </svg>
                    </span>
                </motion.h2>
                {subtitle && (
                    <p className="text-gray-400 text-xs sm:text-sm mt-0.5 truncate max-w-2xl">{subtitle}</p>
                )}
            </div>

            {/* ── Scroll Track ─────────────────────────────────────────────── */}
            <div className="relative group/row">

                {/* ← Left Arrow */}
                <button
                    aria-label="Précédent"
                    onClick={() => scroll('left')}
                    className="hidden lg:flex absolute left-0 top-0 bottom-0 z-40 w-20 items-center justify-center"
                    style={{
                        background: 'linear-gradient(to right, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 70%, transparent 100%)',
                        opacity: isScrolled ? undefined : 0,
                        pointerEvents: isScrolled ? undefined : 'none',
                        transition: 'opacity 250ms ease',
                    }}
                >
                    <div
                        className="w-9 h-9 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center"
                        style={{ transition: 'background 200ms, border-color 200ms, transform 200ms' }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1)'; e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                    >
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                        </svg>
                    </div>
                </button>

                {/* → Right Arrow */}
                {canScrollRight && (
                    <button
                        aria-label="Suivant"
                        onClick={() => scroll('right')}
                        className="hidden lg:flex absolute right-0 top-0 bottom-0 z-40 w-20 items-center justify-center opacity-0 group-hover/row:opacity-100 transition-opacity duration-[250ms]"
                        style={{
                            background: 'linear-gradient(to left, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 70%, transparent 100%)',
                        }}
                    >
                        <div
                            className="w-9 h-9 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center"
                            style={{ transition: 'background 200ms, border-color 200ms, transform 200ms' }}
                            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1)'; e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; }}
                            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                        >
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                            </svg>
                        </div>
                    </button>
                )}

                {/* ── Scrollable items ─────────────────────────────────────── */}
                <div
                    ref={rowRef}
                    onScroll={updateScrollState}
                    className="flex items-end gap-3 md:gap-4 lg:gap-5 overflow-x-auto overflow-y-visible py-12 -my-12 px-[4%] md:px-[5%] no-scrollbar"
                    style={{
                        WebkitOverflowScrolling: 'touch',
                        // NO scroll-snap — it fights with the card expansion animation
                        scrollPaddingLeft: 'clamp(4%, 5vw, 5%)',
                    }}
                >
                    {items.map((item, index) => {
                        const isExpanded = expandedIndex === index;
                        const baseWidth = 'clamp(110px, 18vw, 200px)';

                        return (
                            <div
                                key={item.id || index}
                                className={`flex-none relative ${isExpanded ? 'z-[200]' : 'z-[1]'}`}
                                style={{
                                    width: isExpanded ? `calc(${baseWidth} * 2.4)` : baseWidth,
                                    // GPU compositor path — width + transform only, no layout properties
                                    transition: 'width 420ms cubic-bezier(0.4, 0, 0.2, 1)',
                                    willChange: 'width',
                                    // Align bottom so card expansion grows upward
                                    alignSelf: 'flex-end',
                                }}
                            >
                                {/* Match score badge (Top-Right so it never collides with left badge) */}
                                {showMatchScore && matchScores.has(item.id) && (
                                    <div
                                        className="absolute top-2.5 right-2.5 z-20 pointer-events-none"
                                        style={{ opacity: isExpanded ? 0 : 1, transition: 'opacity 200ms' }}
                                    >
                                        <span
                                            className="flex items-center gap-0.5 text-[10px] font-black tracking-tight px-2 py-0.5 rounded-full"
                                            style={{
                                                background: 'linear-gradient(135deg,#1db954,#18a34a)',
                                                color: '#fff',
                                                textShadow: '0 1px 2px rgba(0,0,0,0.4)',
                                                boxShadow: '0 2px 6px rgba(29,185,84,0.45)',
                                            }}
                                        >
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
                                />
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
});

ContentRow.displayName = 'ContentRow';
export default ContentRow;
