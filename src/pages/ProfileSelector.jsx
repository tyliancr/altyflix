// "Qui regarde ?" — profile picker, profile editor and delete confirmation.
//
// Motion is carried by the profiles themselves, never by the background:
// tiles rise in one after another, tilt toward the pointer with an outline
// that draws itself, and the chosen avatar flies to the centre, gets ringed,
// then the view zooms into it before the catalogue opens.
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProfile } from '../contexts/ProfileContext';
import { DEFAULT_AVATARS } from '../config/constants';
import { playHaptic, playSound } from '../utils/interactions';
import { motion, AnimatePresence, LayoutGroup, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import PinModal from '../components/common/PinModal';
import ALTYFLIXLogo from '../components/common/AltyflixLogo';
import AvatarSelector from '../components/settings/AvatarSelector';
import Icon from '../components/ui/Icons';
import { useTranslation } from '../hooks/useTranslation';
import { sanitizeReturnUrl } from '../utils/helpers';

const EASE = [0.16, 1, 0.3, 1];
const SPRING = { type: 'spring', stiffness: 260, damping: 24 };
const WELCOME_MS = 1350;
const TILE = 'clamp(104px, 14vw, 164px)';
const MAX_PROFILES = 5;

const prefersReducedMotion = () =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const Avatar = ({ profile, className = '', index = 0 }) => {
    const fallbackAvatar = DEFAULT_AVATARS[index % DEFAULT_AVATARS.length] || '/avatars/users-1.png';
    const [imgSrc, setImgSrc] = useState(profile?.avatar || fallbackAvatar);

    useEffect(() => {
        setImgSrc(profile?.avatar || fallbackAvatar);
    }, [profile?.avatar, fallbackAvatar]);

    return (
        <img
            src={imgSrc}
            alt=""
            draggable="false"
            className={`h-full w-full object-cover ${className}`}
            onError={() => { if (imgSrc !== fallbackAvatar) setImgSrc(fallbackAvatar); }}
        />
    );
};

// ── Profile tile ─────────────────────────────────────
const ProfileCard = ({ profile, index, onClick, manageMode, onDelete, isSelected, anySelected }) => {
    // Pointer position inside the tile, from -0.5 to 0.5 on each axis
    const px = useMotionValue(0);
    const py = useMotionValue(0);
    const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [10, -10]), { stiffness: 300, damping: 22 });
    const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-10, 10]), { stiffness: 300, damping: 22 });
    const sheen = useTransform([px, py], ([x, y]) =>
        `linear-gradient(${115 + x * 40}deg, transparent 30%, rgba(255,255,255,${0.16 + Math.abs(y) * 0.1}) 50%, transparent 70%)`);

    const interactive = !manageMode && !anySelected;

    const handlePointerMove = (e) => {
        if (!interactive || e.pointerType !== 'mouse') return;
        const rect = e.currentTarget.getBoundingClientRect();
        px.set((e.clientX - rect.left) / rect.width - 0.5);
        py.set((e.clientY - rect.top) / rect.height - 0.5);
    };
    const resetTilt = () => { px.set(0); py.set(0); };

    return (
        <motion.li
            className="group/tile relative flex flex-col items-center gap-4"
            style={{ width: TILE }}
            initial={{ opacity: 0, y: 48, scale: 0.85, rotateX: 25 }}
            animate={anySelected
                ? (isSelected ? { opacity: 1, y: 0, scale: 1, rotateX: 0 } : { opacity: 0, y: 30, scale: 0.85, rotateX: 0 })
                : { opacity: 1, y: 0, scale: 1, rotateX: 0 }}
            transition={anySelected
                ? { duration: 0.35, ease: EASE, delay: isSelected ? 0 : Math.abs(index) * 0.03 }
                : { ...SPRING, delay: 0.25 + index * 0.08 }}
        >
            <motion.div
                className="relative"
                style={{ width: TILE, height: TILE, perspective: 700 }}
                animate={manageMode ? { rotate: [-1.2, 1.2] } : { rotate: 0 }}
                transition={manageMode
                    ? { duration: 0.24 + (index % 3) * 0.03, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }
                    : { duration: 0.2 }}
            >
                <motion.button
                    type="button"
                    aria-label={manageMode ? `Modifier le profil ${profile.name}` : `Choisir le profil ${profile.name}`}
                    disabled={anySelected}
                    className="group relative block h-full w-full rounded-[22%] outline-none"
                    style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
                    initial="rest"
                    animate="rest"
                    whileHover={interactive ? 'hover' : 'rest'}
                    whileFocus={interactive ? 'hover' : 'rest'}
                    whileTap={interactive ? { scale: 0.94 } : undefined}
                    variants={{ rest: { scale: 1, y: 0 }, hover: { scale: 1.08, y: -8 } }}
                    transition={SPRING}
                    onPointerMove={handlePointerMove}
                    onPointerLeave={resetTilt}
                    onPointerEnter={() => { if (interactive) playSound('hover'); }}
                    onClick={() => { playHaptic('medium'); onClick(); }}
                >
                    {/* Contact shadow that deepens as the tile lifts */}
                    <motion.span
                        aria-hidden="true"
                        className="absolute inset-x-[8%] -bottom-3 h-6 rounded-[50%] bg-black blur-md"
                        variants={{ rest: { opacity: 0.35, scaleX: 0.9 }, hover: { opacity: 0.7, scaleX: 1 } }}
                    />

                    <span className="relative block h-full w-full overflow-hidden rounded-[22%] bg-[#16161b] ring-1 ring-inset ring-white/10">
                        {/* The chosen avatar is handed over to the welcome stage (shared layoutId) */}
                        {!isSelected && (
                            <motion.span layoutId={`avatar-${profile.id}`} className="block h-full w-full overflow-hidden rounded-[22%]">
                                <Avatar profile={profile} index={index} />
                            </motion.span>
                        )}
                        <motion.span
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-0"
                            style={{ background: sheen }}
                            variants={{ rest: { opacity: 0 }, hover: { opacity: 1 } }}
                        />

                        <AnimatePresence>
                            {manageMode && (
                                <motion.span
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="absolute inset-0 grid place-items-center bg-black/55"
                                >
                                    <motion.span
                                        initial={{ scale: 0, rotate: -45 }}
                                        animate={{ scale: 1, rotate: 0 }}
                                        exit={{ scale: 0 }}
                                        transition={{ ...SPRING, delay: index * 0.04 }}
                                        className="grid h-11 w-11 place-items-center rounded-full bg-white text-black"
                                    >
                                        <Icon name="edit" className="h-5 w-5" strokeWidth={2} />
                                    </motion.span>
                                </motion.span>
                            )}
                        </AnimatePresence>
                    </span>

                    {/* Outline that draws itself around the tile */}
                    <svg aria-hidden="true" viewBox="0 0 100 100" className="pointer-events-none absolute -inset-[6px] h-[calc(100%+12px)] w-[calc(100%+12px)] overflow-visible">
                        <motion.rect
                            x="1.5" y="1.5" width="97" height="97" rx="23"
                            fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round"
                            variants={{ rest: { pathLength: 0, opacity: 0 }, hover: { pathLength: 1, opacity: 1 } }}
                            transition={{ pathLength: { duration: 0.5, ease: EASE }, opacity: { duration: 0.12 } }}
                        />
                    </svg>

                    {profile.pin && !manageMode && (
                        <span className="absolute -bottom-1.5 -right-1.5 grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-[#16161b] text-white" title="Protégé par un code PIN">
                            <Icon name="lock" className="h-4 w-4" />
                        </span>
                    )}
                </motion.button>

                <AnimatePresence>
                    {manageMode && (
                        <motion.button
                            type="button"
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0 }}
                            whileHover={{ scale: 1.15 }}
                            whileTap={{ scale: 0.9 }}
                            transition={SPRING}
                            onClick={onDelete}
                            aria-label={`Supprimer le profil ${profile.name}`}
                            className="absolute -right-2 -top-2 z-10 grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-[#16161b] text-white transition-colors hover:border-[#E50914] hover:bg-[#E50914]"
                        >
                            <Icon name="trash" className="h-4 w-4" />
                        </motion.button>
                    )}
                </AnimatePresence>
            </motion.div>

            <span className="flex max-w-full flex-col items-center">
                <span className="max-w-full truncate text-center text-base font-medium text-white/60 transition-colors group-hover/tile:text-white group-focus-within/tile:text-white sm:text-lg">
                    {profile.name}
                </span>
                {profile.isKid && (
                    <span className="mt-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.18em] text-sky-300/90">
                        <Icon name="kid" className="h-3 w-3" strokeWidth={2} /> Enfants
                    </span>
                )}
            </span>
        </motion.li>
    );
};

// ── Add profile ──────────────────────────────────────
const AddProfileCard = ({ index, onClick, hidden }) => (
    <motion.li
        className="flex flex-col items-center gap-4"
        style={{ width: TILE }}
        initial={{ opacity: 0, y: 48, scale: 0.85 }}
        animate={hidden ? { opacity: 0, y: 30, scale: 0.85 } : { opacity: 1, y: 0, scale: 1 }}
        transition={hidden ? { duration: 0.3, ease: EASE } : { ...SPRING, delay: 0.25 + index * 0.08 }}
    >
        <motion.button
            type="button"
            aria-label="Ajouter un profil"
            onClick={onClick}
            onPointerEnter={() => playSound('hover')}
            className="relative grid place-items-center rounded-[22%] outline-none"
            style={{ width: TILE, height: TILE }}
            initial="rest"
            animate="rest"
            whileHover="hover"
            whileFocus="hover"
            whileTap={{ scale: 0.94 }}
            variants={{ rest: { scale: 1, y: 0 }, hover: { scale: 1.08, y: -8 } }}
            transition={SPRING}
        >
            <svg aria-hidden="true" viewBox="0 0 100 100" className="absolute inset-0 h-full w-full overflow-visible">
                <motion.rect
                    x="1.5" y="1.5" width="97" height="97" rx="21"
                    strokeWidth="1.6" strokeDasharray="5 6" strokeLinecap="round"
                    variants={{
                        rest: { stroke: 'rgba(255,255,255,0.25)', fill: 'rgba(255,255,255,0.02)', strokeDashoffset: 0 },
                        hover: { stroke: 'rgba(255,255,255,0.95)', fill: 'rgba(255,255,255,0.06)', strokeDashoffset: -44, transition: { strokeDashoffset: { duration: 1.6, repeat: Infinity, ease: 'linear' } } },
                    }}
                />
            </svg>
            <motion.span
                className="relative"
                variants={{ rest: { rotate: 0, color: 'rgba(255,255,255,0.45)' }, hover: { rotate: 90, color: 'rgba(255,255,255,1)' } }}
                transition={SPRING}
            >
                <Icon name="plus" className="h-11 w-11" strokeWidth={1.4} />
            </motion.span>
        </motion.button>
        <span className="text-base font-medium text-white/50 sm:text-lg">Ajouter</span>
    </motion.li>
);

// ── Welcome stage: the picked avatar flies to the centre ─────
const WelcomeStage = ({ profile, index }) => (
    <motion.div
        role="status"
        aria-live="polite"
        className="fixed inset-0 z-[400] flex flex-col items-center justify-center gap-9"
        initial={{ backgroundColor: 'rgba(11,11,14,0)' }}
        animate={{ backgroundColor: 'rgba(11,11,14,1)' }}
        transition={{ duration: 0.4 }}
    >
        {/* Zoom into the avatar for the hand-off to the catalogue */}
        <motion.div
            className="flex flex-col items-center gap-9"
            initial={{ scale: 1, opacity: 1 }}
            animate={{ scale: [1, 1, 1.35], opacity: [1, 1, 0] }}
            transition={{ duration: WELCOME_MS / 1000, times: [0, 0.72, 1], ease: 'easeIn' }}
        >
            <div className="relative h-[clamp(150px,20vw,210px)] w-[clamp(150px,20vw,210px)]">
                <motion.span
                    layoutId={`avatar-${profile.id}`}
                    transition={{ type: 'spring', stiffness: 170, damping: 22 }}
                    className="absolute inset-[8%] block overflow-hidden rounded-full shadow-[0_30px_60px_rgba(0,0,0,0.6)]"
                >
                    <Avatar profile={profile} index={index} />
                </motion.span>

                <svg aria-hidden="true" viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-90">
                    <circle cx="50" cy="50" r="47" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                    <motion.circle
                        cx="50" cy="50" r="47" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ duration: 0.75, delay: 0.25, ease: [0.65, 0, 0.35, 1] }}
                    />
                </svg>
            </div>

            <div className="overflow-hidden text-center">
                <motion.p
                    initial={{ y: '110%' }}
                    animate={{ y: 0 }}
                    transition={{ duration: 0.6, delay: 0.3, ease: EASE }}
                    className="font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl"
                >
                    {profile.name}
                </motion.p>
            </div>
        </motion.div>
    </motion.div>
);

const ProfileSelector = () => {
    const navigate = useNavigate();
    const { profiles, switchProfile, createProfile, updateProfile, deleteProfile } = useProfile();
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
    const [saveError, setSaveError] = useState('');
    const enterTimerRef = useRef(null);

    useEffect(() => () => {
        if (enterTimerRef.current) clearTimeout(enterTimerRef.current);
    }, []);

    useEffect(() => {
        if (editingProfile) {
            setProfileName(editingProfile.name || '');
            setSelectedAvatar(editingProfile.avatar || DEFAULT_AVATARS[0]);
            setIsKid(editingProfile.isKid || false);
            setPinCode(editingProfile.pin || '');
        }
    }, [editingProfile]);

    // Escape closes the editor or the delete dialog
    useEffect(() => {
        if (!showModal && !profileToDelete) return undefined;
        const onKey = (e) => {
            if (e.key !== 'Escape' || showAvatarSelector || showPinModal) return;
            if (profileToDelete) setProfileToDelete(null);
            else { setShowModal(false); setEditingProfile(null); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [showModal, profileToDelete, showAvatarSelector, showPinModal]);

    const resetForm = () => {
        setProfileName('');
        setSelectedAvatar(DEFAULT_AVATARS[0]);
        setIsKid(false);
        setPinCode('');
        setEditingProfile(null);
    };

    const closeModal = () => { setShowModal(false); resetForm(); };

    const openCreate = () => {
        if (transitioningProfile) return;
        playHaptic();
        resetForm();
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!profileName.trim() || saving) return;
        const cleanPin = String(pinCode || '').replace(/\D/g, '');
        if (cleanPin.length > 0 && cleanPin.length < 4) {
            setSaveError('Le code PIN doit contenir exactement 4 chiffres (ou être laissé vide).');
            return;
        }
        setSaveError('');
        setSaving(true);
        const data = {
            name: profileName.trim(),
            avatar: selectedAvatar,
            isKid,
            pin: cleanPin.length === 4 ? cleanPin : null,
        };
        const result = editingProfile
            ? await updateProfile(editingProfile.id, data)
            : await createProfile(data);
        setSaving(false);
        if (result?.success !== false) {
            closeModal();
        } else {
            setSaveError(result?.error || 'Impossible de sauvegarder le profil.');
        }
    };

    const enterProfile = (profile) => {
        if (transitioningProfile) return;
        playSound('netflix_intro');
        setTransitioningProfile(profile);
        if (enterTimerRef.current) clearTimeout(enterTimerRef.current);
        enterTimerRef.current = setTimeout(() => {
            switchProfile(profile);
            let returnUrl = null;
            try {
                returnUrl = localStorage.getItem('returnUrl');
                if (returnUrl) localStorage.removeItem('returnUrl');
            } catch { /* storage blocked */ }
            if (returnUrl) {
                navigate(sanitizeReturnUrl(returnUrl, '/'));
            } else {
                navigate('/');
            }
        }, prefersReducedMotion() ? 0 : WELCOME_MS);
    };

    const handleDeleteRequest = (profile) => {
        if (transitioningProfile) return;
        if (profile.pin) {
            setPendingProfile(profile);
            setPinPurpose('delete');
            setShowPinModal(true);
        } else {
            setProfileToDelete(profile);
        }
    };

    const handleSelectProfile = (profile) => {
        if (transitioningProfile) return;
        if (profile.pin) {
            setPendingProfile(profile);
            setPinPurpose(manageMode ? 'manage' : 'select');
            setShowPinModal(true);
        } else if (manageMode) {
            setEditingProfile(profile);
            setShowModal(true);
        } else {
            enterProfile(profile);
        }
    };

    const handlePinSubmit = async (pin) => {
        if (pendingProfile?.pin !== pin) return false;
        const profile = pendingProfile;
        setShowPinModal(false);
        setPendingProfile(null);
        if (pinPurpose === 'manage') {
            setEditingProfile(profile);
            setShowModal(true);
        } else if (pinPurpose === 'delete') {
            setProfileToDelete(profile);
        } else {
            enterProfile(profile);
        }
        return true;
    };

    const leaving = Boolean(transitioningProfile);
    const canAdd = profiles.length < MAX_PROFILES;
    const heading = manageMode
        ? t('profileSelector.manageProfiles')
        : (profiles.length === 0 ? 'Créez votre profil' : t('profileSelector.whoIsWatching'));
    const selectedIndex = profiles.findIndex(p => p.id === transitioningProfile?.id);

    return (
        <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#0b0b0e] text-white">
            <Helmet>
                <title>Qui regarde ? - ALTYFLIX</title>
                <meta name="robots" content="noindex" />
            </Helmet>

            {/* Static light from above: depth without anything moving behind the profiles */}
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_70%_at_50%_-10%,#1d1d24_0%,#0b0b0e_60%)]" />

            <motion.header
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: leaving ? 0 : 1, y: 0 }}
                transition={{ duration: 0.5, ease: EASE }}
                className="relative z-10 px-[4%] py-6 md:px-[5%]"
            >
                <ALTYFLIXLogo size={34} showText />
            </motion.header>

            <PinModal
                isOpen={showPinModal}
                onClose={() => { setShowPinModal(false); setPendingProfile(null); }}
                onSubmit={handlePinSubmit}
                profileName={pendingProfile?.name}
            />

            <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-[5%] pb-24">
                <motion.div
                    className="mb-12 overflow-hidden text-center sm:mb-14"
                    animate={{ opacity: leaving ? 0 : 1, y: leaving ? -20 : 0 }}
                    transition={{ duration: 0.35, ease: EASE }}
                >
                    <AnimatePresence mode="wait">
                        <motion.h1
                            key={heading}
                            initial={{ y: '105%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '-105%' }}
                            transition={{ duration: 0.55, ease: EASE }}
                            className="font-display text-4xl font-semibold tracking-tight text-white text-balance sm:text-5xl md:text-6xl"
                        >
                            {heading}
                        </motion.h1>
                    </AnimatePresence>
                    <AnimatePresence>
                        {manageMode && (
                            <motion.p
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                className="mt-3 text-sm text-white/50"
                            >
                                Sélectionnez un profil pour le modifier.
                            </motion.p>
                        )}
                    </AnimatePresence>
                </motion.div>

                <LayoutGroup>
                    <ul className="mb-14 flex max-w-[1100px] flex-wrap justify-center gap-x-8 gap-y-10 sm:gap-x-11" style={{ perspective: 1200 }}>
                        {profiles.map((profile, i) => (
                            <ProfileCard
                                key={profile.id}
                                index={selectedIndex >= 0 ? i - selectedIndex : i}
                                profile={profile}
                                manageMode={manageMode}
                                isSelected={transitioningProfile?.id === profile.id}
                                anySelected={leaving}
                                onClick={() => handleSelectProfile(profile)}
                                onDelete={() => handleDeleteRequest(profile)}
                            />
                        ))}
                        {canAdd && !manageMode && (
                            <AddProfileCard index={profiles.length} hidden={leaving} onClick={openCreate} />
                        )}
                    </ul>

                    <AnimatePresence>
                        {transitioningProfile && <WelcomeStage profile={transitioningProfile} index={Math.max(selectedIndex, 0)} />}
                    </AnimatePresence>
                </LayoutGroup>

                {profiles.length > 0 && (
                    <motion.div
                        className="flex flex-wrap justify-center gap-3"
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: leaving ? 0 : 1, y: leaving ? 16 : 0 }}
                        transition={{ duration: 0.45, delay: leaving ? 0 : 0.35 + profiles.length * 0.08, ease: EASE }}
                    >
                        <motion.button
                            type="button"
                            layout
                            whileTap={{ scale: 0.97 }}
                            onClick={() => { setManageMode(!manageMode); setShowModal(false); resetForm(); }}
                            className={`flex h-11 items-center gap-2 rounded-lg border px-6 text-sm font-semibold transition-colors duration-300 ${manageMode
                                ? 'border-white bg-white text-black hover:bg-white/85'
                                : 'border-white/30 text-white/70 hover:border-white hover:text-white'}`}
                        >
                            <Icon name={manageMode ? 'check' : 'edit'} className="h-4 w-4" strokeWidth={2.2} />
                            {manageMode ? t('profileSelector.done') : t('profileSelector.manageProfiles')}
                        </motion.button>

                        <AnimatePresence>
                            {manageMode && canAdd && (
                                <motion.button
                                    type="button"
                                    layout
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -10 }}
                                    whileTap={{ scale: 0.97 }}
                                    onClick={openCreate}
                                    className="flex h-11 items-center gap-2 rounded-lg border border-white/30 px-6 text-sm font-semibold text-white/70 transition-colors duration-300 hover:border-white hover:text-white"
                                >
                                    <Icon name="plus" className="h-4 w-4" strokeWidth={2.2} /> Ajouter un profil
                                </motion.button>
                            )}
                        </AnimatePresence>
                    </motion.div>
                )}
            </main>

            {/* ── Delete confirmation ── */}
            <AnimatePresence>
                {profileToDelete && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        role="dialog" aria-modal="true" aria-label="Supprimer le profil"
                        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
                        onClick={() => setProfileToDelete(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.92, y: 16, opacity: 0 }}
                            animate={{ scale: 1, y: 0, opacity: 1 }}
                            exit={{ scale: 0.96, y: 8, opacity: 0 }}
                            transition={SPRING}
                            onClick={e => e.stopPropagation()}
                            className="w-full max-w-md rounded-2xl border border-white/10 bg-[#141418] p-8 text-center"
                        >
                            <div className="mx-auto mb-5 h-20 w-20 overflow-hidden rounded-[22%] grayscale">
                                <Avatar profile={profileToDelete} />
                            </div>
                            <h2 className="font-display text-2xl font-semibold tracking-tight">Supprimer « {profileToDelete.name} » ?</h2>
                            <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-white/55">
                                {"L'historique, la liste et les préférences de ce profil seront supprimés définitivement."}
                            </p>
                            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
                                <button
                                    type="button"
                                    autoFocus
                                    onClick={() => setProfileToDelete(null)}
                                    className="h-11 rounded-lg bg-white px-7 text-sm font-semibold text-black transition-colors hover:bg-white/85"
                                >
                                    Conserver
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { deleteProfile(profileToDelete.id); setProfileToDelete(null); }}
                                    className="h-11 rounded-lg border border-white/25 px-7 text-sm font-semibold text-white/80 transition-colors hover:border-[#E50914] hover:bg-[#E50914] hover:text-white"
                                >
                                    Supprimer
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Create / Edit ── */}
            <AnimatePresence>
                {showModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="profile-editor-title"
                        className="fixed inset-0 z-50 overflow-y-auto bg-[#0b0b0e]"
                    >
                        <header className="px-[4%] py-6 md:px-[5%]">
                            <ALTYFLIXLogo size={34} showText />
                        </header>

                        <motion.div
                            initial="hidden"
                            animate="show"
                            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } } }}
                            className="mx-auto w-full max-w-[680px] px-5 pb-20 pt-6 sm:pt-12"
                        >
                            <motion.div variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } } }}>
                                <h1 id="profile-editor-title" className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                                    {editingProfile ? t('profileSelector.editProfile') : t('profileSelector.addProfile')}
                                </h1>
                                <p className="mt-2 text-sm text-white/50">
                                    {editingProfile ? 'Modifiez le nom, l’avatar ou le verrouillage.' : 'Ajoutez un profil pour une autre personne qui regarde ALTYFLIX.'}
                                </p>
                            </motion.div>

                            <motion.div
                                variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } } }}
                                className="mt-8 flex flex-col gap-8 border-y border-white/10 py-8 sm:flex-row"
                            >
                                <motion.button
                                    type="button"
                                    aria-label="Changer d’avatar"
                                    whileHover={{ scale: 1.04 }}
                                    whileTap={{ scale: 0.96 }}
                                    transition={SPRING}
                                    className="group relative h-28 w-28 flex-none self-center overflow-hidden rounded-[22%] sm:self-start"
                                    onClick={() => { playHaptic(); setShowAvatarSelector(true); }}
                                >
                                    <AnimatePresence mode="popLayout" initial={false}>
                                        <motion.img
                                            key={selectedAvatar}
                                            src={selectedAvatar || DEFAULT_AVATARS[0]}
                                            alt=""
                                            initial={{ opacity: 0, scale: 1.2 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0 }}
                                            transition={{ duration: 0.35, ease: EASE }}
                                            className="h-full w-full object-cover"
                                        />
                                    </AnimatePresence>
                                    <span className="absolute inset-x-0 bottom-0 bg-black/70 py-1.5 text-center text-xs font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                                        Changer
                                    </span>
                                </motion.button>

                                <div className="flex-1 space-y-6">
                                    {saveError && (
                                        <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/15 px-3.5 py-2.5 text-sm text-red-300">
                                            {saveError}
                                        </p>
                                    )}
                                    <div>
                                        <label htmlFor="profile-name" className="mb-2 block text-sm text-white/60">Nom</label>
                                        <input
                                            id="profile-name"
                                            type="text"
                                            value={profileName}
                                            onChange={e => setProfileName(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
                                            className="field-input"
                                            placeholder="Prénom ou surnom"
                                            maxLength={20}
                                            autoFocus
                                        />
                                    </div>

                                    <div>
                                        <label htmlFor="profile-pin" className="mb-2 block text-sm text-white/60">Code PIN <span className="text-white/35">(facultatif)</span></label>
                                        <input
                                            id="profile-pin"
                                            type="text"
                                            inputMode="numeric"
                                            autoComplete="off"
                                            maxLength={4}
                                            value={pinCode}
                                            onChange={e => setPinCode(e.target.value.replace(/\D/g, ''))}
                                            className="field-input max-w-[160px] tracking-[0.4em]"
                                            placeholder="••••"
                                        />
                                        <p className="mt-2 text-xs text-white/40">4 chiffres demandés à chaque ouverture du profil.</p>
                                    </div>

                                    <label htmlFor="kidCheck" className="flex cursor-pointer select-none items-center justify-between gap-4 rounded-xl border border-white/10 px-4 py-3.5">
                                        <span>
                                            <span className="block text-sm font-semibold text-white">Profil enfant</span>
                                            <span className="block text-xs text-white/45">Affiche uniquement les contenus jeunesse.</span>
                                        </span>
                                        <input type="checkbox" id="kidCheck" checked={isKid} onChange={() => setIsKid(!isKid)} className="peer sr-only" />
                                        <span aria-hidden="true" className="relative h-7 w-12 flex-none rounded-full bg-white/15 transition-colors after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-transform after:duration-300 peer-checked:bg-[#E50914] peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-white" />
                                    </label>
                                </div>
                            </motion.div>

                            <motion.div
                                variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } } }}
                                className="mt-8 flex flex-wrap gap-3"
                            >
                                <button
                                    type="button"
                                    onClick={handleSave}
                                    disabled={!profileName.trim() || saving}
                                    className="h-11 min-w-[140px] rounded-lg bg-white px-6 text-sm font-semibold text-black transition-colors hover:bg-white/85 disabled:opacity-40 disabled:hover:bg-white"
                                >
                                    {saving ? 'Enregistrement…' : editingProfile ? 'Enregistrer' : 'Créer le profil'}
                                </button>
                                <button
                                    type="button"
                                    onClick={closeModal}
                                    className="h-11 min-w-[140px] rounded-lg border border-white/30 px-6 text-sm font-semibold text-white/75 transition-colors hover:border-white hover:text-white"
                                >
                                    Annuler
                                </button>
                                {editingProfile && (
                                    <button
                                        type="button"
                                        onClick={() => { const p = editingProfile; closeModal(); setProfileToDelete(p); }}
                                        className="ml-auto h-11 px-2 text-sm font-semibold text-white/50 transition-colors hover:text-[#ff5a63]"
                                    >
                                        Supprimer le profil
                                    </button>
                                )}
                            </motion.div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showAvatarSelector && (
                    <AvatarSelector
                        currentAvatar={selectedAvatar}
                        profileName={profileName || 'Nouveau profil'}
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
