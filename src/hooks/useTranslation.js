import { useProfile } from '../contexts/ProfileContext';
import { translations } from '../utils/translations';

export const useTranslation = () => {
    const { currentProfile } = useProfile();

    // Default to French if no profile or language is found, fallback to localStorage
    const language = currentProfile?.language || localStorage.getItem('language') || 'fr';
    const dict = translations[language] || translations['fr'];

    const t = (keyString) => {
        const keys = keyString.split('.');
        let value = dict;
        for (const key of keys) {
            value = value?.[key];
            if (value === undefined) {
                // Return key string as fallback
                return keyString;
            }
        }
        return value;
    };

    return { t, language };
};

