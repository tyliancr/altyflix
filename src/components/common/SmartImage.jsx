import { useState, useEffect, useRef, memo } from 'react';

const TMDB_DOWNGRADE = {
    original: 'w1280',
    w1280: 'w780',
    w780: 'w500',
    w500: 'w342',
    w342: 'w185',
};

function buildRetryUrl(url, attempt) {
    if (!url || typeof url !== 'string') return url;
    let nextUrl = url;
    if (attempt >= 1 && nextUrl.includes('image.tmdb.org/t/p/')) {
        nextUrl = nextUrl.replace(/\/t\/p\/(original|w1280|w780|w500|w342)\//, (_, sz) => `/t/p/${TMDB_DOWNGRADE[sz] || sz}/`);
    }
    const sep = nextUrl.includes('?') ? '&' : '?';
    return `${nextUrl}${sep}_r=${attempt}`;
}

/**
 * Resilient image component:
 * - Instant when already in browser cache
 * - Smooth fade-in once decoded (zero jarring pop)
 * - Automatic retry (up to 2 times with TMDB size downgrade + cache-bust) on transient CDN hiccups
 * - Optional fallbackSrc before rendering fallback JSX
 */
const SmartImage = memo(({
    src,
    srcSet,
    sizes,
    fallbackSrc,
    alt = '',
    className = '',
    style,
    loading = 'lazy',
    decoding = 'async',
    fetchPriority,
    fallback = null,
    fade = false,
    onLoad,
    onError,
}) => {
    const imgRef = useRef(null);
    const retryTimerRef = useRef(null);
    const [attempt, setAttempt] = useState(0);
    const [usingFallbackSrc, setUsingFallbackSrc] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [failed, setFailed] = useState(false);

    // Reset state whenever primary src changes
    useEffect(() => {
        clearTimeout(retryTimerRef.current);
        setAttempt(0);
        setUsingFallbackSrc(false);
        setFailed(false);
        const el = imgRef.current;
        setLoaded(Boolean(el && el.complete && el.naturalWidth > 0));
        return () => clearTimeout(retryTimerRef.current);
    }, [src, fallbackSrc]);

    // Check if image is already synchronously cached right after mount/update
    useEffect(() => {
        const el = imgRef.current;
        if (el && el.complete && el.naturalWidth > 0 && !loaded) {
            setLoaded(true);
        }
    }, [attempt, usingFallbackSrc, loaded]);

    const baseSrc = (!src || usingFallbackSrc) ? fallbackSrc : src;
    const activeSrc = !baseSrc ? '' : (attempt === 0 ? baseSrc : buildRetryUrl(baseSrc, attempt));
    // Drop srcSet on retry or when falling back to fallbackSrc so browser loads the fallback directly
    const activeSrcSet = attempt === 0 && !usingFallbackSrc && Boolean(src) ? srcSet : undefined;

    if (!activeSrc || failed) {
        return fallback;
    }

    const handleLoad = (e) => {
        setLoaded(true);
        if (onLoad) onLoad(e);
    };

    const handleError = (e) => {
        clearTimeout(retryTimerRef.current);
        if (attempt < 2) {
            const delay = attempt === 0 ? 500 : 1500;
            retryTimerRef.current = setTimeout(() => {
                setAttempt((prev) => prev + 1);
            }, delay);
            return;
        }
        if (src && !usingFallbackSrc && fallbackSrc && fallbackSrc !== src) {
            setUsingFallbackSrc(true);
            setAttempt(0);
            return;
        }
        setFailed(true);
        if (onError) onError(e);
    };

    const mergedStyle = fade
        ? {
            ...style,
            opacity: style?.opacity !== undefined ? (loaded ? style.opacity : 0) : (loaded ? 1 : 0),
            transition: style?.transition ? `${style.transition}, opacity 260ms ease` : 'opacity 260ms ease',
        }
        : style;

    return (
        <img
            ref={imgRef}
            src={activeSrc}
            srcSet={activeSrcSet}
            sizes={activeSrcSet ? sizes : undefined}
            alt={alt}
            className={className}
            style={mergedStyle}
            loading={loading}
            decoding={decoding}
            // eslint-disable-next-line react/no-unknown-property -- React 18 forwards lowercase fetchpriority
            fetchpriority={fetchPriority}
            onLoad={handleLoad}
            onError={handleError}
        />
    );
});

SmartImage.displayName = 'SmartImage';
export default SmartImage;
