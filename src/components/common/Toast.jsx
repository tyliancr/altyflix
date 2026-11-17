import { motion } from 'framer-motion';
import Icon from '../ui/Icons';

const TONES = {
    success: { icon: 'check', chip: 'bg-[#46d369]/15 text-[#46d369]' },
    error: { icon: 'alert', chip: 'bg-[#E50914]/15 text-[#ff5a63]' },
    info: { icon: 'info', chip: 'bg-white/10 text-white' },
};

const Toast = ({ id, message, type = 'info', onClose }) => {
    const tone = TONES[type] || TONES.info;

    return (
        <motion.div
            layout
            role="status"
            initial={{ opacity: 0, y: 20, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.18 } }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className="pointer-events-auto flex min-w-[260px] max-w-[min(92vw,420px)] items-center gap-3 rounded-2xl border border-white/10 bg-[#16161d]/95 py-3 pl-4 pr-2.5 shadow-[0_20px_60px_rgba(0,0,0,0.7)] backdrop-blur-xl"
        >
            <span className={`grid h-7 w-7 flex-none place-items-center rounded-full ${tone.chip}`}>
                <Icon name={tone.icon} className="h-4 w-4" strokeWidth={2.2} />
            </span>
            <span className="flex-1 text-sm font-medium leading-snug text-white">{message}</span>
            <button
                type="button"
                onClick={() => onClose(id)}
                aria-label="Fermer"
                className="grid h-8 w-8 flex-none place-items-center rounded-full text-white/40 transition-colors hover:bg-white/10 hover:text-white"
            >
                <Icon name="close" className="h-4 w-4" strokeWidth={2.2} />
            </button>
        </motion.div>
    );
};

export default Toast;
