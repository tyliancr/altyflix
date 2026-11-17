/**
 * One icon set for the whole app: 24px grid, round caps, 1.8 stroke.
 * <Icon name="lock" className="h-5 w-5" /> — colour follows `currentColor`.
 */
const PATHS = {
    play: { fill: true, d: 'M8 5.5v13a.5.5 0 00.76.43l10.5-6.5a.5.5 0 000-.86L8.76 5.07A.5.5 0 008 5.5z' },
    plus: { d: 'M12 5v14M5 12h14' },
    check: { d: 'M5 12.5l4.5 4.5L19 7.5' },
    close: { d: 'M6 6l12 12M18 6L6 18' },
    edit: { d: 'M4 20h4L19.5 8.5a2.12 2.12 0 00-3-3L5 17v3zM14.5 7.5l3 3' },
    trash: { d: 'M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2' },
    lock: { d: 'M7 11V8a5 5 0 0110 0v3M6 11h12a1 1 0 011 1v7a1 1 0 01-1 1H6a1 1 0 01-1-1v-7a1 1 0 011-1zM12 15v2' },
    users: { d: 'M16 19v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1M9.5 10a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM21 19v-1a4 4 0 00-3-3.87M15.5 3.13a3.5 3.5 0 010 6.74' },
    settings: { d: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.34 1.87l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.7 1.7 0 00-2.88 1.2V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-2.9-1.2l-.06.07a2 2 0 11-2.83-2.83l.06-.06A1.7 1.7 0 003.1 14H3a2 2 0 010-4h.1a1.7 1.7 0 001.2-2.9l-.07-.06A2 2 0 117.06 4.2l.06.06A1.7 1.7 0 0010 3.1V3a2 2 0 014 0v.1a1.7 1.7 0 002.9 1.2l.06-.07a2 2 0 112.83 2.83l-.06.06A1.7 1.7 0 0020.9 10H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z' },
    logout: { d: 'M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 16l4-4-4-4M14 12H4' },
    chevronLeft: { d: 'M15 5l-7 7 7 7' },
    chevronRight: { d: 'M9 5l7 7-7 7' },
    user: { d: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4.5 20a7.5 7.5 0 0115 0' },
    sliders: { d: 'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4' },
    shield: { d: 'M12 3l7 3v5.5c0 4.3-2.9 8.1-7 9.5-4.1-1.4-7-5.2-7-9.5V6l7-3zM9 12l2 2 4-4' },
    chart: { d: 'M4 20V10M10 20V4M16 20v-7M22 20H2' },
    pulse: { d: 'M3 12h4l2.5-7 4 14 2.5-7h5' },
    mail: { d: 'M4 6h16a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V7a1 1 0 011-1zM3.5 7.5l8.5 6 8.5-6' },
    clock: { d: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7.5V12l3 2' },
    refresh: { d: 'M20 11a8 8 0 00-14.3-4.3L4 8.5M4 4v4.5h4.5M4 13a8 8 0 0014.3 4.3l1.7-1.8M20 20v-4.5h-4.5' },
    film: { d: 'M4 4h16a1 1 0 011 1v14a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1zM7.5 4v16M16.5 4v16M3 9h4.5M3 15h4.5M16.5 9H21M16.5 15H21' },
    globe: { d: 'M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.500 5.6 12 3z' },
    alert: { d: 'M12 9v4M12 17h.01M10.3 3.9L2.6 17.3A2 2 0 004.3 20h15.400a2 2 0 001.7-2.700L13.700 3.900a2 2 0 00-3.4 0z' },
    info: { d: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v5M12 7.800h.01' },
    volume: { d: 'M11 5L6.500 9H3v6h3.500L11 19V5zM15.500 8.500a5 5 0 010 7M18.500 6a8.500 8.500 0 010 12' },
    subtitles: { d: 'M4 5h16a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1zM7 11h4M14 11h3M7 15h2M12 15h5' },
    kid: { d: 'M12 21a9 9 0 100-18 9 9 0 000 18zM8.5 14.5a4.5 4.5 0 007 0M9 10h.01M15 10h.01' },
};

const Icon = ({ name, className = 'h-5 w-5', strokeWidth = 1.8, ...props }) => {
    const icon = PATHS[name];
    if (!icon) return null;
    return (
        <svg
            viewBox="0 0 24 24"
            className={className}
            fill={icon.fill ? 'currentColor' : 'none'}
            stroke={icon.fill ? 'none' : 'currentColor'}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            {...props}
        >
            <path d={icon.d} />
        </svg>
    );
};

export default Icon;
