import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getPersonDetails } from '../services/tmdb';
import { getPosterUrl } from '../utils/helpers';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { useTranslation } from '../hooks/useTranslation';
import PosterCard from '../components/ui/PosterCard';
import { PosterGrid, SegmentedControl, SectionTitle, EmptyState, Button } from '../components/ui/Primitives';

const LOCALE_MAP = { fr: 'fr-FR', en: 'en-US', es: 'es-ES', de: 'de-DE', it: 'it-IT' };
const PAGE_SIZE = 14;
const BIO_PREVIEW = 520;

const releaseTime = (item) => new Date(item.release_date || item.first_air_date || '1900-01-01').getTime();

const PersonPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { t, language } = useTranslation();
    const [person, setPerson] = useState(null);
    const [loading, setLoading] = useState(true);
    const locale = LOCALE_MAP[language] || 'fr-FR';

    const [activeTab, setActiveTab] = useState('all'); // 'all', 'movie', 'tv'
    const [sortBy, setSortBy] = useState('popularity'); // 'popularity', 'date-desc', 'date-asc'
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
    const [bioOpen, setBioOpen] = useState(false);

    useEffect(() => {
        setVisibleCount(PAGE_SIZE);
    }, [activeTab, sortBy]);

    useEffect(() => {
        let active = true;
        setLoading(true);
        setBioOpen(false);
        window.scrollTo(0, 0);
        getPersonDetails(id)
            .then(data => { if (active) setPerson(data); })
            .catch(error => { console.error('Failed to fetch person', error); if (active) setPerson(null); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [id]);

    const credits = useMemo(() => {
        if (!person) return [];
        const all = [
            ...[...(person.movie_credits?.cast || []), ...(person.movie_credits?.crew || [])].map(item => ({ ...item, media_type: 'movie' })),
            ...[...(person.tv_credits?.cast || []), ...(person.tv_credits?.crew || [])].map(item => ({ ...item, media_type: 'tv' })),
        ];
        const seen = new Set();
        const unique = all.filter(item => {
            const key = `${item.media_type}-${item.id}`;
            if (!item.poster_path || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
        const filtered = activeTab === 'all' ? unique : unique.filter(item => item.media_type === activeTab);
        if (sortBy === 'popularity') filtered.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
        else if (sortBy === 'date-desc') filtered.sort((a, b) => releaseTime(b) - releaseTime(a));
        else filtered.sort((a, b) => releaseTime(a) - releaseTime(b));
        return filtered;
    }, [person, activeTab, sortBy]);

    if (loading) {
        return (
            <div className="min-h-screen bg-[#060608] px-[4%] pt-10 md:px-[5%] md:pt-32" aria-busy="true">
                <div className="mx-auto flex max-w-6xl flex-col gap-8 md:flex-row md:gap-12">
                    <div className="skeleton mx-auto aspect-[2/3] w-44 flex-none !rounded-2xl md:mx-0 md:w-64" />
                    <div className="flex-1 space-y-4 pt-2">
                        <div className="skeleton h-12 w-2/3" />
                        <div className="skeleton h-4 w-1/3" />
                        <div className="skeleton h-4 w-full" />
                        <div className="skeleton h-4 w-5/6" />
                        <div className="skeleton h-4 w-4/6" />
                    </div>
                </div>
            </div>
        );
    }

    if (!person) {
        return (
            <div className="grid min-h-screen place-items-center bg-[#060608] px-6">
                <EmptyState title={t('person.notFound')} action={<Button onClick={() => navigate(-1)}>{t('person.back')}</Button>} />
            </div>
        );
    }

    const bio = person.biography || '';
    const longBio = bio.length > BIO_PREVIEW;
    const facts = [
        person.known_for_department,
        person.birthday && `${t('person.born')} ${new Date(person.birthday).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })}`,
        person.place_of_birth,
    ].filter(Boolean);

    return (
        <div className="min-h-screen bg-[#060608] px-[4%] pb-12 pt-10 text-white md:px-[5%] md:pt-32">
            <Helmet>
                <title>{person.name} - ALTYFLIX</title>
                <meta name="description" content={bio.substring(0, 160) || `${t('person.discover')} ${person.name}`} />
            </Helmet>

            <div className="mx-auto max-w-6xl">
                <button
                    type="button"
                    onClick={() => navigate(-1)}
                    className="mb-8 flex items-center gap-2 text-sm font-medium text-white/50 transition-colors hover:text-white"
                >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    {t('person.back')}
                </button>

                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    className="mb-14 flex flex-col gap-8 md:flex-row md:gap-12"
                >
                    <div className="mx-auto w-44 flex-none md:mx-0 md:w-64">
                        <div className="relative aspect-[2/3] overflow-hidden rounded-2xl bg-[#101016] shadow-[0_24px_60px_rgba(0,0,0,0.6)] ring-1 ring-inset ring-white/10">
                            {person.profile_path ? (
                                <img src={getPosterUrl(person.profile_path, 'h632')} alt={person.name} className="h-full w-full object-cover" />
                            ) : (
                                <span className="grid h-full w-full place-items-center font-display text-6xl font-bold text-white/20">{person.name.charAt(0)}</span>
                            )}
                        </div>
                    </div>

                    <div className="min-w-0 flex-1">
                        <h1 className="font-display text-4xl font-bold tracking-tight text-balance sm:text-6xl">{person.name}</h1>

                        {facts.length > 0 && (
                            <p className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-white/55">
                                {facts.map((fact, i) => (
                                    <span key={fact} className="flex items-center gap-2.5">
                                        {i > 0 && <span aria-hidden="true" className="h-[3px] w-[3px] rounded-full bg-white/35" />}
                                        {fact}
                                    </span>
                                ))}
                            </p>
                        )}

                        {bio && (
                            <div className="mt-7 max-w-3xl">
                                <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.24em] text-white/40">{t('person.biography')}</h2>
                                <p className="whitespace-pre-line text-[15px] leading-relaxed text-white/75">
                                    {longBio && !bioOpen ? `${bio.slice(0, BIO_PREVIEW).trimEnd()}…` : bio}
                                </p>
                                {longBio && (
                                    <button type="button" onClick={() => setBioOpen(v => !v)} className="mt-2 text-sm font-semibold text-white underline-offset-4 hover:underline">
                                        {bioOpen ? 'Réduire' : 'Lire la suite'}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </motion.div>

                <section className="border-t border-white/[0.07] pt-10">
                    <SectionTitle
                        count={credits.length}
                        action={
                            <div className="flex flex-wrap items-center justify-end gap-3">
                                <SegmentedControl
                                    size="sm"
                                    label={t('person.filmography')}
                                    value={activeTab}
                                    onChange={setActiveTab}
                                    options={[
                                        { id: 'all', label: t('person.all') },
                                        { id: 'movie', label: t('person.movies') },
                                        { id: 'tv', label: t('person.series') },
                                    ]}
                                />
                                <select
                                    aria-label={t('person.sortBy')}
                                    value={sortBy}
                                    onChange={(e) => setSortBy(e.target.value)}
                                    className="field-select h-9 text-xs"
                                >
                                    <option value="popularity">{t('person.popularity')}</option>
                                    <option value="date-desc">{t('person.releaseDateDesc')}</option>
                                    <option value="date-asc">{t('person.releaseDateAsc')}</option>
                                </select>
                            </div>
                        }
                    >
                        {t('person.filmography')}
                    </SectionTitle>

                    {credits.length > 0 ? (
                        <PosterGrid>
                            {credits.slice(0, visibleCount).map(item => (
                                <PosterCard
                                    key={`${item.media_type}-${item.id}`}
                                    item={item}
                                    type={item.media_type}
                                    caption={[(item.release_date || item.first_air_date || '').slice(0, 4), item.character || item.job].filter(Boolean).join(' · ')}
                                />
                            ))}
                        </PosterGrid>
                    ) : (
                        <EmptyState title="Aucun titre dans cette catégorie" />
                    )}

                    {credits.length > visibleCount && (
                        <div className="mt-12 flex justify-center">
                            <Button variant="glass" onClick={() => setVisibleCount(prev => prev + PAGE_SIZE)}>{t('person.showMore')}</Button>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
};

export default PersonPage;
