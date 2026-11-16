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
