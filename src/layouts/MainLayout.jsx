import Navbar from './Navbar';
import MobileBottomNav from './MobileBottomNav';
import { useLocation, Outlet, Link } from 'react-router-dom';

const FOOTER_LINKS = [
    { label: 'Films', to: '/films' },
    { label: 'Séries', to: '/series' },
    { label: 'Documentaires', to: '/documentaires' },
    { label: 'Prochainement', to: '/upcoming' },
    { label: 'Ma liste', to: '/my-list' },
    { label: 'Paramètres', to: '/settings' },
];

const MainLayout = () => {
    const location = useLocation();
    const hideNav = location.pathname.startsWith('/watch');

    return (
        <div className="min-h-screen bg-[var(--ALTYFLIX-black)] text-white pb-16 md:pb-0 selection:bg-ALTYFLIX-primary selection:text-white w-full max-w-full overflow-x-hidden relative">
            {!hideNav && <Navbar />}
            <main className="relative z-0 w-full max-w-full overflow-x-hidden">
                <Outlet />
            </main>
            {!hideNav && (
                <footer className="relative z-0 mt-10 border-t border-white/[0.06] px-[4%] md:px-[5%] py-10 text-sm text-white/45">
                    <nav aria-label="Pied de page" className="flex flex-wrap gap-x-7 gap-y-3">
                        {FOOTER_LINKS.map(link => (
                            <Link key={link.to} to={link.to} className="transition-colors hover:text-white">
                                {link.label}
                            </Link>
                        ))}
                    </nav>
                    <p className="mt-6 max-w-2xl text-xs leading-relaxed text-white/30">
                        Les fiches, images et bandes-annonces proviennent de TMDB. Ce produit utilise l’API TMDB mais n’est ni approuvé ni certifié par TMDB.
                    </p>
                    <p className="mt-2 text-xs text-white/30">© {new Date().getFullYear()} ALTYFLIX</p>
                </footer>
            )}
            <MobileBottomNav />
        </div>
    );
};

export default MainLayout;
