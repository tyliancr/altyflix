import { useEffect } from 'react';

/**
 * Hook to enable basic Spatial Navigation for TV Remotes / Keyboard
 * This is a lightweight implementation. For production TV apps, consider 'spatial-navigation-js'
 */
const useTVNavigation = () => {
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Map arrow keys to navigation
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                // Determine current focus
                const current = document.activeElement;

                // If body is focused, try to focus the first interactive element
                if (current === document.body) {
                    e.preventDefault();
                    const firstFocusable = document.querySelector('button, a, input, [tabindex="0"]');
                    if (firstFocusable) firstFocusable.focus();
                }

                // Note: Native browser behavior handles basic directional navigation 
                // fairly well if elements are standardized buttons/links.
                // This hook mainly ensures we don't lose focus to "nowhere".
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);
};

export default useTVNavigation;
