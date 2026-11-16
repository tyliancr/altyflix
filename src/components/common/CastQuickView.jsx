import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPersonDetails } from '../../services/tmdb';
import { getPosterUrl, getContentType } from '../../utils/helpers';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from '../../hooks/useTranslation';

const LOCALE_MAP = { fr: 'fr-FR', en: 'en-US', es: 'es-ES', de: 'de-DE', it: 'it-IT' };

const CastQuickView = ({ isOpen, onClose, personId }) => {
    const navigate = useNavigate();
    const { t, language } = useTranslation();
    const [person, setPerson] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);
    const [bioBiographyExpanded, setBiographyExpanded] = useState(false);

    const locale = LOCALE_MAP[language] || 'fr-FR';

    // Lock body scroll when drawer is open (critical for PWA/iOS)
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            document.body.style.touchAction = 'none';
        } else {
            document.body.style.overflow = '';
            document.body.style.touchAction = '';
            setBiographyExpanded(false);
        }
        return () => {
            document.body.style.overflow = '';
            document.body.style.touchAction = '';
        };
    }, [isOpen]);

    useEffect(() => {
        if (!personId || !isOpen) return;
        let isMounted = true;
        const fetchPersonDetails = async () => {
            setLoading(true);
            setError(false);
            setPerson(null);
            try {
                const data = await getPersonDetails(personId);
                if (isMounted) setPerson(data);
            } catch (err) {
                console.error('Failed to fetch person details:', err);
                if (isMounted) setError(true);
            } finally {
                if (isMounted) setLoading(false);
            }
        };
        fetchPersonDetails();
        return () => { isMounted = false; };
    }, [personId, isOpen]);

    const getAgeInfo = useCallback(() => {
        if (!person?.birthday) return null;
        const birth = new Date(person.birthday);
        const end = person.deathday ? new Date(person.deathday) : new Date();
        let age = end.getFullYear() - birth.getFullYear();
        if (
            end.getMonth() < birth.getMonth() ||
            (end.getMonth() === birth.getMonth() && end.getDate() < birth.getDate())
        ) age--;
        return person.deathday ? `${age} ans (décédé·e)` : `${age} ans`;
    }, [person]);

    const knownFor = (() => {
        if (!person) return [];
        return [
            ...(person.movie_credits?.cast || []).map(i => ({ ...i, media_type: 'movie' })),
            ...(person.tv_credits?.cast || []).map(i => ({ ...i, media_type: 'tv' })),
        ]
            .filter(i => i.poster_path)
            .reduce((acc, curr) => {
                if (!acc.find(i => i.id === curr.id)) acc.push(curr);
                return acc;
            }, [])
            .sort((a, b) => b.popularity - a.popularity)
            .slice(0, 8);
    })();

    const handleViewFull = useCallback(() => {
        onClose();
        navigate(`/person/${person.id}`);
    }, [onClose, navigate, person]);

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* ── Backdrop ─────────────────────────────────────── */}
                    <motion.div
                        className="fixed inset-0 z-[900] bg-black/75"
                        style={{ backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        onClick={onClose}
                    />

                    {/* ── Panel ────────────────────────────────────────────
                        Mobile: bottom sheet (slide from bottom)
                        Desktop: right sidebar (slide from right)
                    ─────────────────────────────────────────────────────── */}

                    {/* MOBILE: Bottom Sheet */}
                    <motion.div
                        className="md:hidden fixed inset-x-0 bottom-0 z-[910] flex flex-col rounded-t-2xl overflow-hidden"
                        style={{
                            maxHeight: '92dvh',
                            background: '#111118',
                            boxShadow: '0 -8px 40px rgba(0,0,0,0.8)',
                        }}
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        transition={{ type: 'spring', damping: 32, stiffness: 350 }}
                    >
                        {/* Handle bar */}
                        <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
                            <div className="w-10 h-1 rounded-full bg-white/20" />
                        </div>

                        {/* Header */}
                        <div className="flex items-center justify-between px-5 pb-3 border-b border-white/10 flex-shrink-0">
                            <div>
                                <h2 className="text-lg font-black text-white tracking-tight uppercase" style={{ fontFamily: 'Outfit, sans-serif' }}>
                                    {loading ? 'Chargement…' : person?.name || 'Profil'}
                                </h2>
                                {!loading && person?.known_for_department && (
                                    <p className="text-xs text-[#E50914] font-bold tracking-widest uppercase mt-0.5">
                                        {person.known_for_department}
                                    </p>
                                )}
                            </div>
                            <button
                                onClick={onClose}
                                className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 text-white active:scale-90"
                                aria-label="Fermer"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Scrollable content */}
                        <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
                            <MobileContent
                                loading={loading}
                                error={error}
                                person={person}
                                knownFor={knownFor}
                                locale={locale}
                                getAgeInfo={getAgeInfo}
                                bioBiographyExpanded={bioBiographyExpanded}
                                setBiographyExpanded={setBiographyExpanded}
                                onClose={onClose}
                                navigate={navigate}
                                t={t}
                            />
                        </div>

                        {/* Footer CTA */}
                        {!loading && person && (
                            <div className="px-5 py-4 border-t border-white/10 flex-shrink-0" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
                                <button
                                    onClick={handleViewFull}
                                    className="w-full py-3.5 bg-[#E50914] text-white font-bold rounded-xl flex items-center justify-center gap-2 text-sm tracking-widest uppercase active:scale-95"
                                    style={{ transition: 'transform 150ms' }}
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                    </svg>
                                    {t('detail.viewFullProfile')}
                                </button>
                            </div>
                        )}
                    </motion.div>

                    {/* DESKTOP: Right Sidebar */}
                    <motion.div
                        className="hidden md:flex fixed inset-y-0 right-0 w-[480px] z-[910] flex-col"
                        style={{
                            background: '#111118',
                            boxShadow: '-8px 0 60px rgba(0,0,0,0.7)',
                            borderLeft: '1px solid rgba(255,255,255,0.08)',
                        }}
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-8 py-6 border-b border-white/10 flex-shrink-0">
                            <div>
                                <h2 className="text-2xl font-black text-white tracking-tight uppercase" style={{ fontFamily: 'Outfit, sans-serif' }}>
                                    {loading ? 'Chargement…' : person?.name || 'Profil'}
                                </h2>
                                {!loading && person?.known_for_department && (
                                    <p className="text-xs text-[#E50914] mt-0.5 font-bold tracking-widest uppercase">
                                        {person.known_for_department}
                                    </p>
                                )}
                            </div>
                            <button
                                onClick={onClose}
                                className="w-10 h-10 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/15 text-white/60 hover:text-white active:scale-90"
                                style={{ transition: 'background 200ms, color 200ms, transform 150ms' }}
                                aria-label="Fermer"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto overscroll-contain px-8 py-6 space-y-6 no-scrollbar">
                            <DesktopContent
                                loading={loading}
                                error={error}
                                person={person}
                                knownFor={knownFor}
                                locale={locale}
                                getAgeInfo={getAgeInfo}
                                bioBiographyExpanded={bioBiographyExpanded}
                                setBiographyExpanded={setBiographyExpanded}
                                onClose={onClose}
                                navigate={navigate}
                                t={t}
                            />
                        </div>

                        {/* Footer CTA */}
                        {!loading && person && (
                            <div className="px-8 py-5 border-t border-white/10 flex-shrink-0">
                                <button
                                    onClick={handleViewFull}
                                    className="w-full py-3.5 bg-[#E50914] text-white font-bold rounded-xl flex items-center justify-center gap-2 text-sm tracking-widest uppercase hover:bg-[#f40612] active:scale-95"
                                    style={{ transition: 'background 200ms, transform 150ms' }}
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                    </svg>
                                    {t('detail.viewFullProfile')}
                                </button>
                            </div>
                        )}
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

/* ─── Shared inner content blocks ────────────────────────────────────────── */

const LoadingState = () => (
    <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="w-10 h-10 border-4 border-white/15 border-t-[#E50914] rounded-full animate-spin" />
        <p className="text-sm text-white/40 font-medium">Chargement…</p>
    </div>
);

const ErrorState = ({ onClose }) => (
    <div className="text-center py-20 text-white/50 space-y-3">
        <p className="text-lg font-semibold">Profil introuvable</p>
        <button onClick={onClose} className="text-[#E50914] font-bold text-sm underline">Fermer</button>
    </div>
);

const PersonMeta = ({ person, locale, getAgeInfo }) => (
    <div className="flex gap-5 items-start">
        {/* Photo */}
        <div className="w-28 flex-shrink-0 aspect-[2/3] rounded-xl overflow-hidden bg-[#222] shadow-xl border border-white/10">
            {person.profile_path ? (
                <img
                    src={getPosterUrl(person.profile_path, 'h632')}
                    alt={person.name}
                    className="w-full h-full object-cover"
                    decoding="async"
                />
            ) : (
                <div className="w-full h-full flex items-center justify-center">
                    <svg className="w-10 h-10 text-white/20" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 12c2.67 0 8 1.34 8 4v2H4v-2c0-2.66 5.33-4 8-4zm0-2a4 4 0 100-8 4 4 0 000 8z" />
                    </svg>
                </div>
            )}
        </div>

        {/* Info */}
        <div className="flex-1 space-y-3 pt-1 text-sm">
            {person.birthday && (
                <div>
                    <span className="block text-[10px] text-white/30 uppercase tracking-widest font-semibold mb-0.5">Né·e le</span>
                    <span className="font-medium text-white/90">
                        {new Date(person.birthday).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })}
                    </span>
                    {getAgeInfo() && (
                        <span className="block text-xs text-white/50 mt-0.5">({getAgeInfo()})</span>
                    )}
                </div>
            )}
            {person.place_of_birth && (
                <div>
                    <span className="block text-[10px] text-white/30 uppercase tracking-widest font-semibold mb-0.5">Lieu de naissance</span>
                    <span className="font-medium text-white/90 leading-tight block">{person.place_of_birth}</span>
                </div>
            )}
            {person.popularity && (
                <div>
                    <span className="block text-[10px] text-white/30 uppercase tracking-widest font-semibold mb-0.5">Popularité</span>
                    <span className="font-medium text-white/90">{Math.round(person.popularity)}</span>
                </div>
            )}
        </div>
    </div>
);

const BiographyBlock = ({ biography, expanded, setExpanded }) => {
    const text = biography || 'Aucune biographie disponible.';
    const isLong = text.length > 300;

    return (
        <div className="space-y-2">
            <h3 className="text-white font-bold text-sm tracking-widest uppercase border-b border-white/8 pb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Biographie
            </h3>
            <p className="text-white/70 text-sm leading-relaxed whitespace-pre-line font-light">
                {isLong && !expanded ? `${text.slice(0, 300)}…` : text}
            </p>
            {isLong && (
                <button
                    onClick={() => setExpanded(v => !v)}
                    className="text-[#E50914] text-xs font-bold tracking-wider uppercase mt-1"
                    style={{ transition: 'opacity 150ms' }}
                >
                    {expanded ? 'Voir moins ↑' : 'Voir plus ↓'}
                </button>
            )}
        </div>
    );
};

const KnownForBlock = ({ knownFor, onClose, navigate, t }) => {
    if (!knownFor.length) return null;
    return (
        <div className="space-y-3">
            <h3 className="text-white font-bold text-sm tracking-widest uppercase border-b border-white/8 pb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
                {t('detail.knownFor')}
            </h3>
            <div className="grid grid-cols-4 gap-2.5">
                {knownFor.map(credit => {
                    const title = credit.title || credit.name;
                    const mType = getContentType(credit, credit.media_type);
                    return (
                        <button
                            key={`${credit.media_type}-${credit.id}`}
                            onClick={() => { onClose(); navigate(`/${mType}/${credit.id}`); }}
                            className="group text-left"
                        >
                            <div
                                className="aspect-[2/3] rounded-lg overflow-hidden bg-[#222] border border-white/5 mb-1.5"
                                style={{ transition: 'transform 200ms, border-color 200ms' }}
                                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }}
                                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'; }}
                            >
                                <img
                                    src={getPosterUrl(credit.poster_path, 'w185')}
                                    alt={title}
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                    decoding="async"
                                />
                            </div>
                            <p className="text-[10px] font-bold text-white/70 line-clamp-2 group-hover:text-white leading-tight" style={{ transition: 'color 150ms' }}>
                                {title}
                            </p>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

/* Mobile content wrapper */
const MobileContent = ({ loading, error, person, knownFor, locale, getAgeInfo, bioBiographyExpanded, setBiographyExpanded, onClose, navigate, t }) => {
    if (loading) return <LoadingState />;
    if (error) return <ErrorState onClose={onClose} />;
    if (!person) return null;
    return (
        <div className="px-5 py-4 space-y-6 pb-4">
            <PersonMeta person={person} locale={locale} getAgeInfo={getAgeInfo} />
            <BiographyBlock biography={person.biography} expanded={bioBiographyExpanded} setExpanded={setBiographyExpanded} />
            <KnownForBlock knownFor={knownFor} onClose={onClose} navigate={navigate} t={t} />
        </div>
    );
};

/* Desktop content wrapper */
const DesktopContent = ({ loading, error, person, knownFor, locale, getAgeInfo, bioBiographyExpanded, setBiographyExpanded, onClose, navigate, t }) => {
    if (loading) return <LoadingState />;
    if (error) return <ErrorState onClose={onClose} />;
    if (!person) return null;
    return (
        <>
            <PersonMeta person={person} locale={locale} getAgeInfo={getAgeInfo} />
            <BiographyBlock biography={person.biography} expanded={bioBiographyExpanded} setExpanded={setBiographyExpanded} />
            <KnownForBlock knownFor={knownFor} onClose={onClose} navigate={navigate} t={t} />
        </>
    );
};

export default CastQuickView;
