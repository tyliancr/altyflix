import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { useTranslation } from '../hooks/useTranslation';
import { Button } from '../components/ui/Primitives';

const EASE = [0.16, 1, 0.3, 1];

const NotFound = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();

    return (
        <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#060608] px-6 text-center">
            <Helmet>
                <title>{t('notFound.title')} — ALTYFLIX</title>
                <meta name="robots" content="noindex" />
            </Helmet>

            <div
                aria-hidden="true"
                className="pointer-events-none absolute left-1/2 top-1/2 h-[80vmin] w-[80vmin] -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{ background: 'radial-gradient(closest-side, rgba(229,9,20,0.16), transparent)' }}
            />

            <motion.p
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, ease: EASE }}
                aria-hidden="true"
                className="rank-numeral relative select-none !mr-0 !tracking-[-0.04em]"
                style={{ fontSize: 'clamp(7rem, 24vw, 17rem)', lineHeight: 0.9 }}
            >
                404
            </motion.p>

            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.15, ease: EASE }}
                className="relative"
            >
                <h1 className="mt-6 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">{t('notFound.title')}</h1>
                <p className="mx-auto mt-3 max-w-md text-base leading-relaxed text-white/50">{t('notFound.desc')}</p>
                <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
                    <Button size="lg" onClick={() => navigate('/')}>{t('notFound.back')}</Button>
                    <Button size="lg" variant="glass" onClick={() => navigate(-1)}>Page précédente</Button>
                </div>
            </motion.div>
        </div>
    );
};

export default NotFound;
