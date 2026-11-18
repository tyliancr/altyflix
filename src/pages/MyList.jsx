import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useProfile } from '../contexts/ProfileContext';
import { Helmet } from 'react-helmet-async';
import { motion, AnimatePresence } from 'framer-motion';
import PosterCard from '../components/ui/PosterCard';
import { PageHeader, PosterGrid, SegmentedControl, EmptyState } from '../components/ui/Primitives';

const isSeries = (item) => item.type === 'tv' || item.media_type === 'tv' || Boolean(item.first_air_date || item.number_of_seasons);

const MyList = () => {
    const { myList, removeFromMyList } = useProfile();
    const [filter, setFilter] = useState('all'); // 'all' | 'movie' | 'tv'

    const counts = useMemo(() => {
        const tv = myList.filter(isSeries).length;
        return { all: myList.length, tv, movie: myList.length - tv };
    }, [myList]);

    const filtered = myList.filter(item => filter === 'all' || (filter === 'tv') === isSeries(item));

    return (
        <div className="min-h-screen bg-[#060608] px-[4%] pb-12 pt-[calc(env(safe-area-inset-top,0px)+6rem)] md:px-[5%] md:pt-32">
            <Helmet>
                <title>Ma liste - ALTYFLIX</title>
                <meta name="robots" content="noindex" />
            </Helmet>

            <PageHeader
                title="Ma liste"
                subtitle={myList.length > 0 ? `${myList.length} titre${myList.length > 1 ? 's' : ''} à regarder` : undefined}
            >
                {myList.length > 0 && (
                    <SegmentedControl
                        label="Filtrer ma liste"
                        value={filter}
                        onChange={setFilter}
                        options={[
                            { id: 'all', label: 'Tout', count: counts.all },
                            { id: 'movie', label: 'Films', count: counts.movie },
                            { id: 'tv', label: 'Séries', count: counts.tv },
                        ]}
                    />
                )}
            </PageHeader>

            {myList.length === 0 ? (
                <EmptyState
                    title="Votre liste est vide"
                    icon={<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 3h14a1 1 0 011 1v17l-8-3.5L4 21V4a1 1 0 011-1z" /></svg>}
                    action={
                        <Link to="/" className="inline-flex h-11 items-center rounded-xl bg-white px-5 text-sm font-semibold text-black transition-colors hover:bg-white/85">
                            Parcourir le catalogue
                        </Link>
                    }
                >
                    Ajoutez des films et des séries avec le bouton <strong className="text-white/75">+</strong> pour les retrouver ici.
                </EmptyState>
            ) : filtered.length === 0 ? (
                <EmptyState title={filter === 'tv' ? 'Aucune série dans votre liste' : 'Aucun film dans votre liste'} />
            ) : (
                <PosterGrid>
                    <AnimatePresence mode="popLayout">
                        {filtered.map(item => (
                            <motion.div
                                key={`${isSeries(item) ? 'tv' : 'movie'}-${item.id || item.contentId}`}
                                layout
                                initial={{ opacity: 0, scale: 0.94 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                            >
                                <PosterCard item={item} type={isSeries(item) ? 'tv' : 'movie'} showType onRemove={removeFromMyList} />
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </PosterGrid>
            )}
        </div>
    );
};

export default MyList;
