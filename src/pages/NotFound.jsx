import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { useTranslation } from '../hooks/useTranslation';
import { useState, useEffect } from 'react';

/* ── Floating particle ── */
const Particle = ({ x, y, size, duration, delay, color }) => (
    <motion.div
        className="absolute rounded-full pointer-events-none"
        style={{ left: `${x}%`, top: `${y}%`, width: size, height: size, background: color, filter: 'blur(1px)' }}
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: [0, 1, 0], scale: [0, 1, 0], y: [0, -120, -200] }}
        transition={{ duration, delay, repeat: Infinity, ease: 'easeOut' }}
    />
);

/* ── Static noise overlay ── */
const NoiseOverlay = () => (
    <svg className="absolute inset-0 w-full h-full opacity-[0.03] pointer-events-none z-20" xmlns="http://www.w3.org/2000/svg">
        <filter id="noise404">
            <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#noise404)" />
    </svg>
);

/* ── Glitch text ── */
const GlitchText = ({ children }) => {
    const [glitching, setGlitching] = useState(false);

    useEffect(() => {
        const trigger = () => {
            setGlitching(true);
            setTimeout(() => setGlitching(false), 300);
        };
        const id = setInterval(trigger, 2800 + Math.random() * 1500);
        return () => clearInterval(id);
    }, []);

    return (
        <div className="relative inline-block select-none" style={{ fontFamily: 'Outfit, sans-serif' }}>
            {/* Main text */}
            <span
                className="relative z-10 text-transparent font-black"
                style={{
                    fontSize: 'clamp(7rem, 22vw, 18rem)',
                    lineHeight: 1,
                    backgroundImage: 'linear-gradient(135deg, #e50914 0%, #ff4d58 40%, #c80813 70%, #8b0000 100%)',
                    WebkitBackgroundClip: 'text',
                    backgroundClip: 'text',
                    textShadow: 'none',
                    filter: glitching ? 'drop-shadow(4px 0 0 #00ffff) drop-shadow(-4px 0 0 #ff00ff)' : 'drop-shadow(0 0 60px rgba(229,9,20,0.5))',
                    transition: 'filter 0.05s',
                }}
            >
                {children}
            </span>

            {/* Glitch layer 1 */}
            {glitching && (
                <span
                    className="absolute inset-0 font-black text-transparent"
                    style={{
                        fontSize: 'clamp(7rem, 22vw, 18rem)',
                        lineHeight: 1,
                        backgroundImage: 'linear-gradient(135deg, #00ffff 0%, #0088ff 100%)',
                        WebkitBackgroundClip: 'text',
                        backgroundClip: 'text',
                        transform: 'translate(-6px, 2px)',
                        opacity: 0.7,
                        clipPath: 'polygon(0 30%, 100% 30%, 100% 50%, 0 50%)',
                    }}
                >
                    {children}
                </span>
            )}

            {/* Glitch layer 2 */}
            {glitching && (
                <span
                    className="absolute inset-0 font-black text-transparent"
                    style={{
                        fontSize: 'clamp(7rem, 22vw, 18rem)',
                        lineHeight: 1,
                        backgroundImage: 'linear-gradient(135deg, #ff00ff 0%, #ff4488 100%)',
                        WebkitBackgroundClip: 'text',
                        backgroundClip: 'text',
                        transform: 'translate(6px, -2px)',
                        opacity: 0.7,
                        clipPath: 'polygon(0 60%, 100% 60%, 100% 80%, 0 80%)',
                    }}
                >
                    {children}
                </span>
            )}
        </div>
    );
};

const particles = Array.from({ length: 28 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: 60 + Math.random() * 40,
    size: 2 + Math.random() * 5,
    duration: 3 + Math.random() * 4,
    delay: Math.random() * 5,
    color: i % 3 === 0
        ? 'rgba(229,9,20,0.9)'
        : i % 3 === 1
        ? 'rgba(255,100,120,0.6)'
        : 'rgba(255,255,255,0.3)',
}));

const NotFound = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();

    return (
        <div className="min-h-screen bg-[#060608] relative overflow-hidden flex flex-col">
            <Helmet>
                <title>{t('notFound.title')} — ALTYFLIX</title>
                <meta name="robots" content="noindex" />
            </Helmet>

            {/* Noise grain */}
            <NoiseOverlay />

            {/* Ambient deep-red radial glow */}
            <div className="absolute inset-0 z-0 pointer-events-none">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] rounded-full"
                    style={{ background: 'radial-gradient(ellipse, rgba(229,9,20,0.18) 0%, transparent 70%)' }} />
            </div>

            {/* Scanlines */}
            <div className="absolute inset-0 z-10 pointer-events-none" style={{
                backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)',
            }} />

            {/* Floating particles */}
            <div className="absolute inset-0 z-10 overflow-hidden pointer-events-none">
                {particles.map(p => <Particle key={p.id} {...p} />)}
            </div>

            {/* Horizontal red light streak */}
            <motion.div
                className="absolute left-0 right-0 h-px z-10 pointer-events-none"
                style={{ background: 'linear-gradient(90deg, transparent, #e50914, transparent)', top: '52%' }}
                animate={{ opacity: [0, 0.8, 0], scaleX: [0.3, 1, 0.3] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', repeatDelay: 2 }}
            />

            {/* Main content */}
            <div className="flex-1 flex flex-col items-center justify-center relative z-20 px-6 text-center">

                {/* 404 Glitch Number */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                >
                    <GlitchText>404</GlitchText>
                </motion.div>

                {/* Divider line */}
                <motion.div
                    initial={{ scaleX: 0, opacity: 0 }}
                    animate={{ scaleX: 1, opacity: 1 }}
                    transition={{ duration: 0.8, delay: 0.3 }}
                    className="w-24 h-[2px] mx-auto mb-8 rounded-full"
                    style={{ background: 'linear-gradient(90deg, transparent, #e50914, transparent)' }}
                />

                {/* Title */}
                <motion.h1
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7, delay: 0.4 }}
                    className="text-3xl md:text-5xl font-black text-white mb-4 tracking-tight"
                    style={{ fontFamily: 'Outfit, sans-serif', textShadow: '0 0 40px rgba(255,255,255,0.15)' }}
                >
                    {t('notFound.title')}
                </motion.h1>

                {/* Description */}
                <motion.p
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7, delay: 0.55 }}
                    className="text-lg text-white/40 max-w-md mx-auto mb-12 leading-relaxed"
                >
                    {t('notFound.desc')}
                </motion.p>

                {/* CTA Button */}
                <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7, delay: 0.7 }}
                    className="flex flex-col sm:flex-row gap-4 items-center"
                >
                    <motion.button
                        whileHover={{ scale: 1.05, boxShadow: '0 0 40px rgba(229,9,20,0.5)' }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => navigate('/')}
                        className="relative overflow-hidden px-10 py-4 rounded-xl text-white font-bold text-base tracking-wide"
                        style={{ background: 'linear-gradient(135deg, #e50914 0%, #c80813 100%)', boxShadow: '0 0 20px rgba(229,9,20,0.3)' }}
                    >
                        {/* Shine sweep */}
                        <span className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full hover:translate-x-full transition-transform duration-700 skew-x-[-20deg]" />
                        <span className="relative z-10 flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                            </svg>
                            {t('notFound.back')}
                        </span>
                    </motion.button>

                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => navigate(-1)}
                        className="px-10 py-4 rounded-xl text-white/60 font-bold text-base tracking-wide border border-white/10 hover:border-white/20 hover:text-white/80 transition-all backdrop-blur-sm"
                        style={{ background: 'rgba(255,255,255,0.04)' }}
                    >
                        ← Retour
                    </motion.button>
                </motion.div>

                {/* Error code badge */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1.2 }}
                    className="mt-16 px-4 py-2 rounded-full border border-white/5 text-white/20 text-xs tracking-widest font-mono"
                    style={{ background: 'rgba(255,255,255,0.02)' }}
                >
                    ERR_CONTENT_NOT_FOUND · HTTP 404
                </motion.div>
            </div>
        </div>
    );
};

export default NotFound;
