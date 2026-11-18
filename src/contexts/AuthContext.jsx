/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
    onAuthStateChanged, GoogleAuthProvider, signInWithPopup, sendEmailVerification } from 'firebase/auth';
import { auth, isFirebaseConfigured } from '../config/firebase';
import { createUser, updateUserLastLogin, getUser, updateUserEmail } from '../services/database';

const AuthContext = createContext();
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within AuthProvider');
    return context;
};
const requireAuth = () => {
    if (!isFirebaseConfigured) throw new Error('auth/configuration-not-found');
};
export const formatAuthErrorMessage = (error) => {
    if (!error) return 'Une erreur est survenue. Veuillez réessayer.';
    const msg = typeof error === 'string' ? error : (error.code || error.message || '');
    if (msg.includes('Adresse e-mail') || msg.includes('mot de passe incorrect')) {
        return 'Adresse e-mail ou mot de passe incorrect.';
    }
    if (msg.includes('user-not-found') || msg.includes('wrong-password') || msg.includes('invalid-credential') || msg.includes('invalid-login-credentials')) {
        return 'Adresse e-mail ou mot de passe incorrect.';
    }
    if (msg.includes('email-already-in-use')) {
        return 'Cette adresse e-mail est déjà associée à un compte ALTYFLIX.';
    }
    if (msg.includes('invalid-email')) {
        return 'Le format de l’adresse e-mail n’est pas valide.';
    }
    if (msg.includes('weak-password') || msg.includes('6 caractères')) {
        return 'Le mot de passe doit comporter au moins 6 caractères.';
    }
    if (msg.includes('too-many-requests')) {
        return 'Trop de tentatives infructueuses. Veuillez patienter un instant.';
    }
    if (msg.includes('configuration-not-found')) return 'La connexion est indisponible : Firebase doit être configuré.';
    if (msg.includes('network-request-failed')) {
        return 'Erreur de connexion. Vérifiez votre connexion internet.';
    }
    if (msg.includes('requires-recent-login')) {
        return 'Veuillez vous reconnecter pour effectuer cette action.';
    }
    if (msg.includes('popup-closed-by-user') || msg.includes('cancelled-popup-request')) {
        return 'Connexion Google annulée.';
    }
    if (msg.includes('popup-blocked')) {
        return 'La fenêtre de connexion Google a été bloquée par le navigateur. Veuillez autoriser les fenêtres pop-up.';
    }
    if (msg.includes('unauthorized-domain')) {
        return 'Ce domaine n’est pas autorisé dans Firebase Auth. Ajoutez-le dans Firebase Console > Authentification > Domaines autorisés.';
    }
    if (typeof error === 'string' && error.length > 5 && !error.includes('auth/')) {
        return error;
    }
    return 'Une erreur est survenue lors de l’authentification. Veuillez réessayer.';
};


export const AuthProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(isFirebaseConfigured);
    const [error, setError] = useState(null);

    const register = useCallback(async (email, password) => {
        try {
            setError(null);
            requireAuth();
            const result = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
            await createUser(result.user.uid, { email: result.user.email });
            try { await sendEmailVerification(result.user); }
            catch (err) { console.warn('Verification email failed:', err.code); }
            return { success: true, user: result.user };
        } catch (err) {
            const message = formatAuthErrorMessage(err);
            setError(message);
            return { success: false, error: message };
        }
    }, []);
    const login = useCallback(async (email, password) => {
        try {
            setError(null);
            requireAuth();
            const result = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
            await updateUserLastLogin(result.user.uid);
            return { success: true, user: result.user };
        } catch (err) {
            const message = formatAuthErrorMessage(err);
            setError(message);
            return { success: false, error: message };
        }
    }, []);
    const loginWithGoogle = useCallback(async () => {
        try {
            setError(null);
            requireAuth();
            const provider = new GoogleAuthProvider();
            provider.setCustomParameters({ prompt: 'select_account' });
            const { user } = await signInWithPopup(auth, provider);
            await createUser(user.uid, { email: user.email, displayName: user.displayName || '', photoURL: user.photoURL || '' });
            return { success: true, user };
        } catch (err) {
            if (['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(err.code)) return { success: false, cancelled: true };
            const message = formatAuthErrorMessage(err);
            setError(message);
            return { success: false, error: message };
        }
    }, []);
    const resendVerificationEmail = useCallback(async () => {
        try {
            requireAuth();
            if (!auth.currentUser) throw new Error('auth/requires-recent-login');
            await sendEmailVerification(auth.currentUser);
            return { success: true };
        } catch (err) { return { success: false, error: formatAuthErrorMessage(err) }; }
    }, []);
    const logout = useCallback(async () => {
        try {
            if (isFirebaseConfigured) await signOut(auth);
            setCurrentUser(null);
            setError(null);
            return { success: true };
        } catch (err) {
            const message = formatAuthErrorMessage(err);
            setError(message);
            return { success: false, error: message };
        }
    }, []);
    useEffect(() => {
        try {
            localStorage.removeItem('altyflix_local_user');
            localStorage.removeItem('altyflix_registered_accounts');
        } catch { /* Storage may be unavailable. */ }
        if (!isFirebaseConfigured) { setLoading(false); return; }
        return onAuthStateChanged(auth, user => {
            setCurrentUser(user);
            setLoading(false);
            if (user) {
                getUser(user.uid).then(userDoc => {
                    if (userDoc && userDoc.email !== user.email) return updateUserEmail(user.uid, user.email);
                }).catch(err => console.warn('Email sync failed:', err.code));
            }
        }, () => { setCurrentUser(null); setLoading(false); });
    }, []);
    return <AuthContext.Provider value={{ currentUser, loading, error, register, login, loginWithGoogle, resendVerificationEmail, logout }}>{children}</AuthContext.Provider>;
};
export default AuthContext;

