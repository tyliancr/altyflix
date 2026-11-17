// "Qui regarde ?" — profile picker, profile editor and delete confirmation.
// Deliberately quiet: flat background, square avatars, a white outline on
// hover, and a short fade when a profile is chosen.
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
import Icon from '../components/ui/Icons';
import { useTranslation } from '../hooks/useTranslation';
import { sanitizeReturnUrl } from '../utils/helpers';

const ENTER_MS = 450;
const MAX_PROFILES = 5;
const TILE = 'h-[clamp(96px,13vw,152px)] w-[clamp(96px,13vw,152px)]';

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
const ProfileCard = ({ profile, index, onClick, manageMode, onDelete, isSelected, anySelected }) => (
    <li className="relative">
        <button
            type="button"
            aria-label={manageMode ? `Modifier le profil ${profile.name}` : `Choisir le profil ${profile.name}`}
            disabled={anySelected}
            onClick={() => { playHaptic('medium'); onClick(); }}
            onMouseEnter={() => { if (!manageMode) playSound('hover'); }}
            className={`group flex flex-col items-center gap-3 outline-none transition-opacity duration-300 ${anySelected && !isSelected ? 'opacity-0' : 'opacity-100'}`}
        >
            <span className={`relative block ${TILE} overflow-hidden rounded-md bg-[#1a1a1f] ring-white transition-[box-shadow,transform] duration-200 group-hover:ring-[3px] group-focus-visible:ring-[3px] ${isSelected ? 'scale-105 ring-[3px]' : ''}`}>
                <Avatar profile={profile} index={index} />
                {manageMode && (
                    <span className="absolute inset-0 grid place-items-center bg-black/55">
                        <span className="grid h-10 w-10 place-items-center rounded-full border-2 border-white text-white">
                            <Icon name="edit" className="h-5 w-5" strokeWidth={2} />
                        </span>
                    </span>
                )}
            </span>
            <span className="max-w-[clamp(96px,13vw,152px)] truncate text-sm text-white/55 transition-colors group-hover:text-white group-focus-visible:text-white sm:text-base">
                {profile.name}
            </span>
            {(profile.isKid || profile.pin) && !manageMode && (
                <span className="-mt-2 flex items-center gap-1.5 text-[11px] text-white/40">
                    {profile.pin && <Icon name="lock" className="h-3 w-3" strokeWidth={2} />}
                    {profile.isKid && 'Enfants'}
                </span>
            )}
        </button>

        {manageMode && (
            <button
                type="button"
                onClick={onDelete}
                aria-label={`Supprimer le profil ${profile.name}`}
                className="absolute -right-2 -top-2 grid h-8 w-8 place-items-center rounded-full border border-white/20 bg-[#141418] text-white/80 transition-colors hover:border-[#E50914] hover:bg-[#E50914] hover:text-white"
            >
                <Icon name="close" className="h-4 w-4" strokeWidth={2.2} />
            </button>
        )}
    </li>
);

const AddProfileCard = ({ onClick, hidden }) => (
    <li>
        <button
            type="button"
            aria-label="Ajouter un profil"
            onClick={onClick}
            className={`group flex flex-col items-center gap-3 outline-none transition-opacity duration-300 ${hidden ? 'opacity-0' : ''}`}
        >
            <span className={`grid ${TILE} place-items-center rounded-md border border-white/15 text-white/40 transition-colors group-hover:border-white group-hover:bg-white/[0.06] group-hover:text-white group-focus-visible:border-white`}>
                <Icon name="plus" className="h-12 w-12" strokeWidth={1.3} />
            </span>
            <span className="text-sm text-white/55 transition-colors group-hover:text-white sm:text-base">Ajouter</span>
        </button>
    </li>
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

    const enterProfile = (profile) => {
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
        }, prefersReducedMotion() ? 0 : ENTER_MS);
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

    return (
        <div className="relative flex min-h-screen flex-col bg-[#0b0b0e] text-white">
            <Helmet>
                <title>Qui regarde ? - ALTYFLIX</title>
                <meta name="robots" content="noindex" />
            </Helmet>

            <header className="px-[4%] py-6 md:px-[5%]">
                <ALTYFLIXLogo size={34} showText />
            </header>

            <PinModal
                isOpen={showPinModal}
                onClose={() => { setShowPinModal(false); setPendingProfile(null); }}
                onSubmit={handlePinSubmit}
                profileName={pendingProfile?.name}
            />

            <main className="flex flex-1 flex-col items-center justify-center px-[5%] pb-24">
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: leaving ? 0 : 1, y: 0 }}
                    transition={{ duration: 0.35, ease: 'easeOut' }}
                    className="mb-10 text-center sm:mb-12"
                >
                    <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-5xl">{heading}</h1>
                    {manageMode && <p className="mt-3 text-sm text-white/50">Sélectionnez un profil pour le modifier.</p>}
                </motion.div>

                <motion.ul
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.35, delay: 0.05 }}
                    className="mb-14 flex max-w-[1000px] flex-wrap justify-center gap-x-6 gap-y-8 sm:gap-x-9"
                >
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
                    {canAdd && !manageMode && <AddProfileCard hidden={leaving} onClick={openCreate} />}
                </motion.ul>

                {profiles.length > 0 && (
                    <div className={`flex flex-wrap justify-center gap-3 transition-opacity duration-300 ${leaving ? 'opacity-0' : ''}`}>
                        <button
                            type="button"
                            onClick={() => { setManageMode(!manageMode); setShowModal(false); resetForm(); }}
                            className={`h-11 rounded-md border px-6 text-sm font-semibold tracking-wide transition-colors ${manageMode
                                ? 'border-white bg-white text-black hover:bg-white/85'
                                : 'border-white/40 text-white/70 hover:border-white hover:text-white'}`}
                        >
                            {manageMode ? t('profileSelector.done') : t('profileSelector.manageProfiles')}
                        </button>
                        {manageMode && canAdd && (
                            <button
                                type="button"
                                onClick={openCreate}
                                className="h-11 rounded-md border border-white/40 px-6 text-sm font-semibold tracking-wide text-white/70 transition-colors hover:border-white hover:text-white"
                            >
                                Ajouter un profil
                            </button>
                        )}
                    </div>
                )}
            </main>

            {/* Fade to the catalogue once a profile is picked */}
            <AnimatePresence>
                {leaving && (
                    <motion.div
                        aria-hidden="true"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.25, delay: 0.2 }}
                        className="pointer-events-none fixed inset-0 z-[400] bg-[#060608]"
                    />
                )}
            </AnimatePresence>

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
                            initial={{ y: 12, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 8, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            onClick={e => e.stopPropagation()}
                            className="w-full max-w-md rounded-xl border border-white/10 bg-[#141418] p-8 text-center"
                        >
                            <div className="mx-auto mb-5 h-20 w-20 overflow-hidden rounded-md">
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
                                    className="h-11 rounded-md bg-white px-7 text-sm font-semibold text-black transition-colors hover:bg-white/85"
                                >
                                    Conserver
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { deleteProfile(profileToDelete.id); setProfileToDelete(null); }}
                                    className="h-11 rounded-md border border-white/25 px-7 text-sm font-semibold text-white/80 transition-colors hover:border-[#E50914] hover:bg-[#E50914] hover:text-white"
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
                        transition={{ duration: 0.2 }}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="profile-editor-title"
                        className="fixed inset-0 z-50 overflow-y-auto bg-[#0b0b0e]"
                    >
                        <header className="px-[4%] py-6 md:px-[5%]">
                            <ALTYFLIXLogo size={34} showText />
                        </header>

                        <div className="mx-auto w-full max-w-[680px] px-5 pb-20 pt-6 sm:pt-12">
                            <h1 id="profile-editor-title" className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                                {editingProfile ? t('profileSelector.editProfile') : t('profileSelector.addProfile')}
                            </h1>
                            <p className="mt-2 text-sm text-white/50">
                                {editingProfile ? 'Modifiez le nom, l’avatar ou le verrouillage.' : 'Ajoutez un profil pour une autre personne qui regarde ALTYFLIX.'}
                            </p>

                            <div className="mt-8 flex flex-col gap-8 border-y border-white/10 py-8 sm:flex-row">
                                <button
                                    type="button"
                                    aria-label="Changer d’avatar"
                                    className="group relative h-28 w-28 flex-none self-center overflow-hidden rounded-md sm:self-start"
                                    onClick={() => { playHaptic(); setShowAvatarSelector(true); }}
                                >
                                    <img src={selectedAvatar || DEFAULT_AVATARS[0]} alt="" className="h-full w-full object-cover" />
                                    <span className="absolute inset-x-0 bottom-0 bg-black/70 py-1.5 text-center text-xs font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                                        Changer
                                    </span>
                                </button>

                                <div className="flex-1 space-y-6">
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

                                    <label htmlFor="kidCheck" className="flex cursor-pointer select-none items-center gap-3">
                                        <input type="checkbox" id="kidCheck" checked={isKid} onChange={() => setIsKid(!isKid)} className="h-5 w-5 cursor-pointer accent-[#E50914]" />
                                        <span>
                                            <span className="block text-sm font-semibold text-white">Profil enfant</span>
                                            <span className="block text-xs text-white/45">Affiche uniquement les contenus jeunesse.</span>
                                        </span>
                                    </label>
                                </div>
                            </div>

                            <div className="mt-8 flex flex-wrap gap-3">
                                <button
                                    type="button"
                                    onClick={handleSave}
                                    disabled={!profileName.trim() || saving}
                                    className="h-11 min-w-[140px] rounded-md bg-white px-6 text-sm font-semibold text-black transition-colors hover:bg-white/85 disabled:opacity-40 disabled:hover:bg-white"
                                >
                                    {saving ? 'Enregistrement…' : editingProfile ? 'Enregistrer' : 'Créer le profil'}
                                </button>
                                <button
                                    type="button"
                                    onClick={closeModal}
                                    className="h-11 min-w-[140px] rounded-md border border-white/40 px-6 text-sm font-semibold text-white/75 transition-colors hover:border-white hover:text-white"
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
                            </div>
                        </div>
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
