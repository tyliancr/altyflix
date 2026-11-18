import { Helmet } from 'react-helmet-async';
import HeroBanner from '../home/HeroBanner';
import ContentRow from '../home/ContentRow';
import GenreMenu from './GenreMenu';
import PosterCard from './PosterCard';
import { PosterGrid, GridSkeleton, ShelfSkeleton, SectionTitle, EmptyState, Button } from './Primitives';

/**
 * Shared shell for the Films, Séries and Documentaires pages:
 * a title bar floating over the hero, then either shelves (browse mode)
 * or a full grid (when a genre is picked).
 */
const BrowseLayout = ({
    title,
    genres,
    selectedGenre,
    onSelectGenre,
    allLabel,
    loading,
    failed = false,
    onRetry,
    heroItems = [],
    shelves = [],
    grid = null, // { title, items, type, canLoadMore, loadingMore, onLoadMore }
    isTV = false,
}) => (
    <div className="min-h-screen bg-[#060608] pb-12">
        <Helmet>
            <title>{selectedGenre ? `${selectedGenre.name} · ${title}` : title} - ALTYFLIX</title>
        </Helmet>

        <div className="pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top,0px)+5.75rem)] z-30 px-[4%] md:top-[88px] md:px-[5%]">
            <div className="pointer-events-auto flex w-fit flex-wrap items-center gap-x-5 gap-y-3">
                <h1 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl" style={{ textShadow: '0 2px 20px rgba(0,0,0,0.6)' }}>
                    {title}
                </h1>
                <GenreMenu genres={genres} selected={selectedGenre} onSelect={onSelectGenre} allLabel={allLabel} />
            </div>
        </div>

        {loading ? (
            <div aria-busy="true" aria-label="Chargement">
                <HeroBanner movies={[]} />
                <div className="relative z-10 -mt-[3vh] sm:-mt-[10vh]"><ShelfSkeleton /></div>
            </div>
        ) : failed ? (
            <div className="px-[4%] pt-48 md:px-[5%]">
                <EmptyState
                    tone="error"
                    title="Le catalogue est temporairement indisponible"
                    icon={<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.3 3.9L2.6 17.3A2 2 0 004.3 20h15.4a2 2 0 001.7-2.7L13.7 3.9a2 2 0 00-3.4 0z" /></svg>}
                    action={onRetry && <Button onClick={onRetry}>Réessayer</Button>}
                >
                    Vérifiez votre connexion, puis réessayez.
                </EmptyState>
            </div>
        ) : (
            <>
                {heroItems.length > 0 ? <HeroBanner movies={heroItems} /> : <div className="h-44 md:h-52" />}

                <div className={`relative z-20 ${heroItems.length ? '-mt-[3vh] sm:-mt-[10vh]' : ''}`}>
                    {grid ? (
                        <section className="px-[4%] md:px-[5%]">
                            <SectionTitle count={grid.items.length}>{grid.title}</SectionTitle>
                            {grid.items.length > 0 ? (
                                <PosterGrid>
                                    {grid.items.map(item => <PosterCard key={item.id} item={item} type={grid.type} />)}
                                </PosterGrid>
                            ) : (
                                <EmptyState title="Aucun titre dans ce genre">Essayez un autre genre.</EmptyState>
                            )}
                            {grid.loadingMore && <GridSkeleton count={6} className="mt-7" />}
                            {grid.canLoadMore && !grid.loadingMore && (
                                <div className="mt-12 flex justify-center">
                                    <Button variant="glass" onClick={grid.onLoadMore}>Afficher plus</Button>
                                </div>
                            )}
                        </section>
                    ) : (
                        <div className="space-y-6 sm:space-y-8">
                            {shelves.map((shelf, i) => (
                                <ContentRow
                                    key={shelf.title}
                                    title={shelf.title}
                                    items={shelf.content}
                                    ranked={i === 0 && Boolean(shelf.ranked)}
                                    isTV={shelf.isTV ?? isTV}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </>
        )}
    </div>
);

export default BrowseLayout;
