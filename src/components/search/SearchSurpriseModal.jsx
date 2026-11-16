import { motion, AnimatePresence } from 'framer-motion';
import { MOODS } from './SearchConstants';
import { getContentType } from '../../utils/helpers';

export default function SearchSurpriseModal({
    showSurpriseModal,
    setShowSurpriseModal,
    pickSurprise,
    selectedMood,
    surpriseLoading,
    surpriseContent,
    navigate
}) {
    return (
        <AnimatePresence>
            {showSurpriseModal && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setShowSurpriseModal(false)}
                    className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-2xl flex items-center justify-center p-4 sm:p-6"
                >
                    <motion.div
                        initial={{ scale: 0.95, y: 10 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.95, y: 10 }}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-[#111118] border border-white/10 rounded-3xl p-6 sm:p-8 max-w-xl w-full shadow-[0_20px_60px_rgba(0,0,0,0.8)] relative overflow-hidden"
                    >
                        <button
                            type="button"
                            onClick={() => setShowSurpriseModal(false)}
                            className="absolute top-5 right-5 w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 text-white/60 hover:text-white flex items-center justify-center transition-colors"
                        >
                            ✕
                        </button>

                        <div className="text-center mb-6">
                            <span className="inline-block text-3xl mb-2">🎲</span>
                            <h3 className="text-2xl font-black text-white uppercase tracking-wide">
                                Surprends-moi !
                            </h3>
                            <p className="text-xs sm:text-sm text-white/50 mt-1">
                                Choisissez votre humeur du moment et laissez la magie opérer.
                            </p>
                        </div>

                        {/* Mood selector buttons */}
                        <div className="grid grid-cols-2 gap-2.5 mb-6">
                            {MOODS.map(mood => (
                                <button
                                    key={mood.id}
                                    type="button"
                                    onClick={() => pickSurprise(mood.genre)}
                                    className={`p-3.5 rounded-2xl text-xs sm:text-sm font-bold text-left transition-all border ${
                                        selectedMood === mood.genre
                                            ? 'bg-[#E50914] text-white border-[#E50914] shadow-lg shadow-red-900/40'
                                            : 'bg-white/[0.03] text-white/80 border-white/5 hover:border-white/20 hover:bg-white/5'
                                    }`}
                                >
                                    {mood.label}
                                </button>
                            ))}
                        </div>

                        {/* Surprise result card */}
                        {surpriseLoading && (
                            <div className="py-12 flex flex-col items-center justify-center gap-3">
                                <div className="w-8 h-8 border-2 border-[#E50914] border-t-transparent rounded-full animate-spin" />
                                <p className="text-xs text-white/40 uppercase tracking-widest font-bold">Sélection d&apos;une pépite...</p>
                            </div>
                        )}

                        {!surpriseLoading && surpriseContent && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 flex gap-4 items-center mb-6"
                            >
                                {surpriseContent.poster_path && (
                                    <img
                                        src={`https://image.tmdb.org/t/p/w185${surpriseContent.poster_path}`}
                                        alt=""
                                        className="w-20 sm:w-24 aspect-[2/3] object-cover rounded-xl shadow-lg flex-shrink-0"
                                    />
                                )}
                                <div className="flex-1 min-w-0 text-left">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-[#E50914] text-white">
                                            Recommandé
                                        </span>
                                        {surpriseContent.vote_average > 0 && (
                                            <span className="text-xs text-amber-400 font-bold">
                                                ★ {surpriseContent.vote_average.toFixed(1)}
                                            </span>
                                        )}
                                    </div>
                                    <h4 className="text-white font-bold text-base truncate">
                                        {surpriseContent.title || surpriseContent.name}
                                    </h4>
                                    <p className="text-white/60 text-xs line-clamp-2 mt-1 leading-snug">
                                        {surpriseContent.overview}
                                    </p>

                                    <div className="flex items-center gap-2 mt-3">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShowSurpriseModal(false);
                                                navigate(`/${getContentType(surpriseContent)}/${surpriseContent.id}`);
                                            }}
                                            className="px-4 py-2 bg-white text-black font-bold text-xs rounded-xl hover:bg-gray-200 transition-colors uppercase tracking-wider"
                                        >
                                            Voir la fiche
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => pickSurprise(selectedMood)}
                                            className="px-3 py-2 bg-white/10 hover:bg-white/15 text-white font-bold text-xs rounded-xl transition-colors"
                                            title="Autre proposition"
                                        >
                                            Autre idée ↻
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
