/**
 * Helper to enforce the default ALTYFLIX premium theme layout
 */
export const applyThemeLayout = () => {
    if (typeof document === 'undefined') return;

    ['disney', 'apple'].forEach(l => {
        document.body.classList.remove(`theme-layout-${l}`);
    });
    document.body.classList.add('theme-layout-netflix');
};

export default applyThemeLayout;

