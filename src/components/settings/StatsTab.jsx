import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Card, SectionHeader } from './SettingsUI';
import { playHaptic } from '../../utils/interactions';
import Icon from '../ui/Icons';

/** Small progress ring used for the completion rate. */
const Ring = ({ value }) => (
    <svg viewBox="0 0 36 36" className="h-11 w-11 -rotate-90" aria-hidden="true">
        <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
        <motion.circle
            cx="18" cy="18" r="15.5" fill="none" stroke="#E50914" strokeWidth="3" strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: Math.max(0, Math.min(1, value / 100)) }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        />
    </svg>
);

export default function StatsTab({
    totalTitles,
    estimatedHours,
    completionRate,
    watchHistory,
    setShowClearHistoryModal,
    removeFromHistory,
    t
}) {
    const stats = [
        { label: t('settings.statTitlesSeen'), value: totalTitles, icon: <Icon name="film" /> },
        { label: t('settings.statTimeEst'), value: `${Math.round(estimatedHours)} h`, icon: <Icon name="clock" /> },
        { label: t('settings.statCompRate'), value: `${completionRate} %`, icon: <Ring value={completionRate} /> },
    ];
    const history = watchHistory || [];

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.22 }}
            className="space-y-6"
        >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {stats.map((stat, i) => (
                    <motion.div
                        key={stat.label}
                        initial={{ opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
                        className="flex items-center justify-between gap-4 rounded-3xl border border-white/[0.08] bg-white/[0.03] p-5"
                    >
                        <div className="min-w-0">
                            <p className="font-display text-3xl font-bold tracking-tight text-white">{stat.value}</p>
                            <p className="mt-1 truncate text-[13px] text-white/50">{stat.label}</p>
                        </div>
                        <span className="flex-none text-white/40">{stat.icon}</span>
                    </motion.div>
                ))}
            </div>

            <Card>
                <SectionHeader
                    icon={<Icon name="clock" />}
                    title={t('settings.watchHistoryTitle')}
                    subtitle={t('settings.watchHistoryDesc')}
                    action={history.length > 0 && (
                        <button
                            type="button"
                            onClick={() => setShowClearHistoryModal(true)}
                            className="flex h-9 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-3.5 text-[13px] font-semibold text-white/75 transition-colors hover:border-[#E50914]/60 hover:text-[#ff5a63]"
                        >
                            <Icon name="trash" className="h-4 w-4" />
                            <span className="hidden sm:inline">{t('settings.clearAllHistoryBtn')}</span>
                        </button>
                    )}
                />
                {history.length > 0 ? (
                    <ul className="divide-y divide-white/[0.07]">
                        {history.map(item => {
                            const title = item.title || item.name;
                            const isTv = item.type === 'tv';
                            const progress = Math.round(item.progress || 0);
                            const when = item.lastWatchedAt || item.timestamp;
                            const meta = [
                                isTv ? `S${item.season || 1} · E${item.episode || 1}` : 'Film',
                                when && new Date(when).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
                                progress >= 90 ? 'Terminé' : `${progress} %`,
                            ].filter(Boolean).join(' · ');

                            return (
                                <li key={`${item.type}-${item.contentId}`} className="group flex items-center gap-4 px-6 py-3.5 transition-colors hover:bg-white/[0.025]">
                                    <Link to={`/${isTv ? 'tv' : 'movie'}/${item.contentId}`} className="relative aspect-video w-28 flex-none overflow-hidden rounded-lg bg-[#101016] ring-1 ring-inset ring-white/[0.07]">
                                        {item.backdrop_path && (
                                            <img src={`https://image.tmdb.org/t/p/w300${item.backdrop_path}`} alt="" loading="lazy" className="h-full w-full object-cover" />
                                        )}
                                        <span className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
                                            <span className="block h-full bg-[#E50914]" style={{ width: `${Math.min(100, Math.max(progress, 4))}%` }} />
                                        </span>
                                    </Link>
                                    <div className="min-w-0 flex-1">
                                        <Link to={`/${isTv ? 'tv' : 'movie'}/${item.contentId}`} className="block truncate text-[15px] font-semibold text-white hover:underline">
                                            {title}
                                        </Link>
                                        <p className="mt-0.5 truncate text-[13px] text-white/50">{meta}</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => { playHaptic(); removeFromHistory(item.contentId); }}
                                        aria-label={`Retirer ${title} de l’historique`}
                                        className="grid h-9 w-9 flex-none place-items-center rounded-full text-white/35 transition-colors hover:bg-white/10 hover:text-white"
                                    >
                                        <Icon name="close" className="h-4 w-4" strokeWidth={2.2} />
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                ) : (
                    <div className="px-6 py-14 text-center">
                        <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full border border-white/10 bg-white/5 text-white/40">
                            <Icon name="clock" className="h-6 w-6" />
                        </span>
                        <p className="text-sm text-white/50">{t('settings.historyEmpty')}</p>
                    </div>
                )}
            </Card>
        </motion.div>
    );
}
