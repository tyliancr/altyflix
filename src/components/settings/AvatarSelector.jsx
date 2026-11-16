import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { AVATAR_CATEGORIES } from '../../config/avatars';
import { playHaptic, playSound } from '../../utils/interactions';

const AvatarSelector = ({ currentAvatar, profileName, onSelect, onClose }) => {
    // Hide the navbar completely while this full-screen selector is open
    useEffect(() => {
        document.body.classList.add('avatar-selector-open');
        return () => document.body.classList.remove('avatar-selector-open');
    }, []);

    return (
        <motion.div
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            transition={{ type: 'tween', duration: 0.3 }}
            className="fixed inset-0 z-[300] bg-[#141414] text-white overflow-y-auto"
        >
            {/* Header — sticky, fully covers viewport (no navbar visible) */}
            <div className="flex justify-between items-start px-6 md:px-12 mb-4 bg-[#141414] sticky top-0 z-10 pt-8 md:pt-12 pb-4">
                <div className="flex gap-4 md:gap-6 pointer-events-auto">
                    <button aria-label="Fermer le choix des avatars" onClick={onClose} className="mt-1 md:mt-2 hover:text-gray-300 transition-colors">
                        <svg className="w-8 h-8 md:w-12 md:h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                    </button>
                    <div>
                        <h1 className="text-2xl md:text-4xl lg:text-5xl font-bold font-sans mb-1 md:mb-2 tracking-wide">Modifier le profil</h1>
                        <p className="text-lg md:text-2xl text-gray-300 font-medium">Choisissez une icône de profil.</p>
                    </div>
                </div>

                <div className="flex items-center gap-4 pointer-events-auto">
                    <span className="text-lg md:text-2xl font-bold uppercase tracking-wider hidden sm:block">
                        {profileName || 'NOUVEAU PROFIL'}
                    </span>
                    <div className="w-12 h-12 md:w-16 md:h-16 rounded overflow-hidden shadow-lg border border-gray-700">
                        <img
                            src={currentAvatar || AVATAR_CATEGORIES[0]?.avatars[0] || '/avatars/users-1.png'}
                            alt="Avatar actuel"
                            className="w-full h-full object-cover"
                        />
                    </div>
                </div>
            </div>

            {/* Avatar Categories */}
            <div className="pb-20 mt-4 md:mt-8">
                {AVATAR_CATEGORIES.map((category) => (
                    <div key={category.id} className="mb-10 lg:mb-14 pl-6 md:pl-16 relative">
                        <h2 className="text-xl md:text-2xl font-bold mb-4 text-white/90">{category.title}</h2>

                        {/* Horizontal scroll container */}
                        <div className="flex gap-3 md:gap-4 overflow-x-auto pb-4 pr-6 md:pr-16 snap-x" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                            {category.avatars.map((avatar, idx) => {
                                const isCurrent = currentAvatar === avatar;
                                return (
                                    <button
                                        key={`${category.id}-${idx}`}
                                        onClick={() => {
                                            playHaptic();
                                            onSelect(avatar);
                                        }}
                                        onMouseEnter={() => playSound('hover')}
                                        className={`flex-shrink-0 aspect-square rounded-[4px] overflow-hidden transition-all duration-200 snap-start
                                            w-[100px] sm:w-[120px] md:w-[140px] lg:w-[160px]
                                            ${isCurrent
                                                ? 'ring-[3px] ring-white opacity-100 scale-95 shadow-[0_0_15px_rgba(255,255,255,0.3)]'
                                                : 'hover:ring-[3px] hover:ring-white/50 opacity-60 hover:opacity-100 hover:scale-[1.03]'
                                            }`}
                                    >
                                        <img
                                            src={avatar}
                                            alt={`Avatar ${category.title} ${idx + 1}`}
                                            className="w-full h-full object-cover"
                                            loading="lazy"
                                        />
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>

            {/* eslint-disable-next-line react/no-unknown-property */}
            <style jsx="true">{`
                div::-webkit-scrollbar {
                    display: none;
                }
            `}</style>
        </motion.div>
    );
};

export default AvatarSelector;
