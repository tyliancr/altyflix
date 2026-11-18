import { AnimatePresence, motion } from 'framer-motion';
import { EmptyState, Button } from '../ui/Primitives';

const STAR = 'M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z';
const GOLD = '#f5c518';

const JUST_NOW = { fr: "À l'instant", es: 'Ahora mismo', de: 'Gerade eben', it: 'Adesso' };

const Stars = ({ value, className = 'h-4 w-4' }) => (
    <span className="flex items-center gap-0.5" role="img" aria-label={`${value} sur 5`}>
        {[1, 2, 3, 4, 5].map(i => (
            <svg key={i} className={className} viewBox="0 0 20 20" fill={i <= value ? GOLD : 'rgba(255,255,255,0.14)'} aria-hidden="true">
                <path d={STAR} />
            </svg>
        ))}
    </span>
);

const ReviewsSection = ({
    currentUser,
    currentProfile,
    userReview,
    reviewRating,
    setReviewRating,
    hoveredRating,
    setHoveredRating,
    reviewText,
    setReviewText,
    isSubmittingReview,
    handleSubmitReview,
    handleDeleteReview,
    reviews,
    title,
    t,
    language
}) => {
    const shown = hoveredRating || reviewRating;
    const average = reviews.length ? reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviews.length : 0;

    return (
        <div className="grid max-w-6xl grid-cols-1 gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
            {/* ── Write a review ── */}
            <div className="space-y-6">
                {reviews.length > 0 && (
                    <div className="flex items-center gap-5 rounded-3xl border border-white/[0.08] bg-white/[0.03] p-6">
                        <p className="font-display text-5xl font-bold tracking-tight text-white">{average.toFixed(1)}</p>
                        <div>
                            <Stars value={Math.round(average)} className="h-5 w-5" />
                            <p className="mt-1.5 text-[13px] text-white/50">{reviews.length} avis des membres</p>
                        </div>
                    </div>
                )}

                {currentUser && currentProfile && (
                    <form onSubmit={handleSubmitReview} className="rounded-3xl border border-white/[0.08] bg-white/[0.03] p-6">
                        <h3 className="font-display text-lg font-bold tracking-tight text-white">
                            {userReview ? t('detail.yourReview') : t('detail.addReview')}
                        </h3>

                        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                            <div className="flex items-center gap-1" onMouseLeave={() => setHoveredRating(0)}>
                                {[1, 2, 3, 4, 5].map(star => (
                                    <motion.button
                                        key={star}
                                        type="button"
                                        whileHover={{ scale: 1.2 }}
                                        whileTap={{ scale: 0.9 }}
                                        onMouseEnter={() => setHoveredRating(star)}
                                        onFocus={() => setHoveredRating(star)}
                                        onBlur={() => setHoveredRating(0)}
                                        onClick={() => setReviewRating(star)}
                                        aria-label={`Noter ${star} sur 5`}
                                        aria-pressed={reviewRating === star}
                                        className="rounded-md p-0.5"
                                    >
                                        <svg className="h-8 w-8 transition-colors duration-200" viewBox="0 0 20 20" fill={star <= shown ? GOLD : 'rgba(255,255,255,0.14)'} aria-hidden="true">
                                            <path d={STAR} />
                                        </svg>
                                    </motion.button>
                                ))}
                            </div>
                            <span className="h-5 text-sm font-semibold text-white/70" aria-live="polite">
                                <AnimatePresence mode="wait">
                                    {shown > 0 && (
                                        <motion.span
                                            key={shown}
                                            initial={{ opacity: 0, x: -6 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: 6 }}
                                            transition={{ duration: 0.15 }}
                                            className="block"
                                        >
                                            {t('detail.ratingHelp')[shown - 1]}
                                        </motion.span>
                                    )}
                                </AnimatePresence>
                            </span>
                        </div>

                        <textarea
                            value={reviewText}
                            onChange={(e) => setReviewText(e.target.value)}
                            placeholder={`${t('detail.reviewPlaceholder')} ${title} ?`}
                            aria-label={t('detail.addReview')}
                            maxLength={2000}
                            className="field-input mt-4 !h-auto min-h-[130px] resize-y py-3.5 text-[15px] leading-relaxed"
                            required
                        />

                        <div className="mt-4 flex items-center justify-between gap-3">
                            {userReview ? (
                                <button type="button" onClick={handleDeleteReview} className="text-sm font-semibold text-white/50 transition-colors hover:text-[#ff5a63]">
                                    {t('detail.deleteReview')}
                                </button>
                            ) : <span />}
                            <Button type="submit" disabled={isSubmittingReview || !reviewRating || !reviewText.trim()}>
                                {isSubmittingReview ? t('detail.submitting') : t('detail.submitReview')}
                            </Button>
                        </div>
                    </form>
                )}
            </div>

            {/* ── Reviews ── */}
            <div>
                {reviews.length > 0 ? (
                    <ul className="divide-y divide-white/[0.07]">
                        {reviews.map((review, i) => {
                            const isMine = review.profileId === currentProfile?.id;
                            const rawDate = review.updatedAt?.toDate
                                ? review.updatedAt.toDate()
                                : (typeof review.updatedAt?.seconds === 'number'
                                    ? new Date(review.updatedAt.seconds * 1000)
                                    : (typeof review.updatedAt === 'number' && review.updatedAt > 0 ? new Date(review.updatedAt) : null));
                            const date = rawDate && !Number.isNaN(rawDate.getTime())
                                ? rawDate.toLocaleDateString(language, { day: 'numeric', month: 'long', year: 'numeric' })
                                : (JUST_NOW[language] || 'Just now');
                            return (
                                <motion.li
                                    key={review.id}
                                    initial={{ opacity: 0, y: 12 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.35, delay: Math.min(i * 0.04, 0.3) }}
                                    className="flex gap-4 py-5 first:pt-0"
                                >
                                    <span className="grid h-11 w-11 flex-none place-items-center overflow-hidden rounded-[26%] bg-[#1a1a22] font-display text-base font-bold text-white/60">
                                        {review.authorAvatar
                                            ? <img src={review.authorAvatar} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                                            : review.authorName?.charAt(0)}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                                            <h4 className="truncate text-[15px] font-semibold text-white">{review.authorName}</h4>
                                            {isMine && (
                                                <span className="rounded-md border border-white/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/70">
                                                    {t('detail.myReview')}
                                                </span>
                                            )}
                                            <span className="ml-auto text-xs text-white/40">{date}</span>
                                        </div>
                                        <div className="mt-1.5"><Stars value={review.rating} /></div>
                                        <p className="mt-2.5 whitespace-pre-wrap text-[15px] leading-relaxed text-white/75">{review.text}</p>
                                    </div>
                                </motion.li>
                            );
                        })}
                    </ul>
                ) : (
                    <EmptyState
                        title={t('detail.noReviews')}
                        icon={<svg className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d={STAR} /></svg>}
                    >
                        {t('detail.noReviewsDesc')}
                    </EmptyState>
                )}
            </div>
        </div>
    );
};

export default ReviewsSection;
