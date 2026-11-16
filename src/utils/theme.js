// Utility functions to determine the current seasonal theme

export const THEMES = {
    STANDARD: 'theme-standard',
    HALLOWEEN: 'theme-halloween',
    CHRISTMAS: 'theme-xmas',
    VALENTINE: 'theme-valentine',
};

export const getCurrentTheme = () => {
    const today = new Date();
    const month = today.getMonth(); // 0-indexed: 9 = October, 11 = December, 1 = February
    const day = today.getDate();

    // Halloween: Oct 1 - Oct 31 (October is month index 9)
    if (month === 9) {
        return THEMES.HALLOWEEN;
    }

    // Christmas: Dec 1 - Dec 31 (December is month index 11)
    if (month === 11) {
        return THEMES.CHRISTMAS;
    }

    // Valentine: Feb 14 only (February is month index 1)
    if (month === 1 && day === 14) {
        return THEMES.VALENTINE;
    }

    return THEMES.STANDARD;
};

export const getThemeConfig = (themeName) => {
    switch (themeName) {
        case THEMES.HALLOWEEN:
            return {
                id: 'halloween',
                name: 'Halloween Premium',
                primaryColor: '#D97706', // Premium deep amber orange
                secondaryColor: '#7C3AED', // Premium royal purple
                particles: 'none',
                greeting: 'Sélection d\'Halloween',
            };
        case THEMES.CHRISTMAS:
            return {
                id: 'xmas',
                name: 'Noël Premium',
                primaryColor: '#DC2626', // Premium rich ruby red
                secondaryColor: '#059669', // Premium emerald pine green
                particles: 'none',
                greeting: 'Magie des Fêtes',
            };
        case THEMES.VALENTINE:
            return {
                id: 'valentine',
                name: 'Saint-Valentin Premium',
                primaryColor: '#BE185D', // Premium deep rose ruby
                secondaryColor: '#DB2777', // Deep satin pink
                particles: 'none',
                greeting: 'Édition Saint-Valentin',
            };
        default:
            return {
                id: 'standard',
                name: 'Standard',
                primaryColor: '#E50914', // Netflix Red
                secondaryColor: '#B81D24', // Dark Red
                particles: 'none',
                greeting: 'Bonjour',
            };
    }
};
