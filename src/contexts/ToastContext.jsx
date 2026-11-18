/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import Toast from '../components/common/Toast';

const ToastContext = createContext();

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};

/**
 * Notifications discrètes : seules les erreurs s'affichent (une à la fois).
 * Les confirmations (« ajouté à Ma liste »…) se voient déjà sur le bouton lui-même,
 * elles ne déclenchent plus de pop-up.
 */
export const ToastProvider = ({ children }) => {
    const [toast, setToast] = useState(null);
    const timerRef = useRef(null);

    const removeToast = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        setToast(null);
    }, []);

    const addToast = useCallback((message, type = 'info') => {
        if (type !== 'error') return;
        if (timerRef.current) clearTimeout(timerRef.current);
        const id = Date.now().toString();
        setToast({ id, message, type });
        timerRef.current = setTimeout(() => setToast(null), 3500);
    }, []);

    return (
        <ToastContext.Provider value={{ addToast, removeToast }}>
            {children}
            <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[100001] flex justify-center px-4 md:bottom-8">
                <AnimatePresence>
                    {toast && (
                        <Toast
                            key={toast.id}
                            id={toast.id}
                            message={toast.message}
                            type={toast.type}
                            onClose={removeToast}
                        />
                    )}
                </AnimatePresence>
            </div>
        </ToastContext.Provider>
    );
};

export default ToastContext;
