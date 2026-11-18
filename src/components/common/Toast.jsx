import { motion } from 'framer-motion';

const Toast = ({ id, message, onClose }) => (
    <motion.div
        role="alert"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, transition: { duration: 0.15 } }}
        transition={{ duration: 0.2 }}
        onClick={() => onClose(id)}
        className="pointer-events-auto max-w-[min(92vw,420px)] cursor-pointer rounded-md bg-[#2a2a2a] px-4 py-2.5 text-sm text-white shadow-lg"
    >
        {message}
    </motion.div>
);

export default Toast;
