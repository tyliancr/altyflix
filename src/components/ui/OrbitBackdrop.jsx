/**
 * Ambient SVG backdrop: slow concentric orbits with a light travelling on each,
 * over a soft accent glow. Purely decorative. The travelling lights use SMIL,
 * which ignores the global reduced-motion rule, so they are hidden outright
 * when the user asks for reduced motion.
 */
const ORBITS = [
    { rx: 300, ry: 118, rotate: -18, duration: 26, delay: 0, opacity: 0.11 },
    { rx: 430, ry: 176, rotate: 12, duration: 38, delay: -9, opacity: 0.08 },
    { rx: 580, ry: 250, rotate: -6, duration: 54, delay: -21, opacity: 0.06 },
];

const OrbitBackdrop = ({ className = '' }) => (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
        <svg className="absolute left-1/2 top-1/2 h-[140vmax] w-[140vmax] -translate-x-1/2 -translate-y-1/2" viewBox="-700 -700 1400 1400">
            <defs>
                <radialGradient id="orbit-glow">
                    <stop offset="0%" stopColor="#E50914" stopOpacity="0.2" />
                    <stop offset="45%" stopColor="#E50914" stopOpacity="0.05" />
                    <stop offset="100%" stopColor="#E50914" stopOpacity="0" />
                </radialGradient>
                <radialGradient id="orbit-light">
                    <stop offset="0%" stopColor="#fff" stopOpacity="0.95" />
                    <stop offset="100%" stopColor="#fff" stopOpacity="0" />
                </radialGradient>
            </defs>

            <circle r="520" fill="url(#orbit-glow)" className="orbit-breathe" />

            {ORBITS.map((orbit, i) => {
                const path = `M ${-orbit.rx} 0 a ${orbit.rx} ${orbit.ry} 0 1 0 ${orbit.rx * 2} 0 a ${orbit.rx} ${orbit.ry} 0 1 0 ${-orbit.rx * 2} 0`;
                return (
                    <g key={i} transform={`rotate(${orbit.rotate})`}>
                        <path d={path} fill="none" stroke="#fff" strokeOpacity={orbit.opacity} strokeWidth="1" />
                        <circle r="26" fill="url(#orbit-light)" opacity="0.5" className="motion-reduce:hidden">
                            <animateMotion dur={`${orbit.duration}s`} begin={`${orbit.delay}s`} repeatCount="indefinite" path={path} />
                        </circle>
                        <circle r="2.2" fill="#fff" className="motion-reduce:hidden">
                            <animateMotion dur={`${orbit.duration}s`} begin={`${orbit.delay}s`} repeatCount="indefinite" path={path} />
                        </circle>
                    </g>
                );
            })}
        </svg>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,#060608_78%)]" />
    </div>
);

export default OrbitBackdrop;
