import { motion } from 'framer-motion';

/* ─── Reusable Input ───────────────────────────────────────────── */
export const Field = ({ label, type = 'text', value, onChange, required, autoComplete, maxLength }) => (
    <div className="relative group">
        <input
            type={type}
            value={value}
            onChange={onChange}
            placeholder=" "
            required={required}
            autoComplete={autoComplete}
            maxLength={maxLength}
            className="
                peer w-full px-4 pt-6 pb-2
                bg-white/[0.04] border border-white/10
                rounded-2xl text-sm text-white outline-none
                focus:border-white/40 focus:bg-white/[0.07]
                transition-all duration-200
                placeholder-transparent
            "
        />
        <label className="
            absolute left-4 top-2 text-[10px] font-bold uppercase tracking-widest text-white/40
            peer-placeholder-shown:top-4 peer-placeholder-shown:text-sm peer-placeholder-shown:tracking-normal peer-placeholder-shown:font-normal peer-placeholder-shown:normal-case peer-placeholder-shown:text-white/30
            transition-all duration-200 pointer-events-none
        ">
            {label}
        </label>
    </div>
);

/* ─── Section Card ─────────────────────────────────────────────── */
export const Card = ({ children, className = '' }) => (
    <div className={`relative bg-[#14141E]/40 border border-white/[0.06] rounded-3xl overflow-hidden backdrop-blur-md ${className}`}>
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
        <div className="relative z-10">{children}</div>
    </div>
);

/* ─── Section Header inside a Card ────────────────────────────── */
export const SectionHeader = ({ icon, title, subtitle, action }) => (
    <div className="flex items-center gap-4 px-6 py-5 border-b border-white/[0.06]">
        <div className="w-10 h-10 rounded-2xl bg-[#E50914]/10 border border-[#E50914]/20 flex items-center justify-center shrink-0 text-[#E50914]">
            {icon}
        </div>
        <div className="flex-1 min-w-0">
            <p className="font-bold text-white text-sm tracking-wide">{title}</p>
            {subtitle && <p className="text-white/40 text-[11px] mt-0.5">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
    </div>
);

/* ─── Submit Button ────────────────────────────────────────────── */
export const SubmitBtn = ({ loading, label, loadingLabel = 'Mise à jour en cours...', ...props }) => (
    <motion.button
        type="submit"
        disabled={loading}
        whileTap={{ scale: 0.98 }}
        className="
            relative overflow-hidden
            w-full py-3.5 px-6
            bg-[#E50914] hover:bg-[#c11119]
            text-white text-xs font-bold uppercase tracking-widest
            rounded-2xl transition-all duration-200
            disabled:opacity-50 disabled:cursor-not-allowed
            shadow-[0_0_20px_rgba(229,9,20,0.2)]
            hover:shadow-[0_0_30px_rgba(229,9,20,0.4)]
        "
        {...props}
    >
        {loading ? (
            <span className="relative z-10 flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                {loadingLabel}
            </span>
        ) : (
            <span className="relative z-10">{label}</span>
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full hover:translate-x-full transition-transform duration-700" />
    </motion.button>
);

/* ─── Toast Banner ─────────────────────────────────────────────── */
export const Toast = ({ message }) => {
    if (!message.text) return null;
    const isSuccess = message.type === 'success';
    const isInfo = message.type === 'info';
    return (
        <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className={`
                flex items-start gap-3 mb-8 p-4 rounded-2xl border backdrop-blur-md text-sm
                ${isSuccess
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                    : isInfo
                        ? 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                        : 'bg-red-500/10 border-red-500/20 text-red-400'}
            `}
        >
            <svg className="w-5 h-5 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {isSuccess
                    ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                }
            </svg>
            <span className="leading-relaxed">{message.text}</span>
        </motion.div>
    );
};

/* ─── Confirm Modal ─────────────────────────────────────────────── */
export const ConfirmModal = ({ message, onConfirm, onCancel, confirmLabel, confirmClass = '' }) => (
    <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
        onClick={onCancel}
    >
        <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="bg-[#14141E] border border-white/10 rounded-3xl p-6 max-w-sm w-full shadow-2xl"
            onClick={e => e.stopPropagation()}
        >
            <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 shrink-0">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>
                <p className="text-sm text-white font-semibold leading-snug">{message}</p>
            </div>
            <div className="flex gap-3 mt-5">
                <button
                    onClick={onCancel}
                    className="flex-1 py-2.5 px-4 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-white/60 text-xs font-bold uppercase tracking-wider rounded-xl transition-all"
                >
                    Annuler
                </button>
                <button
                    onClick={onConfirm}
                    className={`flex-1 py-2.5 px-4 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all ${confirmClass || 'bg-red-600 hover:bg-red-700'}`}
                >
                    {confirmLabel || 'Confirmer'}
                </button>
            </div>
        </motion.div>
    </motion.div>
);

