import Navbar from './Navbar';
import MobileBottomNav from './MobileBottomNav';
import { useLocation, Outlet } from 'react-router-dom';

const MainLayout = () => {
    const location = useLocation();
    const hideNav = location.pathname.startsWith('/watch');

    return (
        <div className="min-h-screen bg-[var(--ALTYFLIX-black)] text-white pb-16 md:pb-0 selection:bg-ALTYFLIX-primary selection:text-white w-full max-w-full overflow-x-hidden relative">
            {!hideNav && <Navbar />}
            <main className="relative z-0 w-full max-w-full overflow-x-hidden">
                <Outlet />
            </main>
            <MobileBottomNav />
        </div>
    );
};

export default MainLayout;
