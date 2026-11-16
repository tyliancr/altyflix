import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';

const PinModal = ({ isOpen, onClose, onSubmit, profileName }) => {
    const [pin, setPin] = useState(['', '', '', '']);
    const [error, setError] = useState(false);
    const inputRefs = useRef([]);

    useEffect(() => {
        if (isOpen) {
            setPin(['', '', '', '']);
            setError(false);
            // Focus first input
            setTimeout(() => inputRefs.current[0]?.focus(), 100);
        }
    }, [isOpen]);

    const handleChange = (index, value) => {
        if (!/^\d*$/.test(value)) return;

        const newPin = [...pin];
        newPin[index] = value;
        setPin(newPin);
        setError(false);

        // Auto-advance
        if (value && index < 3) {
            inputRefs.current[index + 1]?.focus();
        }

        // Check completion
        if (index === 3 && value) {
            handleSubmit(newPin.join(''));
        }
    };

    const handleKeyDown = (index, e) => {
        if (e.key === 'Backspace' && !pin[index] && index > 0) {
            inputRefs.current[index - 1]?.focus();
        }
    };

    const handleSubmit = async (enteredPin) => {
        // Parent component compares with actual profile PIN
        // We pass the entered PIN back
        // Expecting onSubmit to return true if valid, false if invalid
        const isValid = await onSubmit(enteredPin);
        if (!isValid) {
            setError(true);
            setPin(['', '', '', '']); // Clear
            inputRefs.current[0]?.focus();
        } else {
            // Close handled by parent or useEffect
        }
    };

    // Shake animation variants
    const modalVariants = {
        hidden: { opacity: 0, scale: 0.9 },
        visible: { opacity: 1, scale: 1 },
        shake: { x: [-10, 10, -10, 10, 0], transition: { duration: 0.4 } }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm">
                    <motion.div
                        className="bg-ALTYFLIX-gray-900 border border-ALTYFLIX-gray-700 p-8 rounded-2xl w-full max-w-md text-center shadow-2xl"
                        variants={modalVariants}
                        initial="hidden"
                        animate={error ? "shake" : "visible"}
                        exit="hidden"
                    >
                        <h2 className="text-2xl font-bold text-white mb-2">Code PIN requis</h2>
                        <p className="text-ALTYFLIX-gray-400 mb-8">
                            Entrez le code PIN pour accéder au profil de <span className="text-white font-semibold">{profileName}</span>.
                        </p>

                        <div className="flex justify-center gap-4 mb-8">
                            {pin.map((digit, index) => (
                                <input
                                    key={index}
                                    ref={el => inputRefs.current[index] = el}
                                    type="password"
                                    maxLength={1}
                                    value={digit}
                                    onChange={(e) => handleChange(index, e.target.value)}
                                    onKeyDown={(e) => handleKeyDown(index, e)}
                                    className={`w-14 h-14 text-center text-3xl font-bold bg-ALTYFLIX-gray-800 border-2 rounded-lg focus:outline-none transition-all ${error
                                        ? 'border-red-500 text-red-500'
                                        : 'border-ALTYFLIX-gray-600 focus:border-ALTYFLIX-primary text-white'
                                        }`}
                                />
                            ))}
                        </div>

                        {error && (
                            <p className="text-red-500 text-sm font-medium mb-4 animate-pulse">Code incorrect. Réessayez.</p>
                        )}

                        <button
                            onClick={onClose}
                            className="text-ALTYFLIX-gray-500 hover:text-white transition-colors text-sm font-medium uppercase tracking-wider"
                        >
                            Annuler
                        </button>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default PinModal;

