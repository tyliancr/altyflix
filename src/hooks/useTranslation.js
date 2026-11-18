import { useProfile } from '../contexts/ProfileContext';
import { translations } from '../utils/translations';
import { storage } from '../utils/helpers';

export const useTranslation = () => {
    const { currentProfile } = useProfile();

    // Default to French if no profile or language is found; normalize JSON-stored locales like "en-US" -> "en"
    const rawLang = currentProfile?.language || storage.get('language', 'fr') || 'fr';
    const language = String(rawLang).replace(/^"+|"+$/g, '').slice(0, 2).toLowerCase() || 'fr';
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

