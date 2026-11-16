import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { storage } from '../utils/helpers';
import { motion, AnimatePresence } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import ALTYFLIXLogo from '../components/common/AltyflixLogo';
import { useTranslation } from '../hooks/useTranslation';

// ── Icons ──────────────────────────────────────────────────────────────────
const ChevronRight = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-5 h-5 sm:w-6 sm:h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
);

const LanguageIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802" />
    </svg>
);

// ── Poster Carousel ─────────────────────────────────────────────────────────
// 3 rows that scroll in alternating directions
const POSTER_ROWS = [
    [
        'https://image.tmdb.org/t/p/w300/1g0dhYtq4irTY1GPXvft6k4YLjm.jpg',
        'https://image.tmdb.org/t/p/w300/rktDFPbfHfUbArZ6OOOKsXcv0Bm.jpg',
        'https://image.tmdb.org/t/p/w300/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg',
        'https://image.tmdb.org/t/p/w300/9Gtg2DzBhmYamXBS1hKAhiwbBKS.jpg',
        'https://image.tmdb.org/t/p/w300/6KErczPBROQty7QoIsaa6wJYXZi.jpg',
        'https://image.tmdb.org/t/p/w300/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg',
        'https://image.tmdb.org/t/p/w300/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg',
        'https://image.tmdb.org/t/p/w300/A7EByudX0eqqTwm9nuHiz57lrOi.jpg',
    ],
    [
        'https://image.tmdb.org/t/p/w300/cdqLnri3NEGcmfnqwk2TSIYtddg.jpg',
        'https://image.tmdb.org/t/p/w300/zg0UAqhBMuzFWKKMEPVAa7kQe3T.jpg',
        'https://image.tmdb.org/t/p/w300/xDMIl84Qo5Tsu62c9DGWhmPI67A.jpg',
        'https://image.tmdb.org/t/p/w300/jRXYjXNq0Cs2TcJjLkki24MLp7u.jpg',
        'https://image.tmdb.org/t/p/w300/t6HIqrRAclMCA60NsSmeqe9RmNV.jpg',
        'https://image.tmdb.org/t/p/w300/hek3koDUyRQk7FIhPXsa6mT2Zc3.jpg',
        'https://image.tmdb.org/t/p/w300/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg',
        'https://image.tmdb.org/t/p/w300/lDF0TiMdCE6ZJiCBjNHdTBrToiE.jpg',
    ],
    [
        'https://image.tmdb.org/t/p/w300/suaEOtk1N1sgg2MTM7oZd2cfVp3.jpg',
        'https://image.tmdb.org/t/p/w300/rSPw7tgCH9c6NqICZef4kZjFOQ5.jpg',
        'https://image.tmdb.org/t/p/w300/AkJQpZp9WoNdj7pLYSj1L0RcMMN.jpg',
        'https://image.tmdb.org/t/p/w300/iQFcwSGbZXMkeyKrxbPnwnRo5fl.jpg',
        'https://image.tmdb.org/t/p/w300/tsRy63Mu5cu8etL1X7ZLyf7UP1M.jpg',
        'https://image.tmdb.org/t/p/w300/9fa79Ads3VhhM2oUXKqB7FcGFYe.jpg',
        'https://image.tmdb.org/t/p/w300/pHkKbud5BQ1hkWuFq2wjstRXiDY.jpg',
        'https://image.tmdb.org/t/p/w300/qdIMHd4sEfJSckfVJfKQvisL02a.jpg',
    ],
];

const PosterRow = ({ images, direction = 1, speed = 30 }) => {
    const doubled = [...images, ...images];
    const duration = Math.max(images.length * (172 / speed), 25);

    return (
        <div className="flex gap-3 overflow-hidden select-none [contain:paint]">
            <motion.div
                className="flex gap-3 flex-shrink-0 transform-gpu"
                animate={{ x: direction === 1 ? ['0%', '-50%'] : ['-50%', '0%'] }}
                transition={{
                    duration,
                    repeat: Infinity,
                    ease: 'linear'
                }}
                style={{ willChange: 'transform' }}
            >
                {doubled.map((src, i) => (
                    <div
                        key={i}
                        className="flex-shrink-0 w-[140px] sm:w-[160px] h-[210px] sm:h-[240px] rounded-xl overflow-hidden shadow-2xl bg-[#141414]"
                        style={{ boxShadow: '0 8px 30px rgba(0,0,0,0.6)' }}
                    >
                        <img src={src} alt="" width="160" height="240" className="w-full h-full object-cover" loading="eager" decoding="async" />
                    </div>
                ))}
            </motion.div>
        </div>
    );
};

const PosterCarousel = () => (
    <div className="absolute inset-0 z-0 overflow-hidden flex flex-col gap-3 py-3" style={{ transform: 'skewY(-3deg) scale(1.15)', transformOrigin: 'center' }}>
        <PosterRow images={POSTER_ROWS[0]} direction={1}  speed={28} />
        <PosterRow images={POSTER_ROWS[1]} direction={-1} speed={22} />
        <PosterRow images={POSTER_ROWS[2]} direction={1}  speed={32} />
    </div>
);

// ── FAQ Accordion ───────────────────────────────────────────────────────────
const FAQItem = ({ q, a, index }) => {
    const [open, setOpen] = useState(false);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: index * 0.07 }}
            className="border-b border-white/5 overflow-hidden"
        >
            <button
                onClick={() => setOpen(!open)}
                className="w-full flex items-center justify-between py-5 text-left text-white/90 hover:text-white transition-colors group"
            >
                <span className="text-lg font-semibold pr-6">{q}</span>
                <motion.span
                    animate={{ rotate: open ? 45 : 0 }}
                    transition={{ duration: 0.25 }}
                    className="flex-shrink-0 w-8 h-8 bg-[#E50914] rounded-full flex items-center justify-center text-white text-2xl font-light leading-none"
                >
                    +
                </motion.span>
            </button>
            <AnimatePresence initial={false}>
                {open && (
                    <motion.div
                        key="content"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                    >
                        <p className="text-white/50 text-base leading-relaxed pb-5 pr-12">{a}</p>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

// ── Main Component ──────────────────────────────────────────────────────────
const LoginPage = () => {
    const { t } = useTranslation();
    const [lang, setLang] = useState(localStorage.getItem('language') || 'fr');

    const faqItems = [
        { q: t('landing.faq1Q'), a: t('landing.faq1A') },
        { q: t('landing.faq2Q'), a: t('landing.faq2A') },
        { q: t('landing.faq3Q'), a: t('landing.faq3A') },
        { q: t('landing.faq4Q'), a: t('landing.faq4A') },
        { q: t('landing.faq5Q'), a: t('landing.faq5A') },
    ];

    const features = [
        {
            icon: (
                <svg viewBox="0 0 24 24" className="w-12 h-12" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0H3" />
                </svg>
            ),
            title: t('landing.feature1Title'),
            desc: t('landing.feature1Desc'),
        },
        {
            icon: (
                <svg viewBox="0 0 24 24" className="w-12 h-12" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
            ),
            title: t('landing.feature2Title'),
            desc: t('landing.feature2Desc'),
        },
        {
            icon: (
                <svg viewBox="0 0 24 24" className="w-12 h-12" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
            ),
            title: t('landing.feature3Title'),
            desc: t('landing.feature3Desc'),
        },
    ];

    const [step, setStep] = useState(1);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLogin, setIsLogin] = useState(true);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLanguageChange = (e) => {
        const newLang = e.target.value;
        setLang(newLang);
        localStorage.setItem('language', newLang);
        window.location.reload();
    };

    const { currentUser, loading: authLoading, login, register, loginWithGoogle, resendVerificationEmail } = useAuth();
    const navigate = useNavigate();
    const [resendSuccess, setResendSuccess] = useState('');
    const [resendCooldown, setResendCooldown] = useState(0);
    const [googleLoading, setGoogleLoading] = useState(false);

    // Human-friendly French error translation
    const translateAuthError = (err) => {
        if (!err) return 'Une erreur est survenue. Veuillez réessayer.';
        const msg = typeof err === 'string' ? err : (err.code || err.message || '');
        if (msg.includes('popup-closed-by-user') || msg.includes('cancelled-popup-request')) {
            return '';
        }
        if (msg.includes('popup-blocked')) {
            return 'La fenêtre de connexion Google a été bloquée. Veuillez autoriser les fenêtres pop-up.';
        }
        if (msg.includes('unauthorized-domain')) {
            return 'Ce domaine n’est pas autorisé dans Firebase. Ajoutez votre domaine dans Firebase Console > Authentification > Domaines autorisés.';
        }
        if (msg.includes('Adresse e-mail') || msg.includes('mot de passe incorrect')) {
            return 'Adresse e-mail ou mot de passe incorrect.';
        }
        if (msg.includes('user-not-found') || msg.includes('wrong-password') || msg.includes('invalid-credential') || msg.includes('invalid-login-credentials')) {
            return 'Adresse e-mail ou mot de passe incorrect.';
        }
        if (msg.includes('email-already-in-use')) {
            return 'Cette adresse e-mail est déjà associée à un compte ALTYFLIX.';
        }
        if (msg.includes('invalid-email')) {
            return 'Le format de l’adresse e-mail n’est pas valide.';
        }
        if (msg.includes('weak-password') || msg.includes('6 caractères')) {
            return 'Le mot de passe doit comporter au moins 6 caractères.';
        }
        if (msg.includes('too-many-requests')) {
            return 'Trop de tentatives infructueuses. Veuillez patienter 1 minute.';
        }
        if (msg.includes('network-request-failed')) {
            return 'Erreur de connexion. Vérifiez votre connexion internet.';
        }
        if (typeof err === 'string' && err.length > 5 && !err.includes('auth/')) {
            return err;
        }
        return 'Une erreur est survenue lors de l’authentification. Veuillez réessayer.';
    };

    const handleGoogleAuth = async () => {
        setError('');
        setGoogleLoading(true);
        try {
            storage.remove('lastProfileId');
            const result = await loginWithGoogle();
            if (result.success) {
                navigate('/profiles');
            } else if (!result.cancelled) {
                setError(translateAuthError(result.error));
            }
        } catch (err) {
            setError(translateAuthError(err));
        } finally {
            setGoogleLoading(false);
        }
    };

    useEffect(() => {
        if (currentUser && !authLoading && step !== 3) navigate('/profiles');
    }, [currentUser, authLoading, navigate, step]);

    useEffect(() => {
        if (resendCooldown > 0) {
            const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [resendCooldown]);


    const handleEmailSubmit = (e) => {
        e.preventDefault();
        setError('');
        if (!email.trim() || !email.includes('@')) {
            setError('Veuillez entrer une adresse e-mail valide.');
            return;
        }
        setStep(2);
    };

    const handleAuthSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (!email || !password) { setError('Veuillez remplir tous les champs.'); return; }
        if (!isLogin && password.length < 6) { setError('Le mot de passe doit contenir au moins 6 caractères.'); return; }
        setLoading(true);
        try {
            storage.remove('lastProfileId');
            if (isLogin) {
                const result = await login(email, password);
                if (result.success) navigate('/profiles');
                else setError(translateAuthError(result.error));
            } else {
                const result = await register(email, password);
                if (result.success) {
                    setStep(3); // Show verification screen
                } else {
                    setError(translateAuthError(result.error));
                }
            }
        } catch (err) {
            setError(translateAuthError(err));
        } finally {
            setLoading(false);
        }
    };

    const handleResendVerification = async () => {
        if (resendCooldown > 0) return;
        setResendSuccess('');
        const res = await resendVerificationEmail();
        if (res.success) {
            setResendSuccess('Un nouvel e-mail de confirmation vient de vous être envoyé !');
            setResendCooldown(30);
        } else {
            setError(translateAuthError(res.error));
        }
    };

    return (
        <div className="min-h-screen bg-black text-white font-sans selection:bg-red-600 selection:text-white relative overflow-x-hidden">
            <Helmet>
                <title>{step === 1 ? `ALTYFLIX — ${t('landing.badge')}` : `${t('login.title')} — ALTYFLIX`}</title>
                <meta name="description" content={t('landing.title')} />
            </Helmet>

            {/* ── Sticky header ── */}
            <header className="absolute top-0 left-0 right-0 p-4 sm:p-6 lg:px-12 z-50 flex items-center justify-between">
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                    className="cursor-pointer flex items-center w-full sm:w-auto justify-center sm:justify-start"
                    onClick={() => setStep(1)}
                >
                    <ALTYFLIXLogo size={40} showText className="text-red-600" />
                </motion.div>

                {step === 1 && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.1 }}
                        className="flex items-center gap-3 sm:gap-6 absolute right-4 sm:static"
                    >
                        <div className="relative group hidden sm:block">
                            <select
                                value={lang}
                                onChange={handleLanguageChange}
                                className="appearance-none bg-white/10 border border-white/20 text-white text-sm rounded-xl py-2 pl-9 pr-8 outline-none focus:ring-2 focus:ring-[#E50914]/50 transition-all hover:bg-white/15 cursor-pointer backdrop-blur-xl font-medium shadow-sm"
                            >
                                <option value="fr" className="bg-[#141414] text-white">Français</option>
                                <option value="en" className="bg-[#141414] text-white">English</option>
                                <option value="es" className="bg-[#141414] text-white">Español</option>
                                <option value="de" className="bg-[#141414] text-white">Deutsch</option>
                                <option value="it" className="bg-[#141414] text-white">Italiano</option>
                            </select>
                            <div className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-white/90"><LanguageIcon /></div>
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-white/90">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                            </div>
                        </div>

                        <button
                            onClick={() => { setIsLogin(true); setStep(2); }}
                            className="bg-gradient-to-r from-[#E50914] to-[#B81D24] hover:from-[#f40612] hover:to-[#c11119] text-white text-[15px] font-bold px-5 py-2 rounded-xl transition-all shadow-[0_4px_20px_rgba(229,9,20,0.4)] hover:shadow-[0_6px_25px_rgba(229,9,20,0.6)] hover:scale-[1.02] active:scale-[0.98]"
                        >
                            {t('login.title')}
                        </button>
                    </motion.div>
                )}
            </header>

            <AnimatePresence mode="wait">
                {step === 1 ? (
                    <motion.div
                        key="landing"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, transition: { duration: 0.3 } }}
                        className="relative"
                    >
                        {/* ── HERO ── */}
                        <section className="relative min-h-[100dvh] flex items-center justify-center pt-20 overflow-hidden">
                            {/* Poster carousel background */}
                            <PosterCarousel />

                            {/* Gradient overlays */}
                            <div className="absolute inset-0 z-10">
                                <div className="absolute inset-0 bg-black/70" />
                                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-black/70" />
                                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.6)_100%)]" />
                                {/* Red glow from center */}
                                <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_50%_55%,rgba(229,9,20,0.12),transparent)]" />
                            </div>

                            {/* Content */}
                            <div className="relative z-20 w-full max-w-[58rem] px-6 text-center mt-[-8vh]">
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.6, delay: 0.1 }}
                                    className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-red-500/30 bg-red-500/10 text-red-400 text-sm font-semibold mb-6 backdrop-blur-sm"
                                >
                                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                                    {t('landing.badge')}
                                </motion.div>

                                <motion.h1
                                    initial={{ opacity: 0, y: 30 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                                    className="text-[2rem] sm:text-[3rem] md:text-[3.5rem] lg:text-[4.2rem] font-bold tracking-tight mb-4 leading-[1.15] text-white max-w-4xl mx-auto"
                                >
                                    {t('landing.title')}
                                </motion.h1>

                                <motion.p
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
                                    className="text-lg sm:text-2xl font-medium mb-6 text-white leading-normal"
                                >
                                    {t('landing.subtitle')}
                                </motion.p>

                                <motion.p
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.8, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
                                    className="text-base sm:text-[1.2rem] mb-5 font-normal text-white/80 leading-normal px-2"
                                >
                                    {t('landing.ctaDesc')}
                                </motion.p>

                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.8, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
                                    className="max-w-[44rem] mx-auto mt-6"
                                >
                                    {error && (
                                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[#E50914] font-medium mb-2 text-left pl-1">
                                            {error}
                                        </motion.div>
                                    )}
                                    <form onSubmit={handleEmailSubmit} className="flex flex-col sm:flex-row gap-2.5 justify-center items-center">
                                        <div className="relative w-full sm:flex-1 h-[3.5rem] sm:h-[4rem]">
                                            <input
                                                id="landing-email"
                                                type="email"
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                className="w-full h-full bg-white/[0.07] border border-white/20 rounded-2xl px-5 pt-5 pb-1 text-white text-base focus:outline-none focus:border-[#E50914] focus:ring-2 focus:ring-[#E50914]/30 focus:bg-white/[0.1] transition-all peer backdrop-blur-xl"
                                                placeholder=" "
                                            />
                                            <label htmlFor="landing-email" className={`absolute left-5 transition-all duration-200 pointer-events-none text-gray-300 font-medium ${email ? 'top-1.5 text-[0.7rem] sm:text-xs' : 'top-[1rem] sm:top-[1.2rem] text-[1rem] sm:text-[1.1rem]'}`}>
                                                {t('landing.emailPlaceholder')}
                                            </label>
                                        </div>
                                        <button
                                            type="submit"
                                            className="w-auto bg-gradient-to-r from-[#E50914] to-[#B81D24] hover:from-[#f40612] hover:to-[#c11119] text-white font-black text-lg sm:text-[1.35rem] px-8 sm:px-10 h-[3.5rem] sm:h-[4rem] rounded-2xl transition-all flex items-center justify-center gap-2 whitespace-nowrap min-w-[200px] shadow-[0_4px_30px_rgba(229,9,20,0.5)] hover:shadow-[0_8px_45px_rgba(229,9,20,0.7)] hover:scale-[1.02] active:scale-[0.98]"
                                        >
                                            {t('landing.startBtn')}
                                            <ChevronRight />
                                        </button>
                                    </form>

                                    <div className="mt-6 flex items-center justify-center">
                                        <button
                                            type="button"
                                            onClick={handleGoogleAuth}
                                            disabled={googleLoading}
                                            className="inline-flex items-center gap-3 px-6 py-3 bg-white/10 hover:bg-white/15 border border-white/20 hover:border-white/30 rounded-2xl text-white text-sm font-bold transition-all backdrop-blur-xl hover:scale-[1.02] active:scale-[0.98] cursor-pointer shadow-[0_8px_25px_rgba(0,0,0,0.4)]"
                                        >
                                            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
                                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                                            </svg>
                                            <span>{googleLoading ? 'Connexion...' : 'Continuer avec Google'}</span>
                                        </button>
                                    </div>
                                </motion.div>
                            </div>

                            {/* Bottom fade */}
                            <div className="absolute bottom-0 left-0 right-0 h-32 z-20 bg-gradient-to-t from-black to-transparent pointer-events-none" />
                        </section>

                        {/* ── DIVIDER ── */}
                        <div className="relative z-10 bg-black">
                            <div className="h-px bg-white/10" />
                        </div>

                        {/* ── FEATURE CARDS ── */}
                        <section className="relative bg-black py-20 px-6">
                            <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
                                {features.map((f, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, y: 30 }}
                                        whileInView={{ opacity: 1, y: 0 }}
                                        viewport={{ once: true }}
                                        transition={{ duration: 0.6, delay: i * 0.1 }}
                                        className="relative rounded-2xl overflow-hidden p-6 border border-white/5 group"
                                        style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)' }}
                                    >
                                        {/* Red corner accent */}
                                        <div className="absolute top-0 right-0 w-24 h-24 rounded-bl-full opacity-10 group-hover:opacity-20 transition-opacity"
                                            style={{ background: 'radial-gradient(circle, #e50914, transparent)' }} />
                                        <div className="text-white/30 mb-5 group-hover:text-red-500/60 transition-colors duration-300">
                                            {f.icon}
                                        </div>
                                        <h3 className="text-white font-bold text-xl mb-3 leading-tight">{f.title}</h3>
                                        <p className="text-white/40 text-sm leading-relaxed">{f.desc}</p>
                                    </motion.div>
                                ))}
                            </div>
                        </section>

                        {/* ── DIVIDER ── */}
                        <div className="h-px bg-white/10 mx-0" />

                        {/* ── FAQ ── */}
                        <section className="bg-black py-20 px-6">
                            <div className="max-w-3xl mx-auto">
                                <motion.h2
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    className="text-4xl md:text-5xl font-bold text-white text-center mb-12"
                                    style={{ fontFamily: 'Outfit, sans-serif' }}
                                >
                                    {t('landing.faqTitle')}
                                </motion.h2>

                                <div className="space-y-0">
                                    {faqItems.map((item, i) => (
                                        <FAQItem key={i} q={item.q} a={item.a} index={i} />
                                    ))}
                                </div>

                                {/* Repeat CTA */}
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: 0.3 }}
                                    className="mt-14 text-center"
                                >
                                    <p className="text-white/60 text-lg mb-6">{t('landing.faqCta')}</p>
                                    <form onSubmit={handleEmailSubmit} className="flex flex-col sm:flex-row gap-2.5 justify-center items-center max-w-xl mx-auto">
                                        <div className="relative w-full sm:flex-1 h-[3.5rem] sm:h-[4rem]">
                                            <input
                                                id="faq-email"
                                                type="email"
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                className="w-full h-full bg-white/[0.07] border border-white/20 rounded-2xl px-5 pt-5 pb-1 text-white text-base focus:outline-none focus:border-[#E50914] focus:ring-2 focus:ring-[#E50914]/30 focus:bg-white/[0.1] transition-all peer backdrop-blur-xl"
                                                placeholder=" "
                                            />
                                            <label htmlFor="faq-email" className={`absolute left-5 transition-all duration-200 pointer-events-none text-gray-400 font-medium ${email ? 'top-1.5 text-xs' : 'top-[1rem] sm:top-[1.2rem] text-base'}`}>
                                                {t('landing.emailPlaceholder')}
                                            </label>
                                        </div>
                                        <button type="submit" className="w-auto bg-gradient-to-r from-[#E50914] to-[#B81D24] hover:from-[#f40612] hover:to-[#c11119] text-white font-black text-lg px-8 h-[3.5rem] sm:h-[4rem] rounded-2xl transition-all flex items-center justify-center gap-2 whitespace-nowrap min-w-[200px] shadow-[0_4px_25px_rgba(229,9,20,0.45)] hover:scale-[1.02] active:scale-[0.98]">
                                            {t('landing.startBtn')} <ChevronRight />
                                        </button>
                                    </form>
                                </motion.div>
                            </div>
                        </section>

                        {/* ── FOOTER ── */}
                        <footer className="border-t border-white/5 bg-black py-10 px-6">
                            <div className="max-w-5xl mx-auto">
                                <p className="text-white/40 text-sm">Des questions ? <a href="mailto:contact@ALTYFLIX.app" className="underline underline-offset-4 hover:text-white transition-colors">Contactez-nous.</a></p>
                                <p className="mt-4 max-w-2xl text-xs leading-relaxed text-white/30">Les fiches, images et bandes-annonces proviennent de TMDB. Ce produit utilise l’API TMDB mais n’est ni approuvé ni certifié par TMDB.</p>
                                <div className="mt-4 text-white/30 text-xs">© {new Date().getFullYear()} ALTYFLIX</div>
                            </div>
                        </footer>
                    </motion.div>
                ) : step === 2 ? (
                    /* ── AUTH FORM ── */
                    <motion.div
                        key="auth"
                        initial={{ opacity: 0, filter: 'blur(10px)' }}
                        animate={{ opacity: 1, filter: 'blur(0px)' }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.4 }}
                        className="relative min-h-screen flex flex-col pt-0 sm:pt-24 pb-10"
                    >
                        <div className="fixed inset-0 z-0 bg-black">
                            {/* Poster carousel in background, very dark */}
                            <div className="absolute inset-0 opacity-20 overflow-hidden flex flex-col gap-3 py-3" style={{ transform: 'skewY(-3deg) scale(1.15)', transformOrigin: 'center' }}>
                                <PosterRow images={POSTER_ROWS[0]} direction={1} speed={20} />
                                <PosterRow images={POSTER_ROWS[1]} direction={-1} speed={16} />
                                <PosterRow images={POSTER_ROWS[2]} direction={1} speed={24} />
                            </div>
                            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-black/50" />
                            <div className="absolute top-0 inset-x-0 h-[80vh] bg-[radial-gradient(ellipse_at_top,rgba(229,9,20,0.15),transparent_70%)] pointer-events-none" />
                        </div>

                        <div className="relative z-10 w-full max-w-[450px] p-7 sm:p-12 mx-auto bg-[#101015]/85 backdrop-blur-3xl sm:border border-white/15 rounded-3xl flex-grow sm:flex-grow-0 mt-6 sm:mt-12 shadow-[0_25px_70px_rgba(0,0,0,0.9)]">
                            <h2 className="text-[2rem] font-black text-white mb-7 leading-tight tracking-tight">
                                {isLogin ? t('login.title') : t('login.register')}
                            </h2>

                            {error && (
                                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-red-500/20 text-white p-3.5 rounded-xl text-[13px] mb-4 border border-red-500/50">
                                    {error}
                                </motion.div>
                            )}

                            <form onSubmit={handleAuthSubmit} className="space-y-4">
                                <div className="relative">
                                    <input
                                        id="auth-email"
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="w-full bg-white/[0.06] border border-white/15 rounded-xl px-4 pt-5 pb-2 text-white text-base focus:outline-none focus:border-[#E50914] focus:ring-2 focus:ring-[#E50914]/30 focus:bg-white/[0.09] transition-all peer backdrop-blur-md"
                                        placeholder=" "
                                    />
                                    <label htmlFor="auth-email" className={`absolute left-4 transition-all duration-200 pointer-events-none text-gray-400 ${email ? 'top-1.5 text-[0.7rem]' : 'top-3.5 text-base'}`}>
                                        {t('login.email')}
                                    </label>
                                </div>

                                <div className="relative">
                                    <input
                                        id="auth-password"
                                        type="password"
                                        autoComplete={isLogin ? 'current-password' : 'new-password'}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full bg-white/[0.06] border border-white/15 rounded-xl px-4 pt-5 pb-2 text-white text-base focus:outline-none focus:border-[#E50914] focus:ring-2 focus:ring-[#E50914]/30 focus:bg-white/[0.09] transition-all peer backdrop-blur-md"
                                        placeholder=" "
                                    />
                                    <label htmlFor="auth-password" className={`absolute left-4 transition-all duration-200 pointer-events-none text-gray-400 ${password ? 'top-1.5 text-[0.7rem]' : 'top-3.5 text-base'}`}>
                                        {t('login.password')}
                                    </label>
                                </div>

                                <motion.button
                                    whileTap={{ scale: 0.98 }}
                                    type="submit"
                                    disabled={loading}
                                    id="auth-submit"
                                    className="w-full relative group overflow-hidden bg-gradient-to-r from-[#E50914] to-[#B81D24] hover:from-[#f40612] hover:to-[#c11119] text-white font-black text-base sm:text-lg py-4 rounded-xl mt-6 transition-all disabled:opacity-50 shadow-[0_4px_25px_rgba(229,9,20,0.45)] hover:shadow-[0_8px_35px_rgba(229,9,20,0.65)] hover:scale-[1.01] active:scale-[0.98]"
                                >
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-[150%] skew-x-[-20deg] group-hover:animate-shine" />
                                    <span className="relative z-10">
                                        {loading ? t('login.loading') : (isLogin ? t('login.title') : t('login.register'))}
                                    </span>
                                </motion.button>


                                <div className="flex justify-end items-center text-gray-400 text-[13px] mt-2 mb-4">
                                    <button
                                        type="button"
                                        onClick={() => setError('Pour toute assistance, contactez le support à contact@ALTYFLIX.app')}
                                        className="hover:underline hover:text-white transition-colors bg-transparent border-none p-0 text-inherit text-[13px] cursor-pointer"
                                    >
                                        {t('login.help')}
                                    </button>
                                </div>

                                <div className="relative flex py-2 items-center">
                                    <div className="flex-grow border-t border-white/10" />
                                    <span className="flex-shrink mx-4 text-white/40 text-xs font-semibold uppercase tracking-wider">ou</span>
                                    <div className="flex-grow border-t border-white/10" />
                                </div>

                                <motion.button
                                    whileTap={{ scale: 0.98 }}
                                    type="button"
                                    onClick={handleGoogleAuth}
                                    disabled={loading || googleLoading}
                                    className="w-full flex items-center justify-center gap-3 bg-white/10 hover:bg-white/15 border border-white/20 hover:border-white/30 text-white font-bold text-[15px] py-3.5 px-4 rounded-xl transition-all disabled:opacity-50 backdrop-blur-xl shadow-lg cursor-pointer hover:scale-[1.01] active:scale-[0.99]"
                                >
                                    <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                                    </svg>
                                    <span>{googleLoading ? 'Connexion à Google...' : 'Continuer avec Google'}</span>
                                </motion.button>
                            </form>

                            <p className="mt-10 text-gray-400 text-[15px]">
                                {isLogin ? t('login.noAccount') : t('login.hasAccount')}{' '}
                                <button type="button" onClick={() => { setIsLogin(!isLogin); setError(''); }} className="font-semibold text-white underline-offset-4 hover:underline">
                                    {isLogin ? t('login.register') : t('login.title')}
                                </button>
                            </p>
                        </div>
                    </motion.div>
                ) : (
                    /* ── EMAIL VERIFICATION SCREEN (STEP 3) ── */
                    <motion.div
                        key="verify-email"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        className="relative min-h-screen flex items-center justify-center p-4 py-20 z-20"
                    >
                        <div className="w-full max-w-lg bg-[#111118]/90 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 sm:p-10 shadow-2xl text-center">
                            <div className="w-16 h-16 bg-red-600/20 text-[#E50914] rounded-full flex items-center justify-center mx-auto mb-6 border border-red-500/30">
                                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                            </div>

                            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">Vérifie ton adresse email</h2>
                            <p className="text-white/70 text-sm sm:text-base mb-6 leading-relaxed">
                                Un email de confirmation officiel a été envoyé à :<br />
                                <span className="font-semibold text-white tracking-wide">{email}</span>
                            </p>

                            {resendSuccess && (
                                <div className="p-3 mb-6 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs sm:text-sm rounded-xl">
                                    {resendSuccess}
                                </div>
                            )}

                            {error && (
                                <div className="p-3 mb-6 bg-red-500/20 border border-red-500/40 text-red-300 text-xs sm:text-sm rounded-xl">
                                    {error}
                                </div>
                            )}

                            <div className="space-y-3">
                                <button
                                    onClick={() => navigate('/profiles')}
                                    className="w-full py-3.5 px-6 rounded-xl bg-[#E50914] hover:bg-[#c11119] text-white font-bold text-base shadow-[0_0_25px_rgba(229,9,20,0.4)] transition-all hover:scale-[1.02]"
                                >
                                    J&apos;ai vérifié mon email — Continuer
                                </button>

                                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                                    <button
                                        type="button"
                                        disabled={resendCooldown > 0}
                                        onClick={handleResendVerification}
                                        className="flex-1 py-3 px-4 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-medium border border-white/20 transition-all disabled:opacity-50"
                                    >
                                        {resendCooldown > 0 ? `Patientez ${resendCooldown}s` : "Renvoyer l'email"}
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => { setStep(2); setIsLogin(true); }}
                                        className="flex-1 py-3 px-4 rounded-xl bg-transparent hover:bg-white/5 text-white/70 hover:text-white text-sm font-medium border border-white/10 transition-all"
                                    >
                                        Modifier l&apos;adresse
                                    </button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default LoginPage;
