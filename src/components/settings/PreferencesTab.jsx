import { motion } from 'framer-motion';
import { Card, SectionHeader, SubmitBtn } from './SettingsUI';
import { SUBTITLE_SIZE_MAP, SUBTITLE_COLOR_MAP } from './SettingsConstants';

export default function PreferencesTab({
    handlePreferencesSave,
    autoplayNext,
    setAutoplayNext,
    autoplayTrailers,
    setAutoplayTrailers,
    preferredAudio,
    setPreferredAudio,
    videoQuality,
    setVideoQuality,
    subtitlesSize,
    setSubtitlesSize,
    subtitlesColor,
    setSubtitlesColor,
    loading,
    t
}) {
    return (
        <motion.div
            key="preferences"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
        >
            <Card>
                <SectionHeader
                    icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                    title={t('settings.playPreferences')}
                    subtitle={t('settings.playPreferencesDesc')}
                />
                <form onSubmit={handlePreferencesSave} className="p-6 space-y-6">
                    
                    {/* Autoplay toggles */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between gap-6 p-4 rounded-2xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.03] transition-colors">
                            <div>
                                <p className="text-sm font-semibold text-white">{t('settings.autoplayNextEp')}</p>
                                <p className="text-[11px] text-white/40 mt-0.5 leading-relaxed">{t('settings.autoplayNextEpDesc')}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setAutoplayNext(!autoplayNext)}
                                className={`relative shrink-0 w-11 h-6 rounded-full border transition-all duration-300 ${autoplayNext ? 'bg-[#E50914] border-[#E50914]/50' : 'bg-white/10 border-white/10'}`}
                            >
                                <motion.div
                                    animate={{ x: autoplayNext ? 20 : 2 }}
                                    className="absolute top-1 w-4 h-4 bg-white rounded-full shadow"
                                />
                            </button>
                        </div>

                        <div className="flex items-center justify-between gap-6 p-4 rounded-2xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.03] transition-colors">
                            <div>
                                <p className="text-sm font-semibold text-white">{t('settings.autoplayTrailers')}</p>
                                <p className="text-[11px] text-white/40 mt-0.5 leading-relaxed">{t('settings.autoplayTrailersDesc')}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setAutoplayTrailers(!autoplayTrailers)}
                                className={`relative shrink-0 w-11 h-6 rounded-full border transition-all duration-300 ${autoplayTrailers ? 'bg-[#E50914] border-[#E50914]/50' : 'bg-white/10 border-white/10'}`}
                            >
                                <motion.div
                                    animate={{ x: autoplayTrailers ? 20 : 2 }}
                                    className="absolute top-1 w-4 h-4 bg-white rounded-full shadow"
                                />
                            </button>
                        </div>
                    </div>

                    {/* Audio and Video Quality Preferences */}
                    <div className="grid sm:grid-cols-2 gap-4 max-w-xl">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">{t('settings.preferredAudio')}</label>
                            <select 
                                value={preferredAudio}
                                onChange={e => setPreferredAudio(e.target.value)}
                                className="w-full px-4 py-3 bg-white/[0.04] border border-white/10 rounded-2xl text-xs text-white outline-none focus:border-white/30 cursor-pointer"
                            >
                                <option className="bg-[#111]" value="VF">🇫🇷 VF (Version Française)</option>
                                <option className="bg-[#111]" value="VOST">🇬🇧 VOST (Version Originale)</option>
                            </select>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">{t('settings.preferredQuality')}</label>
                            <select 
                                value={videoQuality}
                                onChange={e => setVideoQuality(e.target.value)}
                                className="w-full px-4 py-3 bg-white/[0.04] border border-white/10 rounded-2xl text-xs text-white outline-none focus:border-white/30 cursor-pointer"
                            >
                                <option className="bg-[#111]" value="auto">Auto (4K / Best Available)</option>
                                <option className="bg-[#111]" value="1080p">1080p (FHD)</option>
                                <option className="bg-[#111]" value="720p">720p (HD)</option>
                            </select>
                        </div>
                    </div>

                    {/* ── Subtitle Controls ── */}
                    <div className="space-y-4">
                        <div className="grid sm:grid-cols-2 gap-4">
                            {/* Subtitle Size */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">{t('settings.subtitleSizeLabel')}</label>
                                <select
                                    value={subtitlesSize}
                                    onChange={e => setSubtitlesSize(e.target.value)}
                                    className="w-full px-4 py-3 bg-white/[0.04] border border-white/10 rounded-2xl text-xs text-white outline-none focus:border-white/30 cursor-pointer"
                                >
                                    {Object.entries(SUBTITLE_SIZE_MAP).map(([key, val]) => (
                                        <option key={key} value={key} className="bg-[#111]">{val.label}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Subtitle Color */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">{t('settings.subtitleColorLabel')}</label>
                                <div className="flex items-center gap-2 flex-wrap">
                                    {Object.entries(SUBTITLE_COLOR_MAP).map(([key, hex]) => (
                                        <button
                                            key={key}
                                            type="button"
                                            onClick={() => setSubtitlesColor(key)}
                                            title={key}
                                            className={`w-8 h-8 rounded-full border-2 transition-all duration-200 ${subtitlesColor === key ? 'scale-110 border-white shadow-lg' : 'border-white/20 hover:border-white/50'}`}
                                            style={{ backgroundColor: hex }}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Real-time subtitle preview */}
                        <div className="rounded-2xl overflow-hidden border border-white/10">
                            <div className="bg-white/[0.02] px-3 py-1.5 border-b border-white/[0.06] flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-red-500/60" />
                                <div className="w-2 h-2 rounded-full bg-yellow-500/60" />
                                <div className="w-2 h-2 rounded-full bg-green-500/60" />
                                <span className="text-[9px] text-white/30 ml-1 uppercase tracking-widest">{t('settings.subtitlePreviewTitle')}</span>
                            </div>
                            <div
                                className="relative flex items-end justify-center pb-6 pt-12"
                                style={{
                                    background: 'linear-gradient(180deg, #0a0a0f 0%, #1a1a2e 50%, #0a0a0f 100%)',
                                    minHeight: '120px'
                                }}
                            >
                                {/* Fake video scene elements */}
                                <div className="absolute inset-0 opacity-20">
                                    <div className="absolute top-4 left-8 w-16 h-10 rounded bg-white/5 border border-white/5" />
                                    <div className="absolute top-6 right-12 w-8 h-16 rounded-full bg-white/5 border border-white/5" />
                                    <div className="absolute bottom-10 left-1/4 w-20 h-6 rounded bg-white/5 border border-white/5" />
                                </div>
                                <motion.p
                                    key={`${subtitlesSize}-${subtitlesColor}`}
                                    initial={{ opacity: 0, y: 4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.25 }}
                                    className="relative z-10 font-bold text-center px-4 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]"
                                    style={{
                                        fontSize: SUBTITLE_SIZE_MAP[subtitlesSize]?.fontSize || '16px',
                                        color: SUBTITLE_COLOR_MAP[subtitlesColor] || '#FFFFFF',
                                        textShadow: '0 2px 8px rgba(0,0,0,0.9)',
                                    }}
                                >
                                    {t('settings.subtitlePreviewText')}
                                </motion.p>
                            </div>
                        </div>
                    </div>

                    {/* Notice */}
                    <div className="flex gap-3 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs leading-relaxed">
                        <svg className="w-5 h-5 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4" />
                        </svg>
                        <p className="text-white/60">{t('settings.functionalPrefNotice')}</p>
                    </div>

                    <SubmitBtn loading={loading} label={t('settings.save')} />
                </form>
            </Card>
        </motion.div>
    );
}
