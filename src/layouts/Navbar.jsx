import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { DEFAULT_AVATARS } from '../config/constants';
import { useProfile } from '../contexts/ProfileContext';
import { useTranslation } from '../hooks/useTranslation';
import { playHoverSound, playClickSound } from '../utils/sounds';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import AltyflixLogo from '../components/common/AltyflixLogo';
import Icon from '../components/ui/Icons';
import { IN_TV_APP } from '../hooks/useTVNavigation';

const Navbar = () => {
    const [isScrolled, setIsScrolled] = useState(false);
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const searchInputRef = useRef(null);
    const location = useLocation();
    const navigate = useNavigate();
    const { logout } = useAuth();
    const { currentProfile } = useProfile();
    const { t } = useTranslation();
    const isSettings = location.pathname === '/settings';

    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 20);
        };
        handleScroll();
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    // Global keyboard shortcut for quick search (Ctrl+K, Cmd+K, /)
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setIsSearchOpen(true);
                setTimeout(() => searchInputRef.current?.focus(), 60);
            } else if (e.key === '/' && !isSearchOpen) {
                e.preventDefault();
                setIsSearchOpen(true);
                setTimeout(() => searchInputRef.current?.focus(), 60);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isSearchOpen]);

    const navLinks = [
        { name: t('nav.home'), path: '/' },
        { name: t('nav.movies'), path: '/films' },
        { name: t('nav.series'), path: '/series' },
        { name: 'Documentaires', path: '/documentaires' },
        { name: 'Prochainement', path: '/upcoming' },
        { name: t('nav.myList'), path: '/my-list' }
    ];

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        if (searchQuery.trim()) {
            navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
            setIsSearchOpen(false);
            setSearchQuery('');
        }
    };

    return (
        <>
            {/* Desktop Navbar */}
            <nav
                className={`hidden md:block fixed top-0 left-0 right-0 z-[200] transition-[padding] duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] select-none pointer-events-none
                ${isScrolled ? 'pt-1.5 pb-1.5' : 'pt-4 pb-4'}`}
            >
            {/* Background layer. Its bottom edge is masked to transparent: a hard
                edge on a backdrop blur renders as a dark seam over the hero. */}
            <div
                aria-hidden="true"
                className={`absolute inset-x-0 top-0 -bottom-6 transition-opacity duration-700 [mask-image:linear-gradient(to_bottom,black_60%,transparent)] ${isScrolled ? 'opacity-100' : 'opacity-0'}`}
                style={{ background: 'rgba(6,6,8,0.82)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }}
            />
            <div
                aria-hidden="true"
                className={`absolute inset-x-0 top-0 -bottom-10 bg-gradient-to-b from-[#060608]/85 to-transparent transition-opacity duration-700 ${isScrolled ? 'opacity-0' : 'opacity-100'}`}
            />
            <div className="flex items-center justify-between w-full px-[4%] md:px-[5%] h-16 relative max-w-[2000px] mx-auto pointer-events-auto">

                {/* Left: Logo — hidden on mobile */}
                <div className="hidden md:flex items-center grow shrink-0 min-w-[60px] md:min-w-[120px]">
                    <Link to="/" className="hover:scale-105 active:scale-95 transition-transform" onClick={() => playClickSound()}>
                        <AltyflixLogo
                            size={36}
                            showText={true}
                            
                        />
                    </Link>
                </div>

                {/* Center: Pill Navigation — masqué sur la page Paramètres (style Netflix) */}
                {!isSettings && (
                    <div className="flex items-center gap-2 md:gap-4 transition-all duration-500">
                        <div className="hidden lg:flex items-center bg-white/[0.05] backdrop-blur-2xl border border-white/10 rounded-full p-1">
                            {navLinks.map((link) => {
                                const isActive = location.pathname === link.path;
                                return (
                                    <Link
                                        key={link.path}
                                        to={link.path}
                                        aria-current={isActive ? 'page' : undefined}
                                        onMouseEnter={!isActive ? playHoverSound : undefined}
                                        className={`relative px-4 xl:px-5 py-2 rounded-full text-[13.5px] font-semibold whitespace-nowrap transition-colors duration-300
                                            ${isActive ? 'text-black' : 'text-white/65 hover:text-white'}`}
                                    >
                                        {isActive && (
                                            <motion.span
                                                layoutId="nav-active-pill"
                                                className="absolute inset-0 rounded-full bg-white"
                                                transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                                            />
                                        )}
                                        <span className="relative">{link.name}</span>
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Right: Search + Profile Shortcut & Mobile Menu */}
                <div className="flex items-center justify-end gap-3 md:gap-6 grow shrink-0 min-w-[60px] md:min-w-[120px]">

                    {/* Search Field — hidden on mobile and on settings page */}
                    {!isSettings && (
                        <div className="relative hidden md:flex items-center">
                            <AnimatePresence>
                                {isSearchOpen && (
                                    <motion.form
                                        initial={{ width: 0, opacity: 0 }}
                                        animate={{ width: 260, opacity: 1 }}
                                        exit={{ width: 0, opacity: 0 }}
                                        className="absolute right-0 flex items-center bg-black/75 backdrop-blur-3xl border border-white/20 focus-within:border-white/40 rounded-full px-4 py-2 z-20 shadow-2xl"
                                        onSubmit={handleSearchSubmit}
                                    >
                                        <input
                                            ref={searchInputRef}
                                            type="text"
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            placeholder="Titres, acteurs, genres..."
                                            className="bg-transparent text-white text-sm w-full outline-none focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 border-none placeholder-white/35 pr-6"
                                            style={{ outline: 'none', border: 'none', boxShadow: 'none' }}
                                            autoFocus
                                            onKeyDown={(e) => { if (e.key === 'Escape') { setSearchQuery(''); setIsSearchOpen(false); } }}
                                            onBlur={() => { if (!searchQuery) setIsSearchOpen(false); }}
                                        />
                                        <kbd className="hidden sm:inline-block text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-white/10 text-white/50 border border-white/10 pointer-events-none">
                                            Esc
                                        </kbd>
                                    </motion.form>
                                )}
                            </AnimatePresence>
                            <button
                                // TV : la page Recherche (grand champ + résultats) au lieu du petit champ dépliant
                                onClick={() => (IN_TV_APP ? navigate('/search') : setIsSearchOpen(!isSearchOpen))}
                                title="Rechercher (Ctrl + K)"
                                aria-label="Recherche"
                                className={`flex items-center gap-2 px-3 py-2 rounded-full transition-all duration-300 z-30 ${isSearchOpen ? 'text-white/40' : 'text-white/80 hover:text-white bg-white/[0.04] hover:bg-white/10 border border-white/10 hover:border-white/20 shadow-sm'}`}
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                {!isSearchOpen && (
                                    <span className="hidden xl:inline-flex items-center gap-1 text-[11px] font-mono text-white/40 uppercase">
                                        <span>Ctrl</span>
                                        <span>K</span>
                                    </span>
                                )}
                            </button>
                        </div>
                    )}

                    {/* Profile — hidden on mobile (managed in MobileBottomNav profile sheet) */}
                    <div
                        className="relative hidden md:block"
                        onMouseEnter={() => {
                            if (IN_TV_APP) return;
                            setIsProfileMenuOpen(true);
                            import('../pages/Settings');
                            import('../pages/ProfileSelector');
                        }}
                        onMouseLeave={() => setIsProfileMenuOpen(false)}
                    >
                        <button
                            type="button"
                            aria-label="Menu du profil"
                            aria-haspopup="menu"
                            aria-expanded={isProfileMenuOpen}
                            // TV : l'avatar mène directement à « Qui regarde ? » (pas de menu, pas de déconnexion par erreur)
                            onClick={() => (IN_TV_APP ? navigate('/profiles') : setIsProfileMenuOpen(open => !open))}
                            className="flex items-center gap-2 group"
                        >
                            <div className="w-9 h-9 rounded-md overflow-hidden ring-1 ring-white/20 group-hover:ring-white/70 transition-all flex-shrink-0">
                                <img
                                    src={currentProfile?.avatar || DEFAULT_AVATARS[0]}
                                    alt="Profile"
                                    className="w-full h-full object-cover"
                                    onError={(e) => { e.currentTarget.src = DEFAULT_AVATARS[0]; }}
                                />
                            </div>
                        </button>

                        <AnimatePresence>
                            {isProfileMenuOpen && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                    transition={{ duration: 0.15 }}
                                    className="absolute top-full right-0 mt-2 w-60 bg-[#141418] rounded-xl py-2 border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.7)] overflow-hidden z-[300]"
                                >
                                    <div className="px-2 space-y-1">
                                        <Link
                                            to="/profiles"
                                            onClick={() => setIsProfileMenuOpen(false)}
                                            onMouseEnter={() => import('../pages/ProfileSelector')}
                                            className="flex items-center gap-3 px-4 py-3 text-sm text-white/70 hover:text-white hover:bg-white/10 rounded-2xl transition-all group"
                                        >
                                            <div className="w-8 h-8 rounded-lg overflow-hidden border border-white/10 group-hover:border-white/30 transition-all">
                                                <img src={currentProfile?.avatar} alt="" className="w-full h-full object-cover" />
                                            </div>
                                            {t('nav.switchProfile')}
                                        </Link>
                                        <Link
                                            to="/settings"
                                            onClick={() => setIsProfileMenuOpen(false)}
                                            onMouseEnter={() => import('../pages/Settings')}
                                            className="flex items-center gap-3 px-4 py-3 text-sm text-white/70 hover:text-white hover:bg-white/10 rounded-2xl transition-all group"
                                        >
                                            <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-white/40 group-hover:text-white group-hover:bg-white/10 transition-all">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                            </div>
                                            {t('nav.settings')}
                                        </Link>
                                    </div>
                                    <div className="h-px bg-white/5 my-3" />
                                    <div className="px-2">
                                        <button onClick={logout} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-[#ff5a63] font-semibold hover:bg-[#E50914]/10 rounded-2xl transition-all">
                                            <span className="w-8 h-8 rounded-lg bg-[#E50914]/10 flex items-center justify-center"><Icon name="logout" className="w-4 h-4" /></span>
                                            {t('nav.logout')}
                                        </button>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Menu button for tablet widths, where the link pill is hidden (phones use the bottom bar) — hidden on settings */}
                    {!isSettings && (
                        <button
                            type="button"
                            aria-label="Ouvrir le menu"
                            className="hidden md:block lg:hidden text-white/80 hover:text-white p-2.5 rounded-full hover:bg-white/10 transition-all"
                            onClick={() => setIsMobileMenuOpen(true)}
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>

            {/* Mobile Navigation Slider */}
            <AnimatePresence>
                {isMobileMenuOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="pointer-events-auto fixed inset-0 bg-black/80 z-[400]"
                            onClick={() => setIsMobileMenuOpen(false)}
                        />
                        <motion.div
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className="pointer-events-auto fixed bottom-0 left-0 right-0 bg-[#111116] border-t border-white/10 z-[401] rounded-t-2xl px-8 pt-10 pb-12"
                        >
                            <div className="flex flex-col gap-6">
                                {navLinks.map((link) => (
                                    <Link
                                        key={link.name}
                                        to={link.path}
                                        onClick={() => setIsMobileMenuOpen(false)}
                                        className="text-white/85 hover:text-white text-2xl font-semibold tracking-tight transition-colors"
                                    >
                                        {link.name}
                                    </Link>
                                ))}
                                <div className="h-px bg-white/10 my-4" />
                                <button type="button" onClick={() => { logout(); setIsMobileMenuOpen(false); }} className="text-[#ff5a63] text-lg font-semibold text-left">{t('nav.logout')}</button>
                            </div>
                            <button
                                type="button"
                                aria-label="Fermer le menu"
                                className="absolute top-6 right-6 p-3 rounded-full bg-white/5 text-white/60 hover:text-white"
                                onClick={() => setIsMobileMenuOpen(false)}
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </nav>

        {/* Mobile Top Header (Authentic Netflix App Experience) */}
        <header
            className={`md:hidden fixed top-0 inset-x-0 z-[150] transition-colors duration-300 pointer-events-auto select-none pt-[max(0.75rem,env(safe-area-inset-top))] px-4 pb-2.5 ${
                isScrolled
                    ? 'bg-[#060608]/95 backdrop-blur-2xl border-b border-white/[0.08] shadow-lg'
                    : 'bg-gradient-to-b from-black/85 via-black/40 to-transparent'
            }`}
        >
            <div className="flex items-center justify-between h-10">
                <Link to="/" onClick={playClickSound} className="flex items-center gap-2 active:scale-95 transition-transform">
                    <AltyflixLogo size={28} />
                </Link>

                <div className="flex items-center gap-2.5">
                    {!isSettings && (
                        <Link
                            to="/search"
                            className="w-9 h-9 rounded-full bg-white/[0.07] flex items-center justify-center text-white/80 hover:text-white active:scale-90 transition-transform"
                            aria-label="Rechercher"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </Link>
                    )}
                    <Link
                        to="/settings"
                        className="w-8 h-8 rounded-lg overflow-hidden border border-white/20 active:scale-90 transition-transform flex-shrink-0"
                        aria-label="Mon compte"
                    >
                        <img
                            src={currentProfile?.avatar || DEFAULT_AVATARS[0]}
                            alt="Avatar"
                            className="w-full h-full object-cover"
                            onError={(e) => { e.currentTarget.src = DEFAULT_AVATARS[0]; }}
                        />
                    </Link>
                </div>
            </div>

            {/* Quick navigation pills on mobile: Séries, Films, Nouveautés, Ma liste — masqués sur les paramètres */}
            {!isSettings && (
                <div className="flex items-center gap-4 pt-1.5 pb-0.5 overflow-x-auto no-scrollbar text-xs font-bold text-white/80">
                    <Link
                        to="/series"
                        className={`transition-colors whitespace-nowrap ${location.pathname === '/series' ? 'text-white border-b-2 border-[#e50914] pb-0.5' : 'hover:text-white'}`}
                    >
                        Séries
                    </Link>
                    <Link
                        to="/films"
                        className={`transition-colors whitespace-nowrap ${location.pathname === '/films' ? 'text-white border-b-2 border-[#e50914] pb-0.5' : 'hover:text-white'}`}
                    >
                        Films
                    </Link>
                    <Link
                        to="/upcoming"
                        className={`transition-colors whitespace-nowrap ${location.pathname === '/upcoming' ? 'text-white border-b-2 border-[#e50914] pb-0.5' : 'hover:text-white'}`}
                    >
                        Nouveautés
                    </Link>
                    <Link
                        to="/my-list"
                        className={`transition-colors whitespace-nowrap ${location.pathname === '/my-list' ? 'text-white border-b-2 border-[#e50914] pb-0.5' : 'hover:text-white'}`}
                    >
                        Ma liste
                    </Link>
                </div>
            )}
        </header>
        </>
    );
};

export default Navbar;
