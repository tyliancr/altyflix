import { motion } from 'framer-motion';
import { Card, SectionHeader } from './SettingsUI';
import { playHaptic } from '../../utils/interactions';

export default function StatsTab({
    totalTitles,
    estimatedHours,
    completionRate,
    watchHistory,
    setShowClearHistoryModal,
    removeFromHistory,
    t
}) {
    return (
        <motion.div
            key="stats"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
        >
            {/* Statistics grid panel */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                    { label: t('settings.statTitlesSeen'), val: totalTitles, sub: t('settings.statWatchCumulative'), icon: (
                        <svg className="w-5 h-5 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
                        </svg>
                    ) },
                    { label: t('settings.statTimeEst'), val: `${Math.round(estimatedHours)} hrs`, sub: t('settings.statWatchCumulative'), icon: (
                        <svg className="w-5 h-5 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    ) },
                    { label: t('settings.statCompRate'), val: `${completionRate}%`, sub: t('settings.statCompletedDesc'), icon: (
                        <svg className="w-5 h-5 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                    ) },
                    { label: t('settings.statProfileStatus'), val: totalTitles > 15 ? 'Cinéphile' : 'Novice', sub: t('settings.statEngagementLevel'), icon: (
                        <svg className="w-5 h-5 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138z" />
                        </svg>
                    ) }
                ].map((stat, i) => (
                    <div key={i} className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-4 flex flex-col justify-between">
                        <div className="flex justify-between items-start">
                            <span className="text-2xs font-bold uppercase tracking-widest text-white/30">{stat.label}</span>
                            <span>{stat.icon}</span>
                        </div>
                        <div className="mt-3">
                            <p className="text-xl sm:text-2xl font-black text-white">{stat.val}</p>
                            <p className="text-[10px] text-white/40">{stat.sub}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Watch History Interactive List */}
            <Card>
                <SectionHeader
                    icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                    title={t('settings.watchHistoryTitle')}
                    subtitle={t('settings.watchHistoryDesc')}
                    action={
                        watchHistory && watchHistory.length > 0 ? (
                            <button
                                onClick={() => setShowClearHistoryModal(true)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-red-400 hover:text-white bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg transition-all"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                {t('settings.clearAllHistoryBtn')}
                            </button>
                        ) : null
                    }
                />
                <div className="p-6">
                    {watchHistory && watchHistory.length > 0 ? (
                        <div className="divide-y divide-white/[0.05] space-y-4">
                            {watchHistory.map((item, idx) => (
                                <div key={idx} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                                    {/* Cover */}
                                    <div className="w-16 h-10 sm:w-20 sm:h-12 rounded-lg overflow-hidden shrink-0 bg-white/5 border border-white/10">
                                        {item.backdrop_path ? (
                                            <img src={`https://image.tmdb.org/t/p/w185${item.backdrop_path}`} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-[10px] text-white/30">N/A</div>
                                        )}
                                    </div>

                                    {/* Infos */}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs sm:text-sm font-bold text-white truncate">{item.title}</p>
                                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                                            <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 bg-white/5 rounded font-black text-white/40">
                                                {item.type === 'tv' ? 'Série' : 'Film'}
                                            </span>
                                            {item.type === 'tv' && (
                                                <span className="text-[10px] text-white/40">S{item.season} E{item.episode}</span>
                                            )}
                                            <span className="text-[10px] text-white/40">
                                                {new Date(item.lastWatchedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                                            </span>
                                        </div>

                                        {/* Progress bar */}
                                        <div className="w-full max-w-[200px] mt-2">
                                            <div className="h-1 bg-white/10 rounded-full w-full overflow-hidden">
                                                <div className="h-full bg-[#E50914]" style={{ width: `${item.progress || 10}%` }} />
                                            </div>
                                            <span className="text-[8px] text-white/30 font-bold mt-0.5 block">{Math.round(item.progress || 10)}% {t('detail.watched_pct')}</span>
                                        </div>
                                    </div>

                                    {/* Remove */}
                                    <button
                                        onClick={() => { playHaptic(); removeFromHistory(item.contentId); }}
                                        className="p-2 text-white/20 hover:text-[#E50914] rounded-lg hover:bg-white/[0.04] transition-all"
                                        title="Retirer de l'historique"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-10 space-y-3">
                            <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mx-auto">
                                <svg className="w-6 h-6 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <p className="text-white/30 text-xs">{t('settings.historyEmpty')}</p>
                        </div>
                    )}
                </div>
            </Card>
        </motion.div>
    );
}
