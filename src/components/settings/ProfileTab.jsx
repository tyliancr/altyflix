import { motion, AnimatePresence } from 'framer-motion';
import { Card, SectionHeader, Field, SubmitBtn } from './SettingsUI';
import { LANGUAGES } from './SettingsConstants';
import { playHaptic } from '../../utils/interactions';

export default function ProfileTab({
    handleProfileSave,
    selectedAvatar,
    setShowAvatarSelector,
    profileName,
    setProfileName,
    pinCode,
    setPinCode,
    isKid,
    setIsKid,
    selectedLanguage,
    setSelectedLanguage,
    isLangOpen,
    setIsLangOpen,
    currentLang,
    loading,
    t
}) {
    return (
        <motion.div
            key="profile"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
        >
            <Card>
                <SectionHeader
                    icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>}
                    title={t('settings.platformSettings')}
                    subtitle={t('settings.platformSettingsDesc')}
                />
                <form onSubmit={handleProfileSave} className="p-6 space-y-6">
                    <div className="flex flex-col sm:flex-row gap-6 items-center sm:items-start">
                        {/* Avatar block with interactive selector */}
                        <div 
                            className="group relative shrink-0 w-24 h-24 rounded-2xl overflow-hidden cursor-pointer ring-2 ring-white/10 hover:ring-[#E50914]/50 transition-all shadow-[0_12px_24px_rgba(0,0,0,0.5)]"
                            onClick={() => { playHaptic(); setShowAvatarSelector(true); }}
                        >
                            <img src={selectedAvatar} alt="Profile Icon" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
                                </svg>
                            </div>
                        </div>

                        <div className="flex-1 w-full space-y-4">
                            <Field
                                label={t('settings.profileNameLabel')}
                                value={profileName}
                                onChange={e => setProfileName(e.target.value)}
                                required
                                maxLength={15}
                            />
                            <Field
                                label={t('settings.pinCodeLabel')}
                                type="password"
                                value={pinCode}
                                onChange={e => setPinCode(e.target.value.replace(/\D/g, '').substring(0, 4))}
                                maxLength={4}
                            />
                        </div>
                    </div>

                    {/* Kids toggle */}
                    <button
                        type="button"
                        onClick={() => setIsKid(!isKid)}
                        className="flex items-center justify-between w-full p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] transition-all"
                    >
                        <div className="flex items-center gap-3">
                            <span className="text-xl text-white/60">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </span>
                            <div className="text-left">
                                <p className="text-sm font-semibold text-white">{t('settings.kidProfile')}</p>
                                <p className="text-[11px] text-white/40">{t('settings.kidProfileDesc')}</p>
                            </div>
                        </div>
                        <div className={`relative w-11 h-6 rounded-full border transition-all duration-300 ${isKid ? 'bg-[#E50914] border-[#E50914]/50' : 'bg-white/10 border-white/10'}`}>
                            <motion.div
                                animate={{ x: isKid ? 20 : 2 }}
                                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                                className="absolute top-1 w-4 h-4 bg-white rounded-full shadow"
                            />
                        </div>
                    </button>

                    {/* Lang picker */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">{t('settings.contentLanguage')}</label>
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setIsLangOpen(!isLangOpen)}
                                className="w-full flex items-center justify-between px-4 py-3.5 bg-white/[0.04] border border-white/10 rounded-2xl hover:bg-white/[0.07] transition-all text-sm font-medium"
                            >
                                <span className="flex items-center gap-3">
                                    <span className="text-[10px] font-extrabold bg-white/10 px-1.5 py-0.5 rounded tracking-wide border border-white/5 text-white/60">{currentLang.flag}</span>
                                    {currentLang.name}
                                </span>
                                <svg className={`w-4 h-4 text-white/40 transition-transform duration-200 ${isLangOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7"/>
                                </svg>
                            </button>

                            <AnimatePresence>
                                {isLangOpen && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -8 }}
                                        className="absolute top-[calc(100%+6px)] left-0 w-full bg-[#111116] border border-white/10 rounded-2xl overflow-hidden shadow-2xl z-[9999] py-1"
                                    >
                                        {LANGUAGES.map(lang => (
                                            <button
                                                key={lang.code}
                                                type="button"
                                                onClick={() => { playHaptic(); setSelectedLanguage(lang.code); setIsLangOpen(false); }}
                                                className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors ${selectedLanguage === lang.code ? 'bg-[#E50914]/15 text-white font-semibold' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
                                            >
                                                <span className="text-[10px] font-extrabold bg-white/10 px-1.5 py-0.5 rounded tracking-wide border border-white/5 text-white/60">{lang.flag}</span>
                                                <span>{lang.name}</span>
                                            </button>
                                        ))}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                    <SubmitBtn loading={loading} label={t('settings.save')} />
                </form>
            </Card>
        </motion.div>
    );
}
