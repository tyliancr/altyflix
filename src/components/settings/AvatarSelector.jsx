import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { AVATAR_CATEGORIES } from '../../config/avatars';
import { playHaptic, playSound } from '../../utils/interactions';
import Icon from '../ui/Icons';

const EASE = [0.16, 1, 0.3, 1];

/** Full-screen avatar picker: one shelf per collection. */
const AvatarSelector = ({ currentAvatar, profileName, onSelect, onClose }) => {
    const closeRef = useRef(onClose);
    closeRef.current = onClose;

    // Hide the navbar while the picker covers the screen, and close on Escape
    useEffect(() => {
        document.body.classList.add('avatar-selector-open');
        const onKey = (e) => { if (e.key === 'Escape') closeRef.current(); };
        window.addEventListener('keydown', onKey);
        return () => {
            document.body.classList.remove('avatar-selector-open');
            window.removeEventListener('keydown', onKey);
        };
    }, []);

    return (
        <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Choisir un avatar"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="no-scrollbar fixed inset-0 z-[300] overflow-y-auto bg-[#060608] text-white"
        >
            <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-white/[0.07] bg-[#060608]/85 px-[4%] py-4 backdrop-blur-xl md:px-[5%] md:py-5">
                <div className="flex min-w-0 items-center gap-4">
                    <button
                        type="button"
                        aria-label="Fermer le choix des avatars"
                        onClick={onClose}
                        className="grid h-11 w-11 flex-none place-items-center rounded-full border border-white/15 bg-white/[0.06] text-white transition-colors hover:bg-white/15"
                    >
                        <Icon name="chevronLeft" strokeWidth={2.2} />
                    </button>
                    <div className="min-w-0">
                        <h1 className="truncate font-display text-2xl font-bold tracking-tight sm:text-3xl">Choisir un avatar</h1>
                        <p className="truncate text-sm text-white/50">Pour {profileName || 'ce profil'}</p>
                    </div>
                </div>
                <span className="block h-12 w-12 flex-none overflow-hidden rounded-[26%] bg-[#101016] ring-1 ring-white/15 sm:h-14 sm:w-14">
                    <img
                        src={currentAvatar || AVATAR_CATEGORIES[0]?.avatars[0] || '/avatars/users-1.png'}
                        alt="Avatar actuel"
                        className="h-full w-full object-cover"
                    />
                </span>
            </header>

            <div className="space-y-10 pb-24 pt-8">
                {AVATAR_CATEGORIES.map((category, row) => (
                    <motion.section
                        key={category.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.45, delay: Math.min(row * 0.06, 0.3), ease: EASE }}
                    >
                        <h2 className="mb-4 px-[4%] font-display text-xl font-bold tracking-tight text-white md:px-[5%]">{category.title}</h2>
                        <div className="no-scrollbar flex gap-3 overflow-x-auto px-[4%] py-2 md:gap-4 md:px-[5%]">
                            {category.avatars.map((avatar, idx) => {
                                const isCurrent = currentAvatar === avatar;
                                return (
                                    <motion.button
                                        key={`${category.id}-${idx}`}
                                        type="button"
                                        aria-label={`Avatar ${category.title} ${idx + 1}`}
                                        aria-pressed={isCurrent}
                                        whileHover={{ scale: 1.07, y: -4 }}
                                        whileTap={{ scale: 0.95 }}
                                        transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                                        onClick={() => { playHaptic(); onSelect(avatar); }}
                                        onMouseEnter={() => playSound('hover')}
                                        className={`relative aspect-square w-[96px] flex-none rounded-[26%] outline-none sm:w-[116px] md:w-[136px] ${isCurrent ? 'ring-[3px] ring-white ring-offset-4 ring-offset-[#060608]' : 'ring-1 ring-white/10 hover:ring-2 hover:ring-white/70'}`}
                                    >
                                        <span className="block h-full w-full overflow-hidden rounded-[26%] bg-[#101016]">
                                            <img src={avatar} alt="" className="h-full w-full object-cover" loading="lazy" />
                                        </span>
                                        {isCurrent && (
                                            <span className="absolute -bottom-1.5 -right-1.5 grid h-7 w-7 place-items-center rounded-full bg-white text-black shadow-lg">
                                                <Icon name="check" className="h-4 w-4" strokeWidth={3} />
                                            </span>
                                        )}
                                    </motion.button>
                                );
                            })}
                        </div>
                    </motion.section>
                ))}
            </div>
        </motion.div>
    );
};

export default AvatarSelector;
