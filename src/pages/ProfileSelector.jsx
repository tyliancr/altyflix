// Netflix-Faithful Profile Selector
// Centered white logo, "Qui regarde ?" title, avatar grid with names below,
// hover shows white border, clicking enters with scale transition
// "Gérer les profils" button at the bottom
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProfile } from '../contexts/ProfileContext';
import { DEFAULT_AVATARS } from '../config/constants';
import { playHaptic, playSound } from '../utils/interactions';
import { motion, AnimatePresence } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import PinModal from '../components/common/PinModal';
import ALTYFLIXLogo from '../components/common/AltyflixLogo';
import AvatarSelector from '../components/settings/AvatarSelector';
import { useTranslation } from '../hooks/useTranslation';
import { sanitizeReturnUrl } from '../utils/helpers';

// ── Profile Card (Premium Redesign) ──────────────────
const ProfileAvatar = ({ profile, onClick, manageMode, onDelete, isSelected, anySelected }) => {
    const [hovered, setHovered] = useState(false);
    const [failedAvatar, setFailedAvatar] = useState(null);

    return (
        <motion.div
            className="flex flex-col items-center gap-4 cursor-pointer select-none group/card"
            style={{ width: 'clamp(130px, 16vw, 180px)' }}
            animate={
                anySelected
                    ? (isSelected ? { scale: 1.06, opacity: 1 } : { scale: 0.94, opacity: 0 })
                    : { scale: 1, opacity: 1 }
            }
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
            <motion.div
                className="relative origin-center w-[clamp(120px,15vw,168px)] h-[clamp(120px,15vw,168px)] rounded-2xl overflow-visible group"
                whileHover={{ scale: manageMode || anySelected ? 1 : 1.08, y: manageMode || anySelected ? 0 : -6 }}
                whileTap={{ scale: manageMode || anySelected ? 1 : 0.96 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                style={{
                    filter: isSelected
                        ? 'drop-shadow(0 0 40px rgba(229,9,20,0.65)) drop-shadow(0 10px 30px rgba(0,0,0,0.8))'
                        : (hovered && !manageMode ? 'drop-shadow(0 20px 40px rgba(229,9,20,0.35)) drop-shadow(0 8px 20px rgba(0,0,0,0.7))' : 'drop-shadow(0 10px 25px rgba(0,0,0,0.6))'),
                }}
                onClick={() => {
                    if (anySelected) return;
                    playHaptic('medium');
                    onClick();
                }}
                onMouseEnter={() => {
                    if (!manageMode && !anySelected) { playSound('hover'); setHovered(true); }
                }}
                onMouseLeave={() => setHovered(false)}
            >
                {/* Glow ring on hover or selected */}
                <div className={`absolute -inset-[3px] rounded-[18px] transition-all duration-400 pointer-events-none ${
                    isSelected
                        ? 'bg-gradient-to-br from-[#E50914] via-[#E50914]/40 to-transparent opacity-100 ring-2 ring-white/60'
                        : (hovered && !manageMode
                            ? 'bg-gradient-to-br from-white/80 via-white/20 to-transparent opacity-100'
                            : 'opacity-0'
                        )
                }`} />

                {/* Avatar image */}
                <div className="relative w-full h-full rounded-2xl overflow-hidden">
                    {profile.avatar && profile.avatar !== failedAvatar ? (
                        <img
                            src={profile.avatar}
                            alt={profile.name}
                            className="w-full h-full object-cover"
                            onError={() => setFailedAvatar(profile.avatar)}
                        />
                    ) : (
                        <span aria-hidden="true" className="grid h-full w-full place-items-center bg-[#53212c] text-4xl font-bold text-white">
                            {Array.from(profile.name?.trim() || '?')[0]}
                        </span>
                    )}

                    {/* Hover overlay */}
                    <div className={`absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-white/5 pointer-events-none transition-opacity duration-400 ${hovered && !manageMode && !anySelected ? 'opacity-100' : 'opacity-0'}`} />

                    {/* Manage mode edit overlay */}
                    {manageMode && (
                        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center transition-all duration-300 hover:bg-black/50 border-[3px] border-white/20 rounded-2xl">
                            <svg className="w-9 h-9 text-white drop-shadow-md" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                        </div>
                    )}

                    {/* PIN lock indicator */}
                    {profile.pin && !manageMode && (
                        <div className="absolute bottom-2 right-2 w-7 h-7 bg-black/80 backdrop-blur-md rounded-full flex items-center justify-center border border-white/20 shadow-md">
                            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                        </div>
                    )}
                </div>

                {/* Delete button (manage mode) */}
                {manageMode && (
                    <button
                        onClick={e => { e.stopPropagation(); onDelete(); }}
                        className="absolute -top-3 -right-3 w-8 h-8 bg-black border-2 border-[#444] rounded-full flex items-center justify-center shadow-lg hover:bg-red-600 hover:border-red-600 hover:scale-110 transition-all z-10"
                    >
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                )}
            </motion.div>

            {/* Name or Welcome greeting */}
            <div className="text-center">
                <motion.p
                    animate={isSelected ? { scale: 1.05, y: -2 } : { scale: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="text-base sm:text-lg font-semibold font-sans transition-all duration-400 tracking-wide leading-tight"
                    style={{ color: (hovered || isSelected) && !manageMode ? 'white' : 'rgba(180,180,180,0.9)' }}
                >
                    {isSelected ? `Bienvenue, ${profile.name}` : profile.name}
                    {profile.isKid && !isSelected && <span className="block text-[10px] text-blue-400 font-medium uppercase tracking-widest mt-0.5">Enfants</span>}
                </motion.p>
            </div>
        </motion.div>
    );
};


// ── Add Profile Card ──────────────────────────────────
const AddProfileCard = ({ onClick }) => {
    const [hovered, setHovered] = useState(false);
    return (
        <div
            className="flex flex-col items-center gap-4 cursor-pointer select-none"
            style={{ width: 'clamp(130px, 16vw, 180px)' }}
            onClick={onClick}
        >
            <motion.div
                className="w-[clamp(120px,15vw,168px)] h-[clamp(120px,15vw,168px)] flex items-center justify-center rounded-2xl border-2 border-dashed transition-all duration-400"
                whileHover={{ scale: 1.08, y: -6 }}
                whileTap={{ scale: 0.95 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                style={{
                    borderColor: hovered ? 'rgba(255,255,255,0.7)' : 'rgba(120,120,120,0.4)',
                    background: hovered ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.02)',
                    filter: hovered ? 'drop-shadow(0 20px 40px rgba(255,255,255,0.1))' : 'none',
                }}
                onMouseEnter={() => { playSound('hover'); setHovered(true); }}
                onMouseLeave={() => setHovered(false)}
            >
                <svg
                    className="w-10 h-10 transition-all duration-400"
                    style={{ color: hovered ? 'white' : 'rgba(150,150,150,0.7)' }}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                </svg>
            </motion.div>
            <p
                className="text-base sm:text-lg font-semibold font-sans transition-colors duration-300 tracking-wide"
                style={{ color: hovered ? 'white' : 'rgba(150,150,150,0.8)' }}
            >
                Ajouter
            </p>
        </div>
    );
};


const ProfileSelector = () => {
    const navigate = useNavigate();
    const { profiles, currentProfile: _currentProfile, switchProfile, createProfile, updateProfile, deleteProfile } = useProfile();
    const [manageMode, setManageMode] = useState(false);
    const { t } = useTranslation();

    const [showModal, setShowModal] = useState(false);
    const [showAvatarSelector, setShowAvatarSelector] = useState(false);
    const [editingProfile, setEditingProfile] = useState(null);
    const [pendingProfile, setPendingProfile] = useState(null);
    const [pinPurpose, setPinPurpose] = useState('select');
    const [showPinModal, setShowPinModal] = useState(false);
    const [transitioningProfile, setTransitioningProfile] = useState(null);
    const [profileToDelete, setProfileToDelete] = useState(null);

    const [profileName, setProfileName] = useState('');
    const [selectedAvatar, setSelectedAvatar] = useState(DEFAULT_AVATARS[0]);
    const [isKid, setIsKid] = useState(false);
    const [pinCode, setPinCode] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (editingProfile) {
            setProfileName(editingProfile.name || '');
            setSelectedAvatar(editingProfile.avatar || DEFAULT_AVATARS[0]);
            setIsKid(editingProfile.isKid || false);
            setPinCode(editingProfile.pin || '');
        }
    }, [editingProfile]);

    const resetForm = () => {
        setProfileName('');
        setSelectedAvatar(DEFAULT_AVATARS[0]);
        setIsKid(false);
        setPinCode('');
        setEditingProfile(null);
    };

    const closeModal = () => { setShowModal(false); resetForm(); };

    const handleSave = async () => {
        if (!profileName.trim() || saving) return;
        setSaving(true);
        const data = {
            name: profileName.trim(),
            avatar: selectedAvatar,
            isKid,
            pin: pinCode.length === 4 ? pinCode : null,
        };
        let result;
        if (editingProfile) {
            result = await updateProfile(editingProfile.id, data);
        } else {
            result = await createProfile(data);
        }
        setSaving(false);
        if (result?.success !== false) closeModal();
    };

    const triggerProfileTransition = (profile) => {
        const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        playSound('netflix_intro');
        setTransitioningProfile(profile);

        const duration = prefersReducedMotion ? 50 : 420;
        setTimeout(() => {
            switchProfile(profile);
            const returnUrl = localStorage.getItem('returnUrl');
            if (returnUrl) {
                localStorage.removeItem('returnUrl');
                navigate(sanitizeReturnUrl(returnUrl, '/'));
            } else {
                navigate('/');
            }
        }, duration);
    };

    const handleSelectProfile = (profile) => {
        if (manageMode) {
            if (profile.pin) {
                setPendingProfile(profile);
                setPinPurpose('manage');
                setShowPinModal(true);
            } else {
                setEditingProfile(profile);
                setShowModal(true);
            }
        } else if (profile.pin) {
            setPendingProfile(profile);
            setPinPurpose('select');
            setShowPinModal(true);
        } else {
            triggerProfileTransition(profile);
        }
    };

    const handlePinSubmit = async (pin) => {
        if (pendingProfile?.pin === pin) {
            const p = pendingProfile;
            const purpose = pinPurpose;
            setShowPinModal(false);
            setPendingProfile(null);
            if (purpose === 'manage') {
                setEditingProfile(p);
                setShowModal(true);
            } else {
                triggerProfileTransition(p);
            }
            return true;
        }
        return false;
    };

    return (
        <div
            className="min-h-screen flex flex-col items-center justify-center bg-[#080808] relative overflow-hidden text-white"
        >
            {/* Animated ambient background */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[70vw] h-[70vw] max-w-[700px] max-h-[700px] bg-[#e50914] rounded-full mix-blend-screen filter blur-[180px] opacity-[0.07] pointer-events-none" />
                <div className="absolute top-0 left-0 w-[40vw] h-[40vw] max-w-[400px] bg-[#1a0a0a] rounded-full filter blur-[120px] opacity-60" />
                <div className="absolute bottom-0 right-0 w-[40vw] h-[40vw] max-w-[400px] bg-[#0a0a1a] rounded-full filter blur-[120px] opacity-60" />
                <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.4),transparent_30%,transparent_70%,rgba(0,0,0,0.4))]" />
            </div>

            <Helmet>
                <title>Qui regarde ? - ALTYFLIX</title>
                <meta name="robots" content="noindex" />
            </Helmet>

            {/* Logo — fixed top-left */}
            <div className="fixed top-6 left-6 z-50 pointer-events-none">
                <ALTYFLIXLogo size={38} className="text-[#E50914]" />
            </div>

            <PinModal
                isOpen={showPinModal}
                onClose={() => { setShowPinModal(false); setPendingProfile(null); }}
                onSubmit={handlePinSubmit}
                profileName={pendingProfile?.name}
            />

            <AnimatePresence>
                {profileToDelete && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4"
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
                            className="bg-[#0e0e14] border border-white/10 p-8 sm:p-12 max-w-lg w-full text-center shadow-[0_25px_60px_rgba(0,0,0,0.9)] rounded-3xl backdrop-blur-2xl"
                        >
                            <h3 className="text-2xl sm:text-3xl font-sans font-normal mb-6 font-display">Supprimer le profil ?</h3>
                            <div className="flex items-center gap-4 justify-center mb-6">
                                <img src={profileToDelete.avatar} alt="Avatar" className="w-16 h-16 rounded-xl shadow-md" />
                                <div className="text-left">
                                    <p className="font-semibold text-lg">{profileToDelete.name}</p>
                                </div>
                            </div>
                            <p className="text-gray-400 mb-10 text-[15px] leading-relaxed">
                                {"L'historique des titres regardés de ce profil sera supprimé définitivement."}
                            </p>
                            <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 justify-center">
                                <button
                                    onClick={() => setProfileToDelete(null)}
                                    className="px-8 py-3 bg-white text-black font-bold text-lg hover:bg-gray-200 transition-colors rounded-xl"
                                >
                                    Conserver
                                </button>
                                <button
                                    onClick={() => {
                                        deleteProfile(profileToDelete.id);
                                        setProfileToDelete(null);
                                    }}
                                    className="px-8 py-3 border border-gray-600 text-gray-300 font-bold text-lg hover:border-red-500 hover:text-red-400 transition-colors rounded-xl"
                                >
                                    Supprimer
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <motion.div
                className="flex flex-col items-center justify-center relative z-10 w-full px-[5%] py-20"
                animate={transitioningProfile ? { scale: 1.03, opacity: 0 } : { scale: 1, opacity: 1 }}
                transition={transitioningProfile ? { duration: 0.16, ease: [0.22, 1, 0.36, 1] } : { duration: 0.3 }}
            >
                <motion.h1
                    className="text-white text-[2rem] sm:text-[3rem] md:text-[3.8rem] font-light mb-3 tracking-tight font-sans drop-shadow-xl text-center"
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ 
                        opacity: transitioningProfile ? 0 : 1, 
                        y: transitioningProfile ? -15 : 0 
                    }}
                    transition={{ duration: 0.35, ease: "easeOut" }}
                >
                    {manageMode ? t('profileSelector.manageProfiles') : (profiles.length === 0 ? 'Créez votre profil' : t('profileSelector.whoIsWatching'))}
                </motion.h1>

                {!manageMode && (
                    <motion.p
                        className="text-white/40 text-sm sm:text-base mb-12 font-sans tracking-wide"
                        initial={{ opacity: 0 }}
                        animate={{ 
                            opacity: transitioningProfile ? 0 : 1,
                            y: transitioningProfile ? -10 : 0
                        }}
                        transition={{ duration: 0.3, ease: "easeOut" }}
                    >
                        {profiles.length === 0 ? 'Ajoutez un profil personnalisé pour commencer' : 'Sélectionnez un profil pour continuer'}
                    </motion.p>
                )}
                {manageMode && <div className="mb-12" />}

                <div className="flex flex-wrap justify-center gap-8 sm:gap-10 md:gap-14 mb-14 max-w-[1100px] relative">
                    {profiles.map((profile, i) => (
                        <motion.div
                            key={profile.id}
                            className="relative z-10"
                            initial={{ opacity: 0, scale: 0.85, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            transition={{ delay: i * 0.05, duration: 0.4, ease: "easeOut" }}
                        >
                            <ProfileAvatar
                                profile={profile}
                                manageMode={manageMode}
                                isSelected={transitioningProfile?.id === profile.id}
                                anySelected={!!transitioningProfile}
                                onClick={() => handleSelectProfile(profile)}
                                onDelete={() => setProfileToDelete(profile)}
                            />
                        </motion.div>
                    ))}

                    {profiles.length < 5 && (!manageMode || profiles.length === 0) && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.85, y: 20 }}
                            animate={{ 
                                opacity: transitioningProfile ? 0 : 1, 
                                scale: transitioningProfile ? 0.9 : 1, 
                                y: 0 
                            }}
                            transition={{ delay: profiles.length * 0.05, duration: 0.4 }}
                        >
                            <AddProfileCard onClick={() => { 
                                if (transitioningProfile) return;
                                playHaptic(); 
                                resetForm(); 
                                setShowModal(true); 
                            }} />
                        </motion.div>
                    )}
                </div>

                {/* Bottom buttons */}
                {profiles.length > 0 && (
                    <motion.div 
                        className="flex flex-col sm:flex-row items-center gap-3"
                        animate={{ 
                            opacity: transitioningProfile ? 0 : 1,
                            y: transitioningProfile ? 15 : 0
                        }}
                        transition={{ duration: 0.3, ease: "easeOut" }}
                    >
                        <motion.button
                            whileHover={{ scale: 1.04 }}
                            whileTap={{ scale: 0.97 }}
                            onClick={() => { setManageMode(!manageMode); setShowModal(false); resetForm(); }}
                            className={`px-8 sm:px-10 py-3 text-sm sm:text-base font-semibold tracking-[0.12em] uppercase transition-all duration-400 rounded-full backdrop-blur-md border ${manageMode
                                    ? 'bg-white text-black border-white hover:bg-red-600 hover:text-white hover:border-red-600'
                                    : 'bg-white/5 text-white/70 border-white/20 hover:text-white hover:bg-white/10 hover:border-white/50'
                                }`}
                        >
                            {manageMode ? t('profileSelector.done') : t('profileSelector.manageProfiles')}
                        </motion.button>

                        {manageMode && profiles.length < 5 && (
                            <motion.button
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0 }}
                                whileHover={{ scale: 1.04 }}
                                whileTap={{ scale: 0.97 }}
                                onClick={() => { playHaptic(); resetForm(); setShowModal(true); }}
                                className="px-8 sm:px-10 py-3 text-sm sm:text-base font-semibold tracking-[0.12em] uppercase bg-[#e50914]/10 text-[#ff4444] border border-[#e50914]/40 hover:bg-[#e50914] hover:text-white hover:border-[#e50914] transition-all duration-300 rounded-full"
                            >
                                + Ajouter un profil
                            </motion.button>
                        )}
                    </motion.div>
                )}
            </motion.div>

            {/* Seamless Fade into Home */}
            <AnimatePresence>
                {transitioningProfile && (
                    <motion.div
                        key="seamless-fade"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.16, ease: "easeOut" }}
                        className="fixed inset-0 z-[500] bg-[#060608] pointer-events-none"
                    />
                )}
            </AnimatePresence>

            {/* ── Create / Edit Modal ── */}
            <AnimatePresence>
                {showModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-[#060608] z-50 overflow-y-auto"
                    >
                        {/* Header for edit modal matching layout */}
                        <div className="absolute top-8 left-[4%] pointer-events-none z-10">
                            <ALTYFLIXLogo size={36} className="text-[#E50914]" />
                        </div>

                        <div className="min-h-screen flex items-center justify-center p-4 py-24">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.97, y: 10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.97, y: 10 }}
                                transition={{ duration: 0.3, ease: 'easeOut' }}
                                className="w-full max-w-[800px] bg-transparent text-white"
                            >
                                <h1 className="text-[2.5rem] sm:text-[3.5rem] font-sans font-medium mb-6 px-4">
                                    {editingProfile ? t('profileSelector.editProfile') : t('profileSelector.addProfile')}
                                </h1>
                                <div className="h-[1px] w-full bg-[#333] mb-8" />

                                <div className="flex flex-col md:flex-row gap-6 lg:gap-10 px-4">
                                    {/* Left column (Avatar UI) */}
                                    <div className="w-full md:w-[160px] flex-shrink-0 flex justify-center md:justify-start items-start">
                                        <div
                                            className="relative group cursor-pointer"
                                            onClick={() => { playHaptic(); setShowAvatarSelector(true); }}
                                        >
                                            <div className="w-[120px] h-[120px] sm:w-[140px] sm:h-[140px] rounded-[4px] overflow-hidden bg-[#333]">
                                                <img src={selectedAvatar || DEFAULT_AVATARS[0]} alt="Avatar" className="w-full h-full object-cover" />
                                            </div>
                                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-300 rounded-[4px] border-[3px] border-white">
                                                <svg className="w-8 h-8 text-white drop-shadow-md" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                </svg>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Middle column (Inputs & Checkboxes) */}
                                    <div className="flex-1 max-w-[500px]">
                                        <div className="mb-6">
                                            <input
                                                type="text"
                                                value={profileName}
                                                onChange={e => setProfileName(e.target.value)}
                                                className="w-full bg-[#666] border-none px-4 py-2.5 text-white text-lg placeholder-white/80 focus:outline-none focus:ring-1 focus:ring-white transition-all rounded-sm"
                                                placeholder="Nom"
                                                maxLength={20}
                                                autoFocus
                                            />
                                        </div>

                                        <div className="mb-8">
                                            <p className="text-[#ccc] text-lg mb-2">Code PIN (Optionnel)</p>
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                maxLength={4}
                                                value={pinCode}
                                                onChange={e => setPinCode(e.target.value.replace(/\D/g, ''))}
                                                className="w-full bg-[#1A1A1A] border border-[#333] rounded-[4px] px-4 py-2 text-white text-lg focus:outline-none focus:border-white transition-all placeholder-[#4d4d4d]"
                                                placeholder="Ex: 1234"
                                            />
                                        </div>

                                        <div className="flex items-center gap-3 mb-8">
                                            <input
                                                type="checkbox"
                                                id="kidCheck"
                                                checked={isKid}
                                                onChange={() => setIsKid(!isKid)}
                                                className="w-6 h-6 border-[3px] border-[#333] rounded-sm appearance-none checked:bg-[#E50914] checked:border-transparent cursor-pointer relative"
                                            />
                                            <label htmlFor="kidCheck" className="text-[#ccc] text-lg cursor-pointer select-none">Enfant ?</label>
                                        </div>
                                    </div>
                                </div>





                                <div className="flex flex-wrap gap-4 px-4">
                                    <button
                                        onClick={handleSave}
                                        disabled={!profileName.trim() || saving}
                                        className="px-8 py-3 bg-white text-black font-bold text-lg hover:bg-[#c00] hover:text-white transition-colors rounded-[4px] min-w-[140px] disabled:opacity-50 disabled:hover:bg-white disabled:hover:text-black"
                                    >
                                        {saving ? '...' : editingProfile ? 'Enregistrer' : 'Continuer'}
                                    </button>
                                    <button
                                        onClick={closeModal}
                                        className="px-8 py-3 border border-gray-500 text-gray-300 font-bold text-lg hover:border-white hover:text-white transition-colors rounded-[4px] min-w-[140px]"
                                    >
                                        Annuler
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Sub-modal: Full-screen Avatar Selector */}
            <AnimatePresence>
                {showAvatarSelector && (
                    <AvatarSelector
                        currentAvatar={selectedAvatar}
                        profileName={profileName || 'NOUVEAU PROFIL'}
                        onSelect={(avatar) => {
                            setSelectedAvatar(avatar);
                            setShowAvatarSelector(false);
                        }}
                        onClose={() => setShowAvatarSelector(false)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

export default ProfileSelector;
