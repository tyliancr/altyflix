import { AnimatePresence, motion } from 'framer-motion';

const getJustNowText = (language) => {
    switch (language) {
        case 'fr': return "À l'instant";
        case 'es': return 'Ahora mismo';
        case 'de': return 'Gerade eben';
        case 'it': return 'Adesso';
        default: return 'Just now';
    }
};

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
    return (
        <div className="max-w-4xl mx-auto animate-fade-in">
            {/* Review Form */}
            {currentUser && currentProfile && (
                <div className="backdrop-blur-md bg-white/[0.015] border border-white/[0.06] rounded-3xl p-8 mb-8 relative overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.3)] animate-fade-in-up">
                    <div className="absolute -top-20 -right-20 w-56 h-56 bg-[#E50914]/5 blur-[80px] rounded-full pointer-events-none" />
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-[#E50914] to-[#B81D24]" />
                    
                    <h3 className="text-xl font-black mb-6 tracking-wide uppercase text-white/90">
                        {userReview ? t('detail.yourReview') : t('detail.addReview')}
                    </h3>
                    
                    <form onSubmit={handleSubmitReview} className="space-y-6 relative z-10">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-4 bg-white/[0.01] border border-white/[0.03] p-4 rounded-2xl">
                            <div 
                                className="flex items-center gap-1.5"
                                onMouseLeave={() => setHoveredRating(0)}
                            >
                                {[1, 2, 3, 4, 5].map(star => {
                                    const isActive = star <= (hoveredRating || reviewRating);
                                    return (
                                        <button
                                            key={star}
                                            type="button"
                                            onMouseEnter={() => setHoveredRating(star)}
                                            onClick={() => setReviewRating(star)}
                                            aria-label={`Noter ${star} sur 5`}
                                            className={`transition-all duration-300 transform hover:scale-125 hover:rotate-6 active:scale-95 outline-none ${
                                                isActive ? 'text-yellow-400' : 'text-white/10 hover:text-white/35'
                                            }`}
                                            style={{
                                                filter: isActive ? 'drop-shadow(0 0 10px rgba(250, 204, 21, 0.55))' : 'none'
                                            }}
                                        >
                                            <svg className="w-9 h-9" fill="currentColor" viewBox="0 0 20 20">
                                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                            </svg>
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="h-6 flex items-center">
                                <AnimatePresence mode="wait">
                                    {(hoveredRating || reviewRating) > 0 && (
                                        <motion.span
                                            key={hoveredRating || reviewRating}
                                            initial={{ opacity: 0, x: -8 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: 8 }}
                                            className="text-xs font-black text-yellow-400 bg-yellow-400/10 px-3 py-1 rounded-full uppercase tracking-widest animate-fade-in"
                                        >
                                            {t('detail.ratingHelp')[(hoveredRating || reviewRating) - 1]}
                                        </motion.span>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>

                        <div className="relative group">
                            <textarea
                                value={reviewText}
                                onChange={(e) => setReviewText(e.target.value)}
                                placeholder={`${t('detail.reviewPlaceholder')} ${title} ?`}
                                className="w-full bg-white/[0.02] border border-white/[0.08] rounded-2xl p-5 text-white placeholder-white/20 focus:outline-none focus:border-[#E50914] focus:ring-1 focus:ring-[#E50914] transition-all duration-300 resize-none min-h-[120px] shadow-inner text-sm leading-relaxed"
                                required
                            />
                            <div className="absolute inset-0 rounded-2xl border border-white/0 group-hover:border-white/5 pointer-events-none transition-colors duration-300" />
                        </div>

                        <div className="flex items-center justify-between">
                            {userReview && (
                                <button 
                                    type="button" 
                                    onClick={handleDeleteReview} 
                                    className="text-white/40 hover:text-red-400 text-xs font-black uppercase tracking-widest transition-colors duration-300"
                                >
                                    {t('detail.deleteReview')}
                                </button>
                            )}
                            <button
                                type="submit"
                                disabled={isSubmittingReview || !reviewRating || !reviewText.trim()}
                                className="ml-auto bg-gradient-to-r from-[#E50914] to-[#B81D24] hover:from-[#f40612] hover:to-[#E50914] text-white font-black py-3 px-8 rounded-full shadow-[0_4px_20px_rgba(229,9,20,0.35)] hover:shadow-[0_4px_25px_rgba(229,9,20,0.55)] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none transition-all duration-300 tracking-wider text-xs uppercase"
                            >
                                {isSubmittingReview ? t('detail.submitting') : t('detail.submitReview')}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Reviews List */}
            <div className="space-y-5">
                {reviews.length > 0 ? (
                    reviews.map(review => {
                        const isMyReview = review.profileId === currentProfile?.id;
                        return (
                            <div 
                                key={review.id} 
                                className="backdrop-blur-md bg-white/[0.015] border border-white/[0.06] rounded-3xl p-6 flex gap-5 items-start hover:border-white/10 transition-all duration-300 hover:-translate-y-0.5 relative overflow-hidden group/card shadow-[0_4px_20px_rgba(0,0,0,0.15)] animate-fade-in-up"
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-[#E50914]/[0.01] to-[#B81D24]/[0.01] opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 pointer-events-none" />
                                
                                <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 border-2 border-white/10 group-hover/card:border-white/25 shadow-md transition-all duration-300">
                                    <img 
                                        src={review.authorAvatar || '/logo.png'} 
                                        alt={review.authorName} 
                                        className="w-full h-full object-cover transition-transform duration-500 group-hover/card:scale-110" 
                                        loading="lazy"
                                        decoding="async"
                                    />
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-1.5 gap-2">
                                        <div className="flex items-center gap-3">
                                            <h4 className="font-bold text-white text-sm md:text-base tracking-wide truncate">{review.authorName}</h4>
                                            {isMyReview && (
                                                <span className="bg-[#E50914]/15 border border-[#E50914]/30 text-[#E50914] text-[9px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full">
                                                    {t('detail.myReview')}
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-white/40 text-xs font-light flex-shrink-0">
                                            {review.updatedAt?.toDate ? new Date(review.updatedAt.toDate()).toLocaleDateString(language, { day: 'numeric', month: 'long', year: 'numeric' }) : getJustNowText(language)}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-1 mb-3">
                                        {[...Array(5)].map((_, i) => (
                                            <svg 
                                                key={i} 
                                                className={`w-4 h-4 ${i < review.rating ? 'text-yellow-400' : 'text-white/10'}`} 
                                                fill="currentColor" 
                                                viewBox="0 0 20 20"
                                                style={{
                                                    filter: i < review.rating ? 'drop-shadow(0 0 6px rgba(250, 204, 21, 0.4))' : 'none'
                                                }}
                                            >
                                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                            </svg>
                                        ))}
                                    </div>

                                    <p className="text-white/80 text-xs md:text-sm leading-relaxed whitespace-pre-wrap font-light">
                                        {review.text}
                                    </p>
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div className="text-center py-16 bg-white/[0.01] border border-white/[0.04] rounded-3xl animate-fade-in">
                        <div className="text-4xl mb-3">💬</div>
                        <h4 className="text-white/80 font-bold mb-1">{t('detail.noReviewsTitle')}</h4>
                        <p className="text-white/40 text-xs max-w-sm mx-auto">{t('detail.noReviewsDesc')}</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ReviewsSection;
