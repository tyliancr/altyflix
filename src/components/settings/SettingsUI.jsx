import { motion } from 'framer-motion';
import Icon from '../ui/Icons';

const SPRING = { type: 'spring', stiffness: 500, damping: 32 };

/* ─── Text field with a floating label ─────────────────────────── */
export const Field = ({ label, type = 'text', value, onChange, required, autoComplete, maxLength, inputMode, hint }) => (
    <label className="block">
        <span className="relative block">
            <input
                type={type}
                value={value}
                onChange={onChange}
                placeholder=" "
                required={required}
                autoComplete={autoComplete}
                maxLength={maxLength}
                inputMode={inputMode}
                className="peer h-14 w-full rounded-xl border border-white/12 bg-white/[0.05] px-4 pt-5 text-[15px] text-white outline-none transition-colors duration-200 placeholder-transparent hover:border-white/25 focus:border-white/70 focus:bg-white/[0.08]"
            />
            <span className="pointer-events-none absolute left-4 top-2 text-[11px] font-medium text-white/45 transition-all duration-200 peer-placeholder-shown:top-[17px] peer-placeholder-shown:text-[15px] peer-placeholder-shown:text-white/40 peer-focus:top-2 peer-focus:text-[11px] peer-focus:text-white/60">
                {label}
            </span>
        </span>
        {hint && <span className="mt-1.5 block text-xs text-white/40">{hint}</span>}
    </label>
);

/* ─── Section card ─────────────────────────────────────────────── */
export const Card = ({ children, className = '' }) => (
    <section className={`overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.03] ${className}`}>
        {children}
    </section>
);

/* ─── Card heading ─────────────────────────────────────────────── */
export const SectionHeader = ({ icon, title, subtitle, action }) => (
    <header className="flex items-center gap-4 border-b border-white/[0.07] px-6 py-5">
        {icon && (
            <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-white/[0.07] text-white/80">
                {icon}
            </span>
        )}
        <div className="min-w-0 flex-1">
            <h2 className="font-display text-lg font-bold tracking-tight text-white">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[13px] leading-snug text-white/50">{subtitle}</p>}
        </div>
        {action && <div className="flex-none">{action}</div>}
    </header>
);

/* ─── Setting row: label on the left, control on the right ─────── */
export const Row = ({ icon, title, description, children, as: Tag = 'div', ...props }) => (
    <Tag {...props} className="flex w-full items-center justify-between gap-5 px-6 py-4 text-left transition-colors hover:bg-white/[0.025]">
        <span className="flex min-w-0 items-center gap-4">
            {icon && <span className="flex-none text-white/50">{icon}</span>}
            <span className="min-w-0">
                <span className="block text-[15px] font-semibold text-white">{title}</span>
                {description && <span className="mt-0.5 block text-[13px] leading-snug text-white/50">{description}</span>}
            </span>
        </span>
        <span className="flex-none">{children}</span>
    </Tag>
);

/* ─── Switch ───────────────────────────────────────────────────── */
export const Toggle = ({ checked, onChange, label }) => (
    <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 flex-none rounded-full transition-colors duration-300 ${checked ? 'bg-[#E50914]' : 'bg-white/15'}`}
    >
        <motion.span
            initial={false}
            animate={{ x: checked ? 22 : 4 }}
            transition={SPRING}
            className="absolute left-0 top-1 block h-5 w-5 rounded-full bg-white shadow"
        />
    </button>
);

/* ─── Form footer with the save button ─────────────────────────── */
export const SubmitBtn = ({ loading, label, loadingLabel = 'Enregistrement…', ...props }) => (
    <div className="flex justify-end">
        <motion.button
            type="submit"
            disabled={loading}
            whileTap={{ scale: 0.97 }}
            className="flex h-11 min-w-[150px] items-center justify-center gap-2 rounded-xl bg-white px-6 text-sm font-bold text-black transition-colors hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-50"
            {...props}
        >
            {loading && (
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
            )}
            {loading ? loadingLabel : label}
        </motion.button>
    </div>
);

/* ─── Toast: floats at the bottom so the page never jumps ──────── */
export const Toast = ({ message }) => {
    if (!message.text) return null;
    const isSuccess = message.type === 'success';
    return (
        <motion.div
            role="status"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className="fixed inset-x-4 bottom-24 z-[500] mx-auto flex w-fit max-w-[min(92vw,460px)] items-center gap-3 rounded-2xl border border-white/10 bg-[#16161d]/95 px-4 py-3 text-sm text-white shadow-[0_20px_60px_rgba(0,0,0,0.7)] backdrop-blur-xl md:bottom-8"
        >
            <span className={`grid h-7 w-7 flex-none place-items-center rounded-full ${isSuccess ? 'bg-[#46d369]/15 text-[#46d369]' : message.type === 'info' ? 'bg-white/10 text-white' : 'bg-[#E50914]/15 text-[#ff5a63]'}`}>
                <Icon name={isSuccess ? 'check' : message.type === 'info' ? 'info' : 'alert'} className="h-4 w-4" strokeWidth={2.2} />
            </span>
            <span className="leading-snug">{message.text}</span>
        </motion.div>
    );
};

/* ─── Confirmation dialog ──────────────────────────────────────── */
export const ConfirmModal = ({ title, message, onConfirm, onCancel, confirmLabel }) => (
    <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        role="alertdialog"
        aria-modal="true"
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
        onClick={onCancel}
    >
        <motion.div
            initial={{ scale: 0.9, y: 16, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.94, y: 8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#0e0e14] p-7 text-center shadow-[0_30px_80px_rgba(0,0,0,0.8)]"
            onClick={e => e.stopPropagation()}
        >
            <span className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-full bg-[#E50914]/12 text-[#ff5a63]">
                <Icon name="alert" className="h-6 w-6" />
            </span>
            {title && <h2 className="font-display text-xl font-bold tracking-tight text-white">{title}</h2>}
            <p className={`leading-relaxed ${title ? 'mt-2 text-sm text-white/55' : 'text-[15px] font-semibold text-white'}`}>{message}</p>
            <div className="mt-7 flex gap-3">
                <button
                    type="button"
                    onClick={onCancel}
                    className="h-11 flex-1 rounded-xl border border-white/15 bg-white/[0.06] text-sm font-semibold text-white/80 transition-colors hover:bg-white/15 hover:text-white"
                >
                    Annuler
                </button>
                <button
                    type="button"
                    onClick={onConfirm}
                    className="h-11 flex-1 rounded-xl bg-[#E50914] text-sm font-bold text-white transition-colors hover:bg-[#f6121d]"
                >
                    {confirmLabel || 'Confirmer'}
                </button>
            </div>
        </motion.div>
    </motion.div>
);
