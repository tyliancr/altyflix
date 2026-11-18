import { motion, AnimatePresence, useAnimationControls } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';

const EMPTY = ['', '', '', ''];
const SPRING = { type: 'spring', stiffness: 320, damping: 24 };

/** Padlock whose shackle rattles when the code is wrong. */
const Padlock = ({ error }) => (
    <svg viewBox="0 0 48 48" className="h-12 w-12" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <motion.path
            d="M15 22v-6a9 9 0 0118 0v6"
            stroke={error ? '#ff5a63' : '#fff'}
            strokeWidth="3"
            style={{ transformOrigin: '33px 22px' }}
            animate={error ? { rotate: [0, -14, 6, -8, 0] } : { rotate: 0 }}
            transition={{ duration: 0.5 }}
        />
        <rect x="9" y="22" width="30" height="20" rx="5" fill={error ? 'rgba(229,9,20,0.18)' : 'rgba(255,255,255,0.08)'} stroke={error ? '#ff5a63' : '#fff'} strokeWidth="3" />
        <circle cx="24" cy="31" r="2.6" fill={error ? '#ff5a63' : '#fff'} />
        <path d="M24 33v3.5" stroke={error ? '#ff5a63' : '#fff'} strokeWidth="2.6" />
    </svg>
);

const PinModal = ({ isOpen, onClose, onSubmit, profileName }) => {
    const [pin, setPin] = useState(EMPTY);
    const [error, setError] = useState(false);
    const inputRefs = useRef([]);
    const shake = useAnimationControls();
    // Callers pass an inline handler; keep the latest without re-running the open effect.
    const closeRef = useRef(onClose);
    closeRef.current = onClose;

    useEffect(() => {
        if (!isOpen) return undefined;
        setPin(EMPTY);
        setError(false);
        const focus = setTimeout(() => inputRefs.current[0]?.focus(), 120);
        const onKey = (e) => { if (e.key === 'Escape') closeRef.current(); };
        window.addEventListener('keydown', onKey);
        return () => { clearTimeout(focus); window.removeEventListener('keydown', onKey); };
    }, [isOpen]);

    const submit = async (entered) => {
        // The parent compares with the profile's PIN and returns whether it matched.
        const isValid = await onSubmit(entered);
        if (!isValid) {
            setError(true);
            shake.start({ x: [0, -12, 10, -8, 6, 0], transition: { duration: 0.4 } });
            setPin(EMPTY);
            inputRefs.current[0]?.focus();
        }
    };

    const handleChange = (index, raw) => {
        const digits = raw.replace(/\D/g, '');
        if (raw && !digits) return;

        // Pasting or autofill can deliver several digits at once; typing into an already-filled box replaces it.
        const next = [...pin];
        let singleReplace = false;
        if (pin[index] && digits.length === 2) {
            next[index] = digits[0] === pin[index] ? digits[1] : digits[0];
            singleReplace = true;
        } else if (digits.length > 1) {
            const pasted = digits.length > 4 && pin[index] ? digits.replace(pin[index], '') : digits;
            pasted.slice(0, 4 - index).split('').forEach((d, i) => { next[index + i] = d; });
        } else {
            next[index] = digits;
        }
        setPin(next);
        setError(false);

        const filled = next.findIndex(d => !d);
        if (filled === -1) submit(next.join(''));
        else if (singleReplace) inputRefs.current[Math.min(index + 1, 3)]?.focus();
        else if (digits) inputRefs.current[Math.min(filled, 3)]?.focus();
    };

    const handleKeyDown = (index, e) => {
        if (e.key === 'Backspace' && !pin[index] && index > 0) {
            inputRefs.current[index - 1]?.focus();
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Code PIN requis"
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 16 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.94, y: 8 }}
                        transition={SPRING}
                        onClick={e => e.stopPropagation()}
                        className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#0e0e14] p-8 text-center shadow-[0_30px_80px_rgba(0,0,0,0.8)]"
                    >
                        <div className="relative mx-auto mb-6 grid h-20 w-20 place-items-center">
                            <span className="relative"><Padlock error={error} /></span>
                        </div>

                        <h2 className="font-display text-2xl font-bold tracking-tight text-white">Profil verrouillé</h2>
                        <p className="mt-2 text-sm text-white/55">
                            Saisissez le code PIN de <span className="font-semibold text-white">{profileName}</span>.
                        </p>

                        <motion.div
                            animate={shake}
                            className="my-8 flex justify-center gap-3"
                        >
                            {pin.map((digit, index) => (
                                <span key={index} className="relative">
                                    <input
                                        ref={el => { inputRefs.current[index] = el; }}
                                        type="password"
                                        inputMode="numeric"
                                        autoComplete="off"
                                        aria-label={`Chiffre ${index + 1} sur 4`}
                                        maxLength={4}
                                        value={digit}
                                        onChange={(e) => handleChange(index, e.target.value)}
                                        onKeyDown={(e) => handleKeyDown(index, e)}
                                        className={`peer h-16 w-14 rounded-2xl border bg-white/[0.06] text-center text-transparent caret-transparent outline-none transition-colors duration-200 ${error
                                            ? 'border-[#E50914]/70'
                                            : 'border-white/15 focus:border-white focus:bg-white/[0.1]'}`}
                                    />
                                    {/* The digit itself is never shown: a dot pops in instead */}
                                    <span aria-hidden="true" className="pointer-events-none absolute inset-0 grid place-items-center">
                                        <AnimatePresence>
                                            {digit && (
                                                <motion.span
                                                    initial={{ scale: 0 }}
                                                    animate={{ scale: 1 }}
                                                    exit={{ scale: 0 }}
                                                    transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                                                    className="h-3.5 w-3.5 rounded-full bg-white"
                                                />
                                            )}
                                        </AnimatePresence>
                                    </span>
                                </span>
                            ))}
                        </motion.div>

                        <p role="alert" className={`mb-5 h-5 text-sm font-medium text-[#ff5a63] transition-opacity ${error ? 'opacity-100' : 'opacity-0'}`}>
                            Code incorrect. Réessayez.
                        </p>

                        <button
                            type="button"
                            onClick={onClose}
                            className="h-11 rounded-xl border border-white/15 bg-white/[0.06] px-6 text-sm font-semibold text-white/75 transition-colors hover:bg-white/15 hover:text-white"
                        >
                            Annuler
                        </button>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default PinModal;
