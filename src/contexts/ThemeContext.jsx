/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect } from 'react';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
    useEffect(() => {
        document.body.className = 'theme-standard font-sans antialiased text-ALTYFLIX-gray-100 selection:bg-ALTYFLIX-primary selection:text-white theme-layout-netflix';
        document.documentElement.style.setProperty('--theme-primary', '#E50914');
        document.documentElement.style.setProperty('--theme-secondary', '#B81D24');
        document.documentElement.style.setProperty('--glow-primary', 'rgba(229, 9, 20, 0.35)');
    }, []);

    const themeConfig = {
        id: 'standard',
        name: 'Standard',
        primaryColor: '#E50914',
        secondaryColor: '#B81D24',
        particles: 'none',
        greeting: 'Bonjour',
    };

    return (
        <ThemeContext.Provider value={{ theme: 'theme-standard', themeConfig, overrideTheme: () => {} }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};
