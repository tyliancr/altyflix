import { useState, useEffect } from 'react';
import { useSpring, useMotionValue, useMotionTemplate, motion } from 'framer-motion';

const OptimizedSpotlight = () => {
    const [isHoverDevice, setIsHoverDevice] = useState(false);
    const mouseX = useMotionValue(0);
    const mouseY = useMotionValue(0);

    const smoothX = useSpring(mouseX, { stiffness: 100, damping: 30 });
    const smoothY = useSpring(mouseY, { stiffness: 100, damping: 30 });

    useEffect(() => {
        setIsHoverDevice(window.matchMedia('(hover: hover)').matches);
        const handleMouseMove = (e) => {
            mouseX.set(e.clientX);
            mouseY.set(e.clientY);
        };
        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, [mouseX, mouseY]);

    const background = useMotionTemplate`radial-gradient(550px circle at ${smoothX}px ${smoothY}px, rgba(229,9,20,0.035), rgba(255,255,255,0.02) 45%, transparent 70%)`;

    if (!isHoverDevice) return null;

    return (
        <motion.div
            className="pointer-events-none fixed inset-0 z-[1] transform-gpu"
            style={{ background }}
        />
    );
}

export default OptimizedSpotlight;
