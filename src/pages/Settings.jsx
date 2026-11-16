import { useState, useEffect, useCallback, useMemo } from 'react';
import { fadeIn } from '../utils/animations';
import { useAuth } from '../contexts/AuthContext';
import { useProfile } from '../contexts/ProfileContext';
import { deleteUser, verifyBeforeUpdateEmail, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { motion, AnimatePresence } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { Link, useNavigate } from 'react-router-dom';
import { playHaptic } from '../utils/interactions';
import AvatarSelector from '../components/settings/AvatarSelector';
import { db } from '../config/firebase';
import { doc, getDoc } from 'firebase/firestore';
import tmdb from '../services/tmdb';
import { useTranslation } from '../hooks/useTranslation';

// Modular Settings Components
import { Toast, ConfirmModal } from '../components/settings/SettingsUI';
import { LANGUAGES } from '../components/settings/SettingsConstants';
import ProfileTab from '../components/settings/ProfileTab';
import PreferencesTab from '../components/settings/PreferencesTab';
import AccountTab from '../components/settings/AccountTab';
import StatsTab from '../components/settings/StatsTab';
import DiagnosticsTab from '../components/settings/DiagnosticsTab';

/* ─── Main Page ────────────────────────────────────────────────── */
const Settings = () => {
    const { currentUser, logout } = useAuth();
    const { currentProfile, updateProfile, watchHistory, removeFromHistory, clearWatchHistory } = useProfile();
    const { t } = useTranslation();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });
    const [activeTab, setActiveTab] = useState('profile');
    const [showClearHistoryModal, setShowClearHistoryModal] = useState(false);

    // Profile Settings States
    const [profileName, setProfileName] = useState(() => currentProfile?.name || '');
    const [isKid, setIsKid] = useState(() => currentProfile?.isKid || false);
    const [pinCode, setPinCode] = useState(() => currentProfile?.pin || '');
    const [selectedAvatar, setSelectedAvatar] = useState(() => currentProfile?.avatar || '');
    const [selectedLanguage, setSelectedLanguage] = useState(() => currentProfile?.language || 'fr');
    const [isLangOpen, setIsLangOpen] = useState(false);
    const [showAvatarSelector, setShowAvatarSelector] = useState(false);

    // Preferences Settings States
    const [autoplayTrailers, setAutoplayTrailers] = useState(() => currentProfile?.autoplayTrailers !== false);
    const [autoplayNext, setAutoplayNext] = useState(() => currentProfile?.autoplayNext !== false);
    const [subtitlesSize, setSubtitlesSize] = useState(() => currentProfile?.subtitlesSize || 'medium');
    const [subtitlesColor, setSubtitlesColor] = useState(() => currentProfile?.subtitlesColor || 'white');
    const [videoQuality, setVideoQuality] = useState(() => currentProfile?.videoQuality || 'auto');
    const [preferredAudio, setPreferredAudio] = useState(() => currentProfile?.preferredAudio || (currentProfile?.language === 'en' ? 'VOST' : 'VF'));

    // Account & Security States
    const [emailForm, setEmailForm] = useState({ newEmail: '', password: '' });
    const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });

    // Live Diagnostics States
    const [firestorePing, setFirestorePing] = useState({ status: 'checking', ms: 0 });
    const [tmdbPing, setTmdbPing] = useState({ status: 'checking', ms: 0 });
    const [pwaStatus, setPwaStatus] = useState('checking');
    const [httpsStatus, setHttpsStatus] = useState(false);
    const [loadTime, setLoadTime] = useState(0);
    const [diagnosticsRunning, setDiagnosticsRunning] = useState(false);

    // Synchronize if profile changes
    useEffect(() => {
        if (currentProfile) {
            setProfileName(currentProfile.name || '');
            setSelectedAvatar(currentProfile.avatar || '');
            setIsKid(currentProfile.isKid || false);
            setPinCode(currentProfile.pin || '');
            setSelectedLanguage(currentProfile.language || 'fr');

            // Load Preferences
            setAutoplayTrailers(currentProfile.autoplayTrailers !== false);
            setAutoplayNext(currentProfile.autoplayNext !== false);
            setSubtitlesSize(currentProfile.subtitlesSize || 'medium');
            setSubtitlesColor(currentProfile.subtitlesColor || 'white');
            setVideoQuality(currentProfile.videoQuality || 'auto');
            setPreferredAudio(currentProfile.preferredAudio || (currentProfile.language === 'en' ? 'VOST' : 'VF'));
        }
        // Load actual timing
        if (window.performance && window.performance.timing) {
            const perfTime = window.performance.timing;
            const diff = perfTime.loadEventEnd - perfTime.navigationStart;
            setLoadTime(diff > 0 ? diff : 380);
        }
    }, [currentProfile]);

    /* ─── Diagnostics runner (extracted & re-usable) ─── */
    const runDiagnostics = useCallback(async () => {
        setDiagnosticsRunning(true);
        setFirestorePing({ status: 'checking', ms: 0 });
        setTmdbPing({ status: 'checking', ms: 0 });
        setPwaStatus('checking');

        // Dynamic HTTPS check
        const isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        setHttpsStatus(isSecure);

        // Test Firestore Connectivity
        const testFirestore = async () => {
            const start = performance.now();
            try {
                const testRef = doc(db, 'profiles', currentProfile?.id || 'test');
                await getDoc(testRef);
                const end = performance.now();
                setFirestorePing({ status: 'success', ms: Math.round(end - start) });
            } catch {
                setFirestorePing({ status: 'error', ms: 0 });
            }
        };

        // Test TMDB API Latency
        const testTMDB = async () => {
            const start = performance.now();
            try {
                await tmdb.getMovieDetails(550); // Fight Club as test probe
                const end = performance.now();
                setTmdbPing({ status: 'success', ms: Math.round(end - start) });
            } catch {
                setTmdbPing({ status: 'error', ms: 0 });
            }
        };

        // Check PWA service worker
        const checkPWA = () => {
            if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                setPwaStatus('active');
            } else {
                setPwaStatus('inactive');
            }
        };

        await Promise.all([testFirestore(), testTMDB()]);
        checkPWA();
        setDiagnosticsRunning(false);
    }, [currentProfile]);

    // Auto-run when switching to diagnostics tab
    useEffect(() => {
        if (activeTab === 'diagnostics') {
            runDiagnostics();
        }
    }, [activeTab, runDiagnostics]);

    const triggerToast = (type, text) => {
        setMessage({ type, text });
        setTimeout(() => setMessage({ type: '', text: '' }), 5000);
    };

    // Save profile information
    const handleProfileSave = async (e) => {
        e.preventDefault();
        if (!profileName.trim()) return;
        setLoading(true);
        try {
            const langChanged = currentProfile.language !== selectedLanguage;
            const result = await updateProfile(currentProfile.id, {
                name: profileName,
                avatar: selectedAvatar,
                isKid,
                pin: pinCode,
                language: selectedLanguage,
            });
            if (!result.success) throw new Error(result.error || 'Sauvegarde refusée.');
            triggerToast('success', t('settings.saveProfileSuccess'));
            if (langChanged) {
                setTimeout(() => window.location.reload(), 1000);
            }
        } catch (error) {
            triggerToast('error', error.message || 'Erreur lors de la sauvegarde.');
        } finally {
            setLoading(false);
        }
    };

    // Save Preferences (wrapped in form submit handler)
    const handlePreferencesSave = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const result = await updateProfile(currentProfile.id, {
                autoplayTrailers,
                autoplayNext,
                subtitlesSize,
                subtitlesColor,
                videoQuality,
                preferredAudio
            });
            if (!result.success) throw new Error(result.error || 'Sauvegarde refusée.');
            triggerToast('success', t('settings.savePreferencesSuccess'));
        } catch {
            triggerToast('error', 'Erreur de sauvegarde des préférences.');
        } finally {
            setLoading(false);
        }
    };

    const handleEmailChange = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const credential = EmailAuthProvider.credential(currentUser.email, emailForm.password);
            await reauthenticateWithCredential(currentUser, credential);
            await verifyBeforeUpdateEmail(currentUser, emailForm.newEmail);
            triggerToast('success', t('settings.emailChangeSuccess'));
            setEmailForm({ newEmail: '', password: '' });
        } catch (error) {
            triggerToast('error', error.message);
        } finally {
            setLoading(false);
        }
    };

    const handlePasswordChange = async (e) => {
        e.preventDefault();
        setLoading(true);
        if (passwordForm.newPassword !== passwordForm.confirmPassword) {
            triggerToast('error', t('settings.passwordMismatch'));
            setLoading(false);
            return;
        }
        try {
            const credential = EmailAuthProvider.credential(currentUser.email, passwordForm.currentPassword);
            await reauthenticateWithCredential(currentUser, credential);
            await updatePassword(currentUser, passwordForm.newPassword);
            triggerToast('success', t('settings.passwordChangeSuccess'));
            setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
        } catch (error) {
            triggerToast('error', error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteAccount = async () => {
        if (window.confirm(t('settings.deleteConfirmPrompt'))) {
            try {
                await deleteUser(currentUser);
                await logout();
                navigate('/');
            } catch {
                triggerToast('error', t('settings.deleteReauthError'));
            }
        }
    };

    const handleClearHistory = async () => {
        setShowClearHistoryModal(false);
        await clearWatchHistory();
    };

    // Calculate Dynamic Stats (Memoized to prevent render latency)
    const { totalTitles, completionRate, estimatedHours } = useMemo(() => {
        const total = watchHistory?.length || 0;
        const completed = watchHistory?.filter(item => item.progress >= 90).length || 0;
        const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
        const hours = watchHistory?.reduce((acc, item) => {
            const itemWeight = item.type === 'tv' ? 0.75 : 1.8;
            const watchFraction = (item.progress || 20) / 100;
            return acc + (itemWeight * watchFraction);
        }, 0) || 0;
        return { totalTitles: total, completionRate: rate, estimatedHours: hours };
    }, [watchHistory]);

    const tabs = [
        {
            id: 'profile',
            label: t('settings.profileTab'),
            icon: (
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
            )
        },
        {
            id: 'preferences',
            label: t('settings.preferencesTab'),
            icon: (
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
            )
        },
        {
            id: 'account',
            label: t('settings.accountTab'),
            icon: (
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
            )
        },
        {
            id: 'stats',
            label: t('settings.statsTab'),
            icon: (
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
            )
        },
        {
            id: 'diagnostics',
            label: t('settings.diagnosticsTab'),
            icon: (
                <svg className="w-4 h-4 shrink-0 text-emerald-400 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
            )
        }
    ];

    const currentLang = LANGUAGES.find(l => l.code === selectedLanguage) || LANGUAGES[0];

    return (
        <div className="min-h-screen bg-[#07070A] text-white pt-28 pb-24 selection:bg-[#E50914]/30 select-none">
            <Helmet>
                <title>{t('settings.title')} - ALTYFLIX</title>
                <meta name="robots" content="noindex" />
            </Helmet>

            {/* Premium Ambient Background */}
            <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[140vw] h-[60vh] bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(229,9,20,0.1),transparent)] blur-xl" />
                <div className="absolute bottom-0 right-10 w-[40vw] h-[40vw] bg-[radial-gradient(circle_at_center,rgba(0,255,100,0.015),transparent_60%)]" />
            </div>

            <main className="container-ALTYFLIX max-w-5xl relative z-10 px-4 sm:px-6">
                <motion.div variants={fadeIn} initial="hidden" animate="visible">
                    
                    {/* Header */}
                    <div className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight font-display bg-gradient-to-r from-white via-white to-white/60 bg-clip-text text-transparent">
                                {t('settings.title')}
                            </h1>
                            <p className="text-white/40 text-xs sm:text-sm mt-1">{t('settings.subtitle')}</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <Link to="/profiles" onClick={() => playHaptic()} className="px-4 py-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-xs font-bold tracking-wider uppercase rounded-xl transition-all flex items-center gap-2">
                                <svg className="w-3.5 h-3.5 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                {t('nav.switchProfile')}
                            </Link>
                        </div>
                    </div>

                    {/* Toast Alert */}
                    <AnimatePresence mode="wait">
                        {message.text && <Toast key={message.text} message={message} />}
                    </AnimatePresence>

                    {/* Main Layout Grid */}
                    <div className="flex flex-col lg:flex-row gap-8 items-start">
                        
                        {/* ── Sidebar Navigation ── */}
                        <aside className="w-full lg:w-64 shrink-0">
                            {/* Profile Mini Badge Card */}
                            <div className="flex items-center gap-3 px-4 py-3 mb-5 rounded-2xl bg-white/[0.03] border border-white/[0.05] backdrop-blur-md">
                                <div className="relative shrink-0">
                                    <div className="w-10 h-10 rounded-xl overflow-hidden border border-white/15 shadow-md">
                                        <img src={selectedAvatar || currentProfile?.avatar} alt="Avatar" className="w-full h-full object-cover" />
                                    </div>
                                    <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border-[2.5px] border-[#07070A]" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-xs font-bold text-white truncate">{profileName || currentProfile?.name}</p>
                                    <span className="text-[9px] uppercase tracking-widest text-[#E50914] font-black">{isKid ? t('settings.kidProfile') : 'Standard'}</span>
                                </div>
                            </div>

                            {/* Tabs list */}
                            <nav className="flex lg:flex-col gap-1.5 overflow-x-auto no-scrollbar pb-3 lg:pb-0 w-full">
                                {tabs.map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => { playHaptic(); setActiveTab(tab.id); }}
                                        className={`
                                            relative flex items-center gap-3.5 px-4 py-3 rounded-xl
                                            text-xs font-bold tracking-wide uppercase transition-all duration-200
                                            whitespace-nowrap lg:whitespace-normal w-auto lg:w-full text-left
                                            ${activeTab === tab.id ? 'text-white bg-white/[0.04] border border-white/10' : 'text-white/40 hover:text-white/70'}
                                        `}
                                    >
                                        <span className={`transition-colors duration-200 ${activeTab === tab.id ? 'text-[#E50914]' : 'text-white/30'}`}>
                                            {tab.icon}
                                        </span>
                                        <span>{tab.label}</span>
                                        {activeTab === tab.id && (
                                            <motion.div
                                                layoutId="active-nav-line"
                                                className="absolute right-3 w-1.5 h-1.5 bg-[#E50914] rounded-full hidden lg:block"
                                            />
                                        )}
                                    </button>
                                ))}
                            </nav>
                        </aside>

                        {/* ── Active Dashboard Panel ── */}
                        <div className="flex-1 w-full min-w-0 space-y-6">
                            <AnimatePresence mode="wait">

                                {/* ════ Onglet 1 : Profil Actif ════ */}
                                {activeTab === 'profile' && (
                                    <ProfileTab
                                        key="profile"
                                        handleProfileSave={handleProfileSave}
                                        selectedAvatar={selectedAvatar}
                                        setShowAvatarSelector={setShowAvatarSelector}
                                        profileName={profileName}
                                        setProfileName={setProfileName}
                                        pinCode={pinCode}
                                        setPinCode={setPinCode}
                                        isKid={isKid}
                                        setIsKid={setIsKid}
                                        selectedLanguage={selectedLanguage}
                                        setSelectedLanguage={setSelectedLanguage}
                                        isLangOpen={isLangOpen}
                                        setIsLangOpen={setIsLangOpen}
                                        currentLang={currentLang}
                                        loading={loading}
                                        t={t}
                                    />
                                )}

                                {/* ════ Onglet 2 : Préférences de lecture ════ */}
                                {activeTab === 'preferences' && (
                                    <PreferencesTab
                                        key="preferences"
                                        handlePreferencesSave={handlePreferencesSave}
                                        autoplayNext={autoplayNext}
                                        setAutoplayNext={setAutoplayNext}
                                        autoplayTrailers={autoplayTrailers}
                                        setAutoplayTrailers={setAutoplayTrailers}
                                        preferredAudio={preferredAudio}
                                        setPreferredAudio={setPreferredAudio}
                                        videoQuality={videoQuality}
                                        setVideoQuality={setVideoQuality}
                                        subtitlesSize={subtitlesSize}
                                        setSubtitlesSize={setSubtitlesSize}
                                        subtitlesColor={subtitlesColor}
                                        setSubtitlesColor={setSubtitlesColor}
                                        loading={loading}
                                        t={t}
                                    />
                                )}

                                {/* ════ Onglet 3 : Compte & Sécurité ════ */}
                                {activeTab === 'account' && (
                                    <AccountTab
                                        key="account"
                                        handleEmailChange={handleEmailChange}
                                        emailForm={emailForm}
                                        setEmailForm={setEmailForm}
                                        handlePasswordChange={handlePasswordChange}
                                        passwordForm={passwordForm}
                                        setPasswordForm={setPasswordForm}
                                        handleDeleteAccount={handleDeleteAccount}
                                        loading={loading}
                                        t={t}
                                    />
                                )}

                                {/* ════ Onglet 4 : Stats & Historique ════ */}
                                {activeTab === 'stats' && (
                                    <StatsTab
                                        key="stats"
                                        totalTitles={totalTitles}
                                        estimatedHours={estimatedHours}
                                        completionRate={completionRate}
                                        watchHistory={watchHistory}
                                        setShowClearHistoryModal={setShowClearHistoryModal}
                                        removeFromHistory={removeFromHistory}
                                        t={t}
                                    />
                                )}

                                {/* ════ Onglet 5 : Diagnostics & Audit de Production ════ */}
                                {activeTab === 'diagnostics' && (
                                    <DiagnosticsTab
                                        key="diagnostics"
                                        loadTime={loadTime}
                                        diagnosticsRunning={diagnosticsRunning}
                                        runDiagnostics={runDiagnostics}
                                        firestorePing={firestorePing}
                                        tmdbPing={tmdbPing}
                                        pwaStatus={pwaStatus}
                                        httpsStatus={httpsStatus}
                                        t={t}
                                    />
                                )}

                            </AnimatePresence>
                        </div>

                    </div>
                </motion.div>
            </main>

            {/* Avatar Selector Modal */}
            <AnimatePresence>
                {showAvatarSelector && (
                    <AvatarSelector
                        currentAvatar={selectedAvatar}
                        profileName={profileName || currentProfile?.name || 'NOUVEAU PROFIL'}
                        onSelect={avatar => { setSelectedAvatar(avatar); setShowAvatarSelector(false); }}
                        onClose={() => setShowAvatarSelector(false)}
                    />
                )}
            </AnimatePresence>

            {/* Clear History Confirmation Modal */}
            <AnimatePresence>
                {showClearHistoryModal && (
                    <ConfirmModal
                        message={t('settings.clearHistoryConfirm')}
                        onConfirm={handleClearHistory}
                        onCancel={() => setShowClearHistoryModal(false)}
                        confirmLabel={t('settings.clearAllHistoryBtn')}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

export default Settings;
