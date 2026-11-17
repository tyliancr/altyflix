/**
 * AltyflixLogo — premium "A" mark styled exactly like Netflix's N ribbon letterform.
 * Props:
 *   size        — height in px of the A mark (default 40)
 *   showText    — show "ALTYFLIX" wordmark next to the mark (default false)
 *   textFirst   — put wordmark before the mark (default false)
 *   className   — extra class on wrapper
 */
const AltyflixLogo = ({ size = 40, showText = false, textFirst = false, className = '' }) => {
    const w = size * 0.67;   // width of the mark, proportional to the new aspect ratio
    const h = size;

    const textSize = size * 0.44;

    // Netflix Red ribbon gradients
    const leftLegGrad = (
        <linearGradient id="leftLegGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#9e1218" />
            <stop offset="100%" stopColor="#5c0a0d" />
        </linearGradient>
    );
    const rightLegGrad = (
        <linearGradient id="rightLegGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8a0f12" />
            <stop offset="100%" stopColor="#0e0102" />
        </linearGradient>
    );
    const diagonalGrad = (
        <linearGradient id="diagonalGrad" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#b8090f" />
            <stop offset="50%" stopColor="#e50914" />
            <stop offset="100%" stopColor="#ff2e35" />
        </linearGradient>
    );
    const dropShadowColor = "#000000";
    const dropShadowOpacity = "0.8";

    const mark = (
        <svg
            width={w}
            height={h}
            viewBox="0 0 66.67 100"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ flexShrink: 0, display: 'block' }}
        >
            <defs>
                {leftLegGrad}
                {rightLegGrad}
                {diagonalGrad}
                {/* Drop shadow for the diagonal slash */}
                <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="-1.5" dy="1.5" stdDeviation="1.5" floodColor={dropShadowColor} floodOpacity={dropShadowOpacity} />
                </filter>
            </defs>

            {/* Left Leg: Clipped at the bottom-right where it meets the diagonal */}
            <path
                d="M 0 0 L 21.67 0 L 21.67 51.85 L 0 100 Z"
                fill="url(#leftLegGrad)"
            />

            {/* Crossbar */}
            <rect
                x="21.67"
                y="40"
                width="23.33"
                height="20"
                fill="url(#leftLegGrad)"
            />

            {/* Right Leg: Clipped at the top-left where it meets the diagonal */}
            <path
                d="M 45 48.15 L 66.67 0 L 66.67 100 L 45 100 Z"
                fill="url(#rightLegGrad)"
            />

            {/* Diagonal Slash (on top with drop shadow) */}
            <path
                d="M 0 100 L 21.67 100 L 66.67 0 L 45 0 Z"
                fill="url(#diagonalGrad)"
                filter="url(#shadow)"
            />
        </svg>
    );

    const wordmark = showText ? (
        <span
            style={{
                fontFamily: 'Outfit, sans-serif',
                fontWeight: 900,
                fontSize: textSize,
                color: '#ffffff',
                letterSpacing: '-0.03em',
                lineHeight: 1,
                userSelect: 'none'
            }}
        >
            ALTYFLIX
        </span>
    ) : null;

    return (
        <span
            className={`inline-flex items-center gap-2 ${className}`}
            style={{ userSelect: 'none' }}
        >
            {textFirst && wordmark}
            {mark}
            {!textFirst && wordmark}
        </span>
    );
};

export default AltyflixLogo;
