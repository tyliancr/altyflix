// Profile picker: animated entrance, pointer-tilt avatars, and a short
// "welcome" sequence (the avatar glides to the centre while a ring draws
// around it) before entering the catalogue.
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProfile } from '../contexts/ProfileContext';
import { DEFAULT_AVATARS } from '../config/constants';
import { playHaptic, playSound } from '../utils/interactions';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import PinModal from '../components/common/PinModal';
import ALTYFLIXLogo from '../components/common/AltyflixLogo';
import AvatarSelector from '../components/settings/AvatarSelector';
import Icon from '../components/ui/Icons';
import OrbitBackdrop from '../components/ui/OrbitBackdrop';
import { useTranslation } from '../hooks/useTranslation';
import { sanitizeReturnUrl } from '../utils/helpers';

const EASE = [0.16, 1, 0.3, 1];
const SPRING = { type: 'spring', stiffness: 260, damping: 24 };
const WELCOME_MS = 1500;
const CARD = 'clamp(112px, 15vw, 172px)';
const MAX_PROFILES = 5;

const prefersReducedMotion = () =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const Avatar = ({ profile, className = '' }) => {
    const [failed, setFailed] = useState(null);
    return profile.avatar && profile.avatar !== failed ? (
        <img src={profile.avatar} alt="" draggable="false" className={`h-full w-full object-cover ${className}`} onError={() => setFailed(profile.avatar)} />
    ) : (
        <span aria-hidden="true" className={`grid h-full w-full place-items-center bg-[#53212c] font-display text-4xl font-bold text-white ${className}`}>
            {Array.from(profile.name?.trim() || '?')[0]}
        </span>
    );
};

// ── Profile card ─────────────────────────────────────
const ProfileCard = ({ profile, index, onClick, manageMode, onDelete, isSelected, anySelected }) => {
    // Pointer position inside the card, from -0.5 to 0.5 on each axis
    const px = useMotionValue(0);
    const py = useMotionValue(0);
    const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [11, -11]), { stiffness: 300, damping: 22 });
    const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-11, 11]), { stiffness: 300, damping: 22 });
    const glareX = useTransform(px, [-0.5, 0.5], ['0%', '100%']);
    const glareY = useTransform(py, [-0.5, 0.5], ['0%', '100%']);
    const glare = useTransform([glareX, glareY], ([x, y]) => `radial-gradient(circle at ${x} ${y}, rgba(255,255,255,0.28), transparent 55%)`);

    const interactive = !manageMode && !anySelected;

    const handlePointerMove = (e) => {
        if (!interactive || e.pointerType !== 'mouse') return;
        const rect = e.currentTarget.getBoundingClientRect();
        px.set((e.clientX - rect.left) / rect.width - 0.5);
        py.set((e.clientY - rect.top) / rect.height - 0.5);
    };
    const resetTilt = () => { px.set(0); py.set(0); };

    return (
        <motion.div
            className="relative flex flex-col items-center gap-4"
            style={{ width: CARD }}
            initial={{ opacity: 0, y: 36, scale: 0.86, filter: 'blur(8px)' }}
            animate={anySelected
                ? { opacity: 0, y: 0, scale: isSelected ? 1 : 0.9, filter: isSelected ? 'blur(0px)' : 'blur(6px)' }
                : { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            transition={{ ...SPRING, delay: anySelected ? 0 : 0.12 + index * 0.07 }}
        >
            {/* Gentle sway signals that cards are editable */}
            <motion.div
                className="relative"
                style={{ width: CARD, height: CARD, perspective: 700 }}
                animate={manageMode ? { rotate: [-1.4, 1.4] } : { rotate: 0 }}
                transition={manageMode
                    ? { duration: 0.22 + (index % 3) * 0.03, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }
                    : { duration: 0.2 }}
            >
                <motion.button
                    type="button"
                    aria-label={manageMode ? `Modifier le profil ${profile.name}` : `Choisir le profil ${profile.name}`}
                    className="group relative block h-full w-full rounded-[26%] outline-none"
                    style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
                    initial="rest"
                    animate="rest"
                    whileHover={interactive ? 'hover' : 'rest'}
                    whileFocus={interactive ? 'hover' : 'rest'}
                    whileTap={interactive ? { scale: 0.95 } : undefined}
                    variants={{ rest: { scale: 1, y: 0 }, hover: { scale: 1.07, y: -6 } }}
                    transition={SPRING}
                    onPointerMove={handlePointerMove}
                    onPointerLeave={resetTilt}
                    onPointerEnter={() => { if (interactive) playSound('hover'); }}
                    onClick={() => {
                        if (anySelected) return;
                        playHaptic('medium');
                        onClick();
                    }}
                >
                    {/* Soft accent halo */}
                    <motion.span
                        aria-hidden="true"
                        className="absolute -inset-5 rounded-full bg-[#E50914] blur-2xl"
                        variants={{ rest: { opacity: 0, scale: 0.8 }, hover: { opacity: 0.28, scale: 1 } }}
                        transition={{ duration: 0.4 }}
                    />

                    <span className="relative block h-full w-full overflow-hidden rounded-[26%] bg-[#101016] shadow-[0_18px_40px_rgba(0,0,0,0.6)] ring-1 ring-inset ring-white/10">
                        {/* The selected avatar is handed over to the welcome stage (shared layoutId) */}
                        {isSelected ? null : (
                            <motion.span layoutId={`avatar-${profile.id}`} className="block h-full w-full overflow-hidden rounded-[26%]">
                                <Avatar profile={profile} />
                            </motion.span>
                        )}
                        <motion.span aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{ background: glare }} />

                        <AnimatePresence>
                            {manageMode && (
                                <motion.span
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="absolute inset-0 grid place-items-center bg-black/60 backdrop-blur-[2px]"
                                >
                                    <motion.span
                                        initial={{ scale: 0, rotate: -40 }}
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

                    {/* Outline that draws itself around the avatar */}
                    <svg aria-hidden="true" viewBox="0 0 100 100" className="pointer-events-none absolute -inset-[5px] h-[calc(100%+10px)] w-[calc(100%+10px)] overflow-visible">
                        <motion.rect
                            x="1.5" y="1.5" width="97" height="97" rx="27"
                            fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"
                            variants={{ rest: { pathLength: 0, opacity: 0 }, hover: { pathLength: 1, opacity: 1 } }}
                            transition={{ pathLength: { duration: 0.55, ease: EASE }, opacity: { duration: 0.15 } }}
                        />
                    </svg>

                    {profile.pin && !manageMode && (
                        <span className="absolute -bottom-1.5 -right-1.5 grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-[#14141b] text-white shadow-lg" title="Protégé par un code PIN">
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
                            className="absolute -right-2 -top-2 z-10 grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-[#14141b] text-white shadow-lg transition-colors hover:border-[#E50914] hover:bg-[#E50914]"
                        >
                            <Icon name="trash" className="h-4 w-4" />
                        </motion.button>
                    )}
                </AnimatePresence>
            </motion.div>

            <p className="max-w-full truncate text-center text-base font-semibold text-white/70 sm:text-lg">
                {profile.name}
                {profile.isKid && (
                    <span className="mt-1 flex items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-[0.18em] text-sky-300">
                        <Icon name="kid" className="h-3 w-3" strokeWidth={2} /> Enfants
                    </span>
                )}
            </p>
        </motion.div>
    );
};

// ── Add profile ──────────────────────────────────────
const AddProfileCard = ({ index, onClick, hidden }) => (
    <motion.div
        className="flex flex-col items-center gap-4"
        style={{ width: CARD }}
        initial={{ opacity: 0, y: 36, scale: 0.86 }}
        animate={hidden ? { opacity: 0, scale: 0.9 } : { opacity: 1, y: 0, scale: 1 }}
        transition={{ ...SPRING, delay: hidden ? 0 : 0.12 + index * 0.07 }}
    >
        <motion.button
            type="button"
            aria-label="Ajouter un profil"
            onClick={onClick}
            onPointerEnter={() => playSound('hover')}
            className="relative grid place-items-center rounded-[26%] text-white/45 outline-none"
            style={{ width: CARD, height: CARD }}
            initial="rest"
            animate="rest"
            whileHover="hover"
            whileFocus="hover"
            whileTap={{ scale: 0.95 }}
            variants={{ rest: { scale: 1, y: 0 }, hover: { scale: 1.07, y: -6 } }}
            transition={SPRING}
        >
            {/* Dashed outline that starts marching on hover */}
            <svg aria-hidden="true" viewBox="0 0 100 100" className="absolute inset-0 h-full w-full overflow-visible">
                <motion.rect
                    x="1.5" y="1.5" width="97" height="97" rx="25"
                    fill="rgba(255,255,255,0.03)" strokeWidth="1.6" strokeDasharray="5 6" strokeLinecap="round"
                    variants={{
                        rest: { stroke: 'rgba(255,255,255,0.28)', strokeDashoffset: 0 },
                        hover: { stroke: 'rgba(255,255,255,0.9)', strokeDashoffset: -44, transition: { strokeDashoffset: { duration: 1.6, repeat: Infinity, ease: 'linear' } } },
                    }}
                />
            </svg>
            <motion.span
                className="relative"
                variants={{ rest: { rotate: 0, color: 'rgba(255,255,255,0.45)' }, hover: { rotate: 90, color: 'rgba(255,255,255,1)' } }}
                transition={SPRING}
            >
                <Icon name="plus" className="h-10 w-10" strokeWidth={1.4} />
            </motion.span>
        </motion.button>
        <p className="text-base font-semibold text-white/50 sm:text-lg">Ajouter</p>
    </motion.div>
);

// ── Welcome stage ────────────────────────────────────
const WelcomeStage = ({ profile }) => (
    <motion.div
        role="status"
        aria-live="polite"
        className="fixed inset-0 z-[400] flex flex-col items-center justify-center gap-8 bg-[#060608]"
        initial={{ backgroundColor: 'rgba(6,6,8,0)' }}
        animate={{ backgroundColor: 'rgba(6,6,8,1)' }}
        transition={{ duration: 0.45 }}
    >
        <div className="relative h-[clamp(150px,22vw,220px)] w-[clamp(150px,22vw,220px)]">
            <motion.div
                aria-hidden="true"
                className="absolute -inset-10 rounded-full bg-[#E50914] blur-3xl"
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: [0, 0.35, 0.2], scale: 1 }}
                transition={{ duration: 1.1, ease: 'easeOut' }}
            />
            <motion.span
                layoutId={`avatar-${profile.id}`}
                transition={{ type: 'spring', stiffness: 170, damping: 22 }}
                className="absolute inset-[9%] block overflow-hidden rounded-full shadow-[0_24px_60px_rgba(0,0,0,0.7)]"
            >
                <Avatar profile={profile} />
            </motion.span>

            {/* Progress ring: a faint track, then the accent stroke draws once around */}
            <svg aria-hidden="true" viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-90">
                <defs>
                    <linearGradient id="welcome-ring" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#ff5a63" />
                        <stop offset="100%" stopColor="#E50914" />
                    </linearGradient>
                </defs>
                <circle cx="50" cy="50" r="47" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1.2" />
                <motion.circle
                    cx="50" cy="50" r="47" fill="none" stroke="url(#welcome-ring)" strokeWidth="2.4" strokeLinecap="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: (WELCOME_MS - 450) / 1000, delay: 0.3, ease: [0.65, 0, 0.35, 1] }}
                />
            </svg>
        </div>

        <div className="overflow-hidden text-center">
            <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3, ease: EASE }}
                className="text-[11px] font-bold uppercase tracking-[0.3em] text-white/45"
            >
                Bon retour
            </motion.p>
            <motion.p
                initial={{ opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.4, ease: EASE }}
                className="mt-2 font-display text-4xl font-bold tracking-tight text-white sm:text-5xl"
            >
                {profile.name}
            </motion.p>
        </div>
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

    const openCreate = () => {
        if (transitioningProfile) return;
        playHaptic();
        resetForm();
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!profileName.trim() || saving) return;
        setSaving(true);
        const data = {
            name: profileName.trim(),
            avatar: selectedAvatar,
            isKid,
            pin: pinCode.length === 4 ? pinCode : null,
        };
        const result = editingProfile
            ? await updateProfile(editingProfile.id, data)
            : await createProfile(data);
        setSaving(false);
        if (result?.success !== false) closeModal();
    };

    const triggerProfileTransition = (profile) => {
        playSound('netflix_intro');
        setTransitioningProfile(profile);

        setTimeout(() => {
            switchProfile(profile);
            const returnUrl = localStorage.getItem('returnUrl');
            if (returnUrl) {
                localStorage.removeItem('returnUrl');
                navigate(sanitizeReturnUrl(returnUrl, '/'));
            } else {
                navigate('/');
            }
        }, prefersReducedMotion() ? 50 : WELCOME_MS);
    };

    const handleSelectProfile = (profile) => {
        if (profile.pin) {
            setPendingProfile(profile);
            setPinPurpose(manageMode ? 'manage' : 'select');
            setShowPinModal(true);
        } else if (manageMode) {
            setEditingProfile(profile);
            setShowModal(true);
        } else {
            triggerProfileTransition(profile);
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
        } else {
            triggerProfileTransition(profile);
        }
        return true;
    };

    const leaving = Boolean(transitioningProfile);
    const heading = manageMode
        ? t('profileSelector.manageProfiles')
        : (profiles.length === 0 ? 'Créez votre profil' : t('profileSelector.whoIsWatching'));
    const canAdd = profiles.length < MAX_PROFILES;

    return (
        <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#060608] text-white">
            <OrbitBackdrop />

            <Helmet>
                <title>Qui regarde ? - ALTYFLIX</title>
                <meta name="robots" content="noindex" />
            </Helmet>

            <motion.div
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: leaving ? 0 : 1, y: 0 }}
                transition={{ duration: 0.6, ease: EASE }}
                className="pointer-events-none fixed left-6 top-6 z-50"
            >
                <ALTYFLIXLogo size={38} />
            </motion.div>

            <PinModal
                isOpen={showPinModal}
                onClose={() => { setShowPinModal(false); setPendingProfile(null); }}
                onSubmit={handlePinSubmit}
                profileName={pendingProfile?.name}
                avatar={pendingProfile?.avatar}
            />

            {/* ── Delete confirmation ── */}
            <AnimatePresence>
                {profileToDelete && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        role="dialog" aria-modal="true" aria-label="Supprimer le profil"
                        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
                        onClick={() => setProfileToDelete(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 16, opacity: 0 }}
                            animate={{ scale: 1, y: 0, opacity: 1 }}
                            exit={{ scale: 0.94, y: 8, opacity: 0 }}
                            transition={SPRING}
                            onClick={e => e.stopPropagation()}
                            className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0e0e14] p-8 text-center shadow-[0_30px_80px_rgba(0,0,0,0.8)]"
                        >
                            <div className="mx-auto mb-5 h-20 w-20 overflow-hidden rounded-[26%] ring-1 ring-white/10 grayscale">
                                <Avatar profile={profileToDelete} />
                            </div>
                            <h3 className="font-display text-2xl font-bold tracking-tight">Supprimer « {profileToDelete.name} » ?</h3>
                            <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-white/55">
                                {"L'historique, la liste et les préférences de ce profil seront supprimés définitivement."}
                            </p>
                            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
                                <button
                                    type="button"
                                    onClick={() => setProfileToDelete(null)}
                                    className="h-12 rounded-xl bg-white px-7 text-base font-bold text-black transition-colors hover:bg-white/85"
                                >
                                    Conserver
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { deleteProfile(profileToDelete.id); setProfileToDelete(null); }}
                                    className="flex h-12 items-center justify-center gap-2 rounded-xl border border-[#E50914]/50 px-7 text-base font-bold text-[#ff5a63] transition-colors hover:bg-[#E50914] hover:text-white"
                                >
                                    <Icon name="trash" className="h-4 w-4" /> Supprimer
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Picker ── */}
            <div className="relative z-10 flex w-full flex-col items-center px-[5%] py-24">
                <motion.div
                    className="mb-12 text-center sm:mb-14"
                    animate={{ opacity: leaving ? 0 : 1, y: leaving ? -16 : 0 }}
                    transition={{ duration: 0.35, ease: EASE }}
                >
                    <AnimatePresence mode="wait">
                        <motion.h1
                            key={heading}
                            initial={{ opacity: 0, y: 18, filter: 'blur(10px)' }}
                            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                            exit={{ opacity: 0, y: -12, filter: 'blur(8px)' }}
                            transition={{ duration: 0.5, ease: EASE }}
                            className="font-display text-4xl font-bold tracking-tight text-white text-balance sm:text-5xl md:text-6xl"
                        >
                            {heading}
                        </motion.h1>
                    </AnimatePresence>
                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.6, delay: 0.25 }}
                        className="mt-3 text-sm text-white/45 sm:text-base"
                    >
                        {manageMode
                            ? 'Touchez un profil pour le modifier.'
                            : profiles.length === 0 ? 'Ajoutez un profil pour commencer.' : 'Choisissez un profil pour continuer.'}
                    </motion.p>
                </motion.div>

                <div className="mb-14 flex max-w-[1100px] flex-wrap justify-center gap-x-8 gap-y-10 sm:gap-x-10 md:gap-x-14">
                    {profiles.map((profile, i) => (
                        <ProfileCard
                            key={profile.id}
                            index={i}
                            profile={profile}
                            manageMode={manageMode}
                            isSelected={transitioningProfile?.id === profile.id}
                            anySelected={leaving}
                            onClick={() => handleSelectProfile(profile)}
                            onDelete={() => setProfileToDelete(profile)}
                        />
                    ))}

                    {canAdd && (!manageMode || profiles.length === 0) && (
                        <AddProfileCard index={profiles.length} hidden={leaving} onClick={openCreate} />
                    )}
                </div>

                {profiles.length > 0 && (
                    <motion.div
                        className="flex flex-col items-center gap-3 sm:flex-row"
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: leaving ? 0 : 1, y: leaving ? 16 : 0 }}
                        transition={{ duration: 0.4, delay: leaving ? 0 : 0.3 + profiles.length * 0.07, ease: EASE }}
                    >
                        <motion.button
                            type="button"
                            layout
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                            onClick={() => { setManageMode(!manageMode); setShowModal(false); resetForm(); }}
                            className={`flex h-11 items-center gap-2 rounded-xl border px-6 text-sm font-semibold transition-colors duration-300 ${manageMode
                                ? 'border-white bg-white text-black hover:bg-white/85'
                                : 'border-white/15 bg-white/[0.06] text-white/75 hover:bg-white/15 hover:text-white'}`}
                        >
                            <Icon name={manageMode ? 'check' : 'edit'} className="h-4 w-4" strokeWidth={2.2} />
                            {manageMode ? t('profileSelector.done') : t('profileSelector.manageProfiles')}
                        </motion.button>

                        <AnimatePresence>
                            {manageMode && canAdd && (
                                <motion.button
                                    type="button"
                                    layout
                                    initial={{ opacity: 0, scale: 0.9, x: -10 }}
                                    animate={{ opacity: 1, scale: 1, x: 0 }}
                                    exit={{ opacity: 0, scale: 0.9, x: -10 }}
                                    whileHover={{ scale: 1.03 }}
                                    whileTap={{ scale: 0.97 }}
                                    onClick={openCreate}
                                    className="flex h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-6 text-sm font-semibold text-white/75 transition-colors duration-300 hover:bg-white/15 hover:text-white"
                                >
                                    <Icon name="plus" className="h-4 w-4" strokeWidth={2.2} /> Ajouter un profil
                                </motion.button>
                            )}
                        </AnimatePresence>
                    </motion.div>
                )}
            </div>

            <AnimatePresence>
                {transitioningProfile && <WelcomeStage profile={transitioningProfile} />}
            </AnimatePresence>

            {/* ── Create / Edit ── */}
            <AnimatePresence>
                {showModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        role="dialog"
                        aria-modal="true"
                        className="fixed inset-0 z-50 overflow-y-auto bg-[#060608]"
                    >
                        <OrbitBackdrop className="opacity-60" />
                        <div className="pointer-events-none absolute left-6 top-6 z-10">
                            <ALTYFLIXLogo size={38} />
                        </div>

                        <div className="relative flex min-h-screen items-center justify-center p-4 py-24">
                            <motion.div
                                initial="hidden"
                                animate="show"
                                exit="hidden"
                                variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } } }}
                                className="w-full max-w-[760px] text-white"
                            >
                                <motion.h1
                                    variants={{ hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } } }}
                                    className="mb-8 px-1 font-display text-4xl font-bold tracking-tight sm:text-5xl"
                                >
                                    {editingProfile ? t('profileSelector.editProfile') : t('profileSelector.addProfile')}
                                </motion.h1>

                                <motion.div
                                    variants={{ hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } } }}
                                    className="flex flex-col gap-8 rounded-3xl border border-white/[0.08] bg-[#0b0b10]/80 p-6 backdrop-blur-xl sm:p-8 md:flex-row lg:gap-10"
                                >
                                    <div className="flex flex-shrink-0 flex-col items-center gap-3">
                                        <motion.button
                                            type="button"
                                            aria-label="Changer d’avatar"
                                            whileHover={{ scale: 1.04, rotate: -2 }}
                                            whileTap={{ scale: 0.96 }}
                                            transition={SPRING}
                                            className="group relative rounded-[26%]"
                                            onClick={() => { playHaptic(); setShowAvatarSelector(true); }}
                                        >
                                            <AnimatePresence mode="popLayout" initial={false}>
                                                <motion.span
                                                    key={selectedAvatar}
                                                    initial={{ opacity: 0, scale: 0.8, rotate: -8 }}
                                                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                                                    exit={{ opacity: 0, scale: 0.8 }}
                                                    transition={SPRING}
                                                    className="block h-[128px] w-[128px] overflow-hidden rounded-[26%] bg-[#101016] ring-1 ring-white/10 transition-shadow group-hover:ring-2 group-hover:ring-white sm:h-[148px] sm:w-[148px]"
                                                >
                                                    <img src={selectedAvatar || DEFAULT_AVATARS[0]} alt="" className="h-full w-full object-cover" />
                                                </motion.span>
                                            </AnimatePresence>
                                            <span className="absolute -bottom-2 -right-2 grid h-9 w-9 place-items-center rounded-full bg-white text-black shadow-lg">
                                                <Icon name="edit" className="h-4 w-4" strokeWidth={2.2} />
                                            </span>
                                        </motion.button>
                                    </div>

                                    <div className="max-w-[500px] flex-1 space-y-6">
                                        <div>
                                            <label htmlFor="profile-name" className="mb-2 block text-[11px] font-bold uppercase tracking-[0.2em] text-white/45">Nom du profil</label>
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
                                            <label htmlFor="profile-pin" className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-white/45">
                                                <Icon name="lock" className="h-3.5 w-3.5" strokeWidth={2} /> Code PIN
                                                <span className="normal-case tracking-normal text-white/30">· facultatif</span>
                                            </label>
                                            <input
                                                id="profile-pin"
                                                type="text"
                                                inputMode="numeric"
                                                autoComplete="off"
                                                maxLength={4}
                                                value={pinCode}
                                                onChange={e => setPinCode(e.target.value.replace(/\D/g, ''))}
                                                className="field-input max-w-[180px] tracking-[0.4em]"
                                                placeholder="••••"
                                            />
                                            <p className="mt-2 text-xs text-white/40">4 chiffres demandés à chaque ouverture du profil.</p>
                                        </div>

                                        <label htmlFor="kidCheck" className="flex cursor-pointer select-none items-center justify-between gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3.5">
                                            <span className="flex items-center gap-3">
                                                <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-sky-400/10 text-sky-300"><Icon name="kid" className="h-5 w-5" /></span>
                                                <span>
                                                    <span className="block text-sm font-semibold text-white">Profil enfant</span>
                                                    <span className="block text-xs text-white/45">Affiche uniquement les contenus jeunesse.</span>
                                                </span>
                                            </span>
                                            <input type="checkbox" id="kidCheck" checked={isKid} onChange={() => setIsKid(!isKid)} className="peer sr-only" />
                                            <span aria-hidden="true" className="relative h-7 w-12 flex-none rounded-full bg-white/15 transition-colors after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-transform after:duration-300 peer-checked:bg-[#E50914] peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-white" />
                                        </label>
                                    </div>
                                </motion.div>

                                <motion.div
                                    variants={{ hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } } }}
                                    className="mt-8 flex flex-wrap gap-3 px-1"
                                >
                                    <button
                                        type="button"
                                        onClick={handleSave}
                                        disabled={!profileName.trim() || saving}
                                        className="h-12 min-w-[150px] rounded-xl bg-white px-7 text-base font-bold text-black transition-colors hover:bg-white/85 disabled:opacity-40 disabled:hover:bg-white"
                                    >
                                        {saving ? 'Enregistrement…' : editingProfile ? 'Enregistrer' : 'Créer le profil'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={closeModal}
                                        className="h-12 min-w-[150px] rounded-xl border border-white/15 bg-white/[0.06] px-7 text-base font-semibold text-white/80 transition-colors hover:bg-white/15 hover:text-white"
                                    >
                                        Annuler
                                    </button>
                                </motion.div>
                            </motion.div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

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
