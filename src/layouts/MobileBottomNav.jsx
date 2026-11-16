import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { NavLink, useNavigate } from 'react-router-dom';
import { useProfile } from '../contexts/ProfileContext';
import { useAuth } from '../contexts/AuthContext';
import { DEFAULT_AVATARS } from '../config/constants';

const MobileBottomNav = () => {
    const { currentProfile } = useProfile();
    const { logout } = useAuth();
    const navigate = useNavigate();
    const [profileMenuOpen, setProfileMenuOpen] = useState(false);

    const navItems = [
        {
            name: 'Accueil',
            path: '/',
            exact: true,
            icon: (active) => (
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
                    <path
                        d="M3 9.5L12 3L21 9.5V20C21 20.55 20.55 21 20 21H15V15H9V21H4C3.45 21 3 20.55 3 20V9.5Z"
                        fill={active ? 'white' : 'none'}
                        stroke="white"
                        strokeWidth={active ? 0 : 1.6}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
            )
        },
        {
            name: 'Recherche',
            path: '/search',
            icon: (active) => (
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
                    <circle
                        cx="11" cy="11" r="7"
                        stroke="white"
                        strokeWidth="1.8"
                        fill={active ? 'white' : 'none'}
                    />
                    <path d="M16.5 16.5L21 21" stroke="white" strokeWidth="2" strokeLinecap="round" />
                    {active && <circle cx="11" cy="11" r="4" fill="#141414" />}
                </svg>
            )
        },
        {
            name: 'Ma Liste',
            path: '/my-list',
            icon: (active) => (
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
                    <path
                        d="M5 3H19C19.55 3 20 3.45 20 4V21L12 17.5L4 21V4C4 3.45 4.45 3 5 3Z"
                        fill={active ? 'white' : 'none'}
                        stroke="white"
                        strokeWidth={active ? 0 : 1.6}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
            )
        },
        {
            name: 'Mon Profil',
            isProfileMenu: true,
            icon: (_active) => (
                <div className="w-7 h-7 rounded-lg overflow-hidden border-2 border-white/30">
                    <img
                        src={currentProfile?.avatar || DEFAULT_AVATARS[0]}
                        alt="Profil"
                        className="w-full h-full object-cover"
                    />
                </div>
            )
        }
    ];

    return (
        <>
            {/* Profile Action Sheet */}
            <AnimatePresence>
                {profileMenuOpen && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setProfileMenuOpen(false)}
                            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60]"
                        />
                        {/* Sheet */}
                        <motion.div
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                            className="fixed bottom-0 left-0 right-0 z-[70] bg-[#0c0c12]/95 backdrop-blur-3xl rounded-t-3xl pt-2 pb-10 border-t border-white/10 shadow-[0_-20px_50px_rgba(0,0,0,0.9)]"
                        >
                            {/* Drag Handle */}
                            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-6" />

                            {/* Current Profile */}
                            <div className="flex items-center gap-4 px-6 pb-5 border-b border-white/10 mb-2">
                                <div className="w-14 h-14 rounded-xl overflow-hidden border-2 border-white/20">
                                    <img
                                        src={currentProfile?.avatar || DEFAULT_AVATARS[0]}
                                        alt="Profil"
                                        className="w-full h-full object-cover"
                                    />
                                </div>
                                <div>
                                    <p className="text-white font-bold text-lg">{currentProfile?.name || 'Mon Profil'}</p>
                                    <p className="text-white/40 text-sm">Profil actif</p>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="px-4 space-y-1">
                                <button
                                    onClick={() => { navigate('/profiles'); setProfileMenuOpen(false); }}
                                    className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl hover:bg-white/5 active:bg-white/10 transition-all text-left"
                                >
                                    <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white flex-shrink-0">
                                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <p className="text-white font-semibold text-sm sm:text-base">Changer de profil</p>
                                        <p className="text-white/40 text-xs">Gérer les spectateurs</p>
                                    </div>
                                </button>

                                <button
                                    onClick={() => { navigate('/documentaires'); setProfileMenuOpen(false); }}
                                    className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl hover:bg-white/5 active:bg-white/10 transition-all text-left"
                                >
                                    <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white flex-shrink-0">
                                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                                            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    </div>
                                    <div>
                                        <p className="text-white font-semibold text-sm sm:text-base">Documentaires</p>
                                        <p className="text-white/40 text-xs">Science, Histoire, Nature</p>
                                    </div>
                                </button>

                                <button
                                    onClick={() => { navigate('/upcoming'); setProfileMenuOpen(false); }}
                                    className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl hover:bg-white/5 active:bg-white/10 transition-all text-left"
                                >
                                    <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white flex-shrink-0">
                                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <p className="text-white font-semibold text-sm sm:text-base">À venir / Prochainement</p>
                                        <p className="text-white/40 text-xs">Nouvelles sorties attendues</p>
                                    </div>
                                </button>

                                <button
                                    onClick={() => { navigate('/settings'); setProfileMenuOpen(false); }}
                                    className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl hover:bg-white/5 active:bg-white/10 transition-all text-left"
                                >
                                    <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white flex-shrink-0">
                                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <p className="text-white font-semibold text-sm sm:text-base">Paramètres</p>
                                        <p className="text-white/40 text-xs">Langue, PIN, préférences</p>
                                    </div>
                                </button>

                                <div className="h-px bg-white/10 my-2" />

                                <button
                                    onClick={() => { logout(); setProfileMenuOpen(false); }}
                                    className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl hover:bg-red-500/10 active:bg-red-500/20 transition-all text-left"
                                >
                                    <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center text-red-500 flex-shrink-0">
                                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                        </svg>
                                    </div>
                                    <div>
                                        <p className="text-red-400 font-semibold text-sm sm:text-base">Se déconnecter</p>
                                    </div>
                                </button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* Bottom Bar */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 z-50">
                <div className="absolute inset-0 bg-[#060608]/90 backdrop-blur-3xl border-t border-white/[0.08] shadow-[0_-10px_30px_rgba(0,0,0,0.8)]" />
                <nav className="relative flex items-center justify-around h-16 w-full px-2 pb-safe">
                    {navItems.map((item) => {
                        if (item.isProfileMenu) {
                            return (
                                <button
                                    key="profile"
                                    onClick={() => {
                                        setProfileMenuOpen(true);
                                        import('../pages/Settings');
                                        import('../pages/ProfileSelector');
                                    }}
                                    onTouchStart={() => {
                                        import('../pages/Settings');
                                        import('../pages/ProfileSelector');
                                    }}
                                    className="flex flex-col items-center justify-center gap-1 w-16 h-full text-white/40 transition-all duration-200"
                                >
                                    <motion.div
                                        className="flex items-center justify-center"
                                        whileTap={{ scale: 0.9 }}
                                    >
                                        {item.icon(false)}
                                    </motion.div>
                                    <span className="text-[9px] font-semibold tracking-wide leading-none text-white/40">
                                        {item.name}
                                    </span>
                                </button>
                            );
                        }

                        return (
                            <NavLink
                                key={item.name}
                                to={item.path}
                                end={item.exact}
                                className={({ isActive }) => `
                                    relative flex flex-col items-center justify-center gap-1 w-16 h-full transition-all duration-200
                                    ${isActive ? 'text-white' : 'text-white/40'}
                                `}
                            >
                                {({ isActive }) => (
                                    <>
                                        {isActive && (
                                            <motion.div
                                                layoutId="mobile-nav-indicator"
                                                className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-ALTYFLIX-primary rounded-b-full"
                                                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                                            />
                                        )}
                                        <motion.div
                                            className="flex items-center justify-center"
                                            animate={{ scale: isActive ? 1.05 : 1 }}
                                            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                                        >
                                            {item.icon(isActive)}
                                        </motion.div>
                                        <span className={`text-[9px] font-semibold tracking-wide leading-none ${isActive ? 'text-white' : 'text-white/40'}`}>
                                            {item.name}
                                        </span>
                                    </>
                                )}
                            </NavLink>
                        );
                    })}
                </nav>
            </div>
        </>
    );
};

export default MobileBottomNav;
