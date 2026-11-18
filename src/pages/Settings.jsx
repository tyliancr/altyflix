import { useState, useEffect, useCallback, useMemo } from 'react';
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
import Icon from '../components/ui/Icons';
import { getGatewayConfig, saveGatewayConfig } from '../services/streamingGateway';

// Modular Settings Components
import { Toast, ConfirmModal } from '../components/settings/SettingsUI';
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
    const [showDeleteModal, setShowDeleteModal] = useState(false);

    // Profile Settings States
    const [profileName, setProfileName] = useState(() => currentProfile?.name || '');
    const [isKid, setIsKid] = useState(() => currentProfile?.isKid || false);
    const [pinCode, setPinCode] = useState(() => currentProfile?.pin || '');
    const [selectedAvatar, setSelectedAvatar] = useState(() => currentProfile?.avatar || '');
    const [selectedLanguage, setSelectedLanguage] = useState(() => currentProfile?.language || 'fr');
    const [showAvatarSelector, setShowAvatarSelector] = useState(false);

    // Preferences Settings States
    const [autoplayTrailers, setAutoplayTrailers] = useState(() => currentProfile?.autoplayTrailers !== false);
    const [autoplayNext, setAutoplayNext] = useState(() => currentProfile?.autoplayNext !== false);
    const [subtitlesAlwaysOn, setSubtitlesAlwaysOn] = useState(() => {
        const local = typeof localStorage !== 'undefined' ? localStorage.getItem('altyflix_subtitles_always_on') : null;
        if (local !== null) return local === 'true';
        return currentProfile?.subtitlesAlwaysOn !== false;
    });
    const [subtitlesSize, setSubtitlesSize] = useState(() => currentProfile?.subtitlesSize || 'medium');
    const [subtitlesColor, setSubtitlesColor] = useState(() => currentProfile?.subtitlesColor || 'white');
    const [videoQuality, setVideoQuality] = useState(() => currentProfile?.videoQuality || 'auto');
    const [preferredAudio, setPreferredAudio] = useState(() => currentProfile?.preferredAudio || (currentProfile?.language === 'en' ? 'VOST' : 'VF'));

    // Debrid & Sources Streaming States
    const [debridProvider, setDebridProvider] = useState(() => getGatewayConfig().provider || 'torbox');
    const [debridToken, setDebridToken] = useState(() => getGatewayConfig().token || '');
    const [frenchioUrl, setFrenchioUrl] = useState(() => getGatewayConfig().frenchioUrl || '');

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
            setSubtitlesAlwaysOn(() => {
                const local = typeof localStorage !== 'undefined' ? localStorage.getItem('altyflix_subtitles_always_on') : null;
                if (local !== null) return local === 'true';
                return currentProfile.subtitlesAlwaysOn !== false;
            });
            setSubtitlesSize(currentProfile.subtitlesSize || 'medium');
            setSubtitlesColor(currentProfile.subtitlesColor || 'white');
            setVideoQuality(currentProfile.videoQuality || 'auto');
            setPreferredAudio(currentProfile.preferredAudio || (currentProfile.language === 'en' ? 'VOST' : 'VF'));
        }
        // Load actual timing
        if (window.performance && window.performance.timing) {
            const perfTime = window.performance.timing;
            const diff = perfTime.loadEventEnd - perfTime.navigationStart;
            setLoadTime(diff > 0 ? diff : 0);
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
                subtitlesAlwaysOn,
                subtitlesSize,
                subtitlesColor,
                videoQuality,
                preferredAudio
            });
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('altyflix_subtitles_always_on', subtitlesAlwaysOn ? 'true' : 'false');
            }
            saveGatewayConfig({
                provider: debridProvider,
                token: debridToken,
                frenchioUrl
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
        try {
            await deleteUser(currentUser);
            await logout();
            navigate('/');
        } catch {
            triggerToast('error', t('settings.deleteReauthError'));
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
        { id: 'profile', label: t('settings.profileTab'), icon: 'user' },
        { id: 'preferences', label: t('settings.preferencesTab'), icon: 'sliders' },
        { id: 'account', label: t('settings.accountTab'), icon: 'shield' },
        { id: 'stats', label: t('settings.statsTab'), icon: 'chart' },
        { id: 'diagnostics', label: t('settings.diagnosticsTab'), icon: 'pulse' },
    ];

    return (
        <div className="min-h-screen bg-[#060608] px-[4%] pb-12 pt-16 text-white md:px-[5%] md:pt-28">
            <Helmet>
                <title>{t('settings.title')} - ALTYFLIX</title>
                <meta name="robots" content="noindex" />
            </Helmet>

            <div className="mx-auto max-w-6xl">
                <Link
                    to="/"
                    onClick={() => playHaptic()}
                    className="inline-flex items-center gap-2 mb-6 text-sm font-semibold text-white/50 hover:text-white transition-colors group"
                >
                    <svg className="w-4 h-4 transition-transform group-hover:-translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    <span>Retour à l&apos;accueil</span>
                </Link>

                <motion.header
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    className="mb-10"
                >
                    <h1 className="font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">Paramètres</h1>
                    <p className="mt-2 text-sm text-white/50 sm:text-base">Votre profil, la lecture et votre compte.</p>
                </motion.header>

                <div className="flex flex-col items-start gap-8 lg:flex-row lg:gap-10">
                    {/* ── Sidebar ── */}
                    <aside className="w-full flex-none lg:sticky lg:top-28 lg:w-64">
                        <div className="mb-5 flex items-center gap-3.5 rounded-3xl border border-white/[0.08] bg-white/[0.03] p-4">
                            <span className="block h-12 w-12 flex-none overflow-hidden rounded-[26%] bg-[#101016] ring-1 ring-white/10">
                                <img src={selectedAvatar || currentProfile?.avatar} alt="" className="h-full w-full object-cover" />
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-[15px] font-semibold text-white">{profileName || currentProfile?.name}</p>
                                <p className="truncate text-xs text-white/45">{currentUser?.email || (isKid ? t('settings.kidProfile') : 'Profil')}</p>
                            </div>
                            <Link
                                to="/profiles"
                                onClick={() => playHaptic()}
                                aria-label={t('nav.switchProfile')}
                                title={t('nav.switchProfile')}
                                className="grid h-9 w-9 flex-none place-items-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                            >
                                <Icon name="users" className="h-[18px] w-[18px]" />
                            </Link>
                        </div>

                        <nav aria-label="Sections des paramètres" className="no-scrollbar -mx-[4%] flex gap-1 overflow-x-auto px-[4%] lg:mx-0 lg:flex-col lg:px-0">
                            {tabs.map(tab => {
                                const active = activeTab === tab.id;
                                return (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        aria-current={active ? 'page' : undefined}
                                        onClick={() => { playHaptic(); setActiveTab(tab.id); }}
                                        className={`relative flex flex-none items-center gap-3 whitespace-nowrap rounded-xl px-4 py-3 text-left text-[15px] font-semibold transition-colors duration-200 lg:w-full ${active ? 'text-white' : 'text-white/50 hover:text-white'}`}
                                    >
                                        {active && (
                                            <motion.span
                                                layoutId="settings-active-tab"
                                                className="absolute inset-0 rounded-xl bg-white/[0.08]"
                                                transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                                            />
                                        )}
                                        <Icon name={tab.icon} className={`relative h-[18px] w-[18px] ${active ? 'text-[#E50914]' : ''}`} />
                                        <span className="relative">{tab.label}</span>
                                    </button>
                                );
                            })}
                            <button
                                type="button"
                                onClick={logout}
                                className="flex flex-none items-center gap-3 whitespace-nowrap rounded-xl px-4 py-3 text-left text-[15px] font-semibold text-white/50 transition-colors hover:text-[#ff5a63] lg:mt-3 lg:w-full lg:border-t lg:border-white/[0.07] lg:pt-5"
                            >
                                <Icon name="logout" className="h-[18px] w-[18px]" />
                                {t('nav.logout')}
                            </button>
                        </nav>
                    </aside>

                    {/* ── Panel ── */}
                    <div className="w-full min-w-0 flex-1">
                        <AnimatePresence mode="wait">
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
                                    loading={loading}
                                    t={t}
                                />
                            )}

                            {activeTab === 'preferences' && (
                                <PreferencesTab
                                    key="preferences"
                                    handlePreferencesSave={handlePreferencesSave}
                                    autoplayNext={autoplayNext}
                                    setAutoplayNext={setAutoplayNext}
                                    autoplayTrailers={autoplayTrailers}
                                    setAutoplayTrailers={setAutoplayTrailers}
                                    subtitlesAlwaysOn={subtitlesAlwaysOn}
                                    setSubtitlesAlwaysOn={setSubtitlesAlwaysOn}
                                    videoQuality={videoQuality}
                                    setVideoQuality={setVideoQuality}
                                    subtitlesSize={subtitlesSize}
                                    setSubtitlesSize={setSubtitlesSize}
                                    subtitlesColor={subtitlesColor}
                                    setSubtitlesColor={setSubtitlesColor}
                                    debridProvider={debridProvider}
                                    setDebridProvider={setDebridProvider}
                                    debridToken={debridToken}
                                    setDebridToken={setDebridToken}
                                    frenchioUrl={frenchioUrl}
                                    setFrenchioUrl={setFrenchioUrl}
                                    loading={loading}
                                    t={t}
                                />
                            )}

                            {activeTab === 'account' && (
                                <AccountTab
                                    key="account"
                                    email={currentUser?.email}
                                    handleEmailChange={handleEmailChange}
                                    emailForm={emailForm}
                                    setEmailForm={setEmailForm}
                                    handlePasswordChange={handlePasswordChange}
                                    passwordForm={passwordForm}
                                    setPasswordForm={setPasswordForm}
                                    handleDeleteAccount={() => setShowDeleteModal(true)}
                                    loading={loading}
                                    t={t}
                                />
                            )}

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
            </div>

            <AnimatePresence>
                {message.text && <Toast key={message.text} message={message} />}
            </AnimatePresence>

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

            <AnimatePresence>
                {showClearHistoryModal && (
                    <ConfirmModal
                        title="Effacer l’historique ?"
                        message={t('settings.clearHistoryConfirm')}
                        onConfirm={handleClearHistory}
                        onCancel={() => setShowClearHistoryModal(false)}
                        confirmLabel="Effacer"
                    />
                )}
                {showDeleteModal && (
                    <ConfirmModal
                        title="Supprimer le compte ?"
                        message={t('settings.deleteConfirmPrompt')}
                        onConfirm={() => { setShowDeleteModal(false); handleDeleteAccount(); }}
                        onCancel={() => setShowDeleteModal(false)}
                        confirmLabel="Supprimer"
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

export default Settings;
