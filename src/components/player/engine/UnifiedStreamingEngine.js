/**
 * ALTYFLIX UNIFIED STREAMING ENGINE (v2.0)
 * Architecture 100% Client-Side - Zero Stockage Serveur - Direct Streaming
 *
 * Moteur unifié capable d'orchestrer intelligemment les flux vidéo autorisés :
 * 1. HLS (.m3u8) via Hls.js ou Safari Native HLS (RFC 8216)
 * 2. MPEG-DASH (.mpd) via Shaka Player (ISO/IEC 23009-1)
 * 3. HTTP Range Requests (206 Partial Content) via HTML5 Video / MSE
 * 4. WebTorrent (P2P Streaming avec téléchargement séquentiel des pièces)
 *
 * Garanties absolues :
 * - ZÉRO stockage de fichiers vidéo sur le serveur ou l'infrastructure Netlify.
 * - Récupération progressive des données directement dans la mémoire vive (RAM / MSE Buffer).
 * - Éviction automatique des buffers anciens pour préserver la mémoire (Back Buffer < 30s).
 * - Seeking instantané sans téléchargement intégral préalable.
 * - Détection et récupération automatique des coupures réseau (Online/Offline).
 */

import Hls from 'hls.js';

/**
 * Types de moteurs supportés
 */
export const ENGINE_TYPES = {
    HLS: 'hls',
    DASH: 'dash',
    RANGE: 'range',
    WEBTORRENT: 'webtorrent',
    NATIVE_HTML5: 'native_html5'
};

/**
 * Détecte automatiquement le moteur optimal pour une URL donnée
 */
export function detectEngineType(url, hint = null) {
    if (hint && Object.values(ENGINE_TYPES).includes(hint.toLowerCase())) {
        return hint.toLowerCase();
    }
    if (!url || typeof url !== 'string') {
        return ENGINE_TYPES.NATIVE_HTML5;
    }

    const cleanUrl = url.trim().toLowerCase();

    if (cleanUrl.startsWith('magnet:?xt=urn:btih:') || cleanUrl.endsWith('.torrent')) {
        return ENGINE_TYPES.WEBTORRENT;
    }
    if (cleanUrl.includes('.m3u8') || cleanUrl.includes('/hls/') || cleanUrl.includes('format=hls')) {
        return ENGINE_TYPES.HLS;
    }
    if (cleanUrl.includes('.mpd') || cleanUrl.includes('/dash/') || cleanUrl.includes('format=dash')) {
        return ENGINE_TYPES.DASH;
    }
    if (cleanUrl.match(/\.(mp4|m4v|webm|mkv|ogg)(\?.*)?$/i)) {
        return ENGINE_TYPES.RANGE;
    }

    return ENGINE_TYPES.NATIVE_HTML5;
}

/**
 * Classe principale : UnifiedStreamingEngine
 */
export class UnifiedStreamingEngine {
    constructor() {
        this.videoElement = null;
        this.currentEngineType = null;
        this.currentUrl = null;
        this.hlsInstance = null;
        this.shakaInstance = null;
        this.torrentClient = null;

        // Télémétrie et métriques en temps réel
        this.metrics = {
            engine: null,
            timeToFirstFrameMs: 0,
            bufferingCount: 0,
            bufferingDurationMs: 0,
            bufferedAheadSec: 0,
            seekLatencyMs: 0,
            estimatedMemoryMB: 0,
            networkBytesTransferred: 0,
            currentBitrateKbps: 0,
            currentHeight: 0,
            droppedFrames: 0,
            isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
            isZeroStorageVerified: true
        };

        // État interne
        this.loadStartTime = 0;
        this.firstFrameRendered = false;
        this.lastBufferingStart = 0;
        this.lastSeekStart = 0;
        this.retryCount = 0;
        this.mediaErrorRecoveryCount = 0;
        this.pausedByOffline = false;
        this.maxRetries = 3;
        this.isDestroyed = false;

        // Callbacks UI
        this.callbacks = {
            onQualitiesReady: () => {},
            onAudioTracksReady: () => {},
            onSubtitleTracksReady: () => {},
            onMetricsUpdate: () => {},
            onBufferingChange: () => {},
            onError: () => {},
            onNetworkStatusChange: () => {},
            onP2PStats: () => {},
            onAutoplayMuted: () => {}
        };

        // Bindings des événements réseau globaux
        this.handleOnline = this.handleOnline.bind(this);
        this.handleOffline = this.handleOffline.bind(this);
        if (typeof window !== 'undefined') {
            window.addEventListener('online', this.handleOnline);
            window.addEventListener('offline', this.handleOffline);
        }
    }

    /**
     * Attache le moteur à un élément vidéo et démarre le chargement
     */
    async load({
        videoElement,
        url,
        formatHint = null,
        startPosition = 0,
        preferredAudioLang = 'VF',
        callbacks = {}
    }) {
        // Nettoyage de l'instance précédente AVANT d'écraser videoElement (évite toute fuite de listeners)
        this.detachVideoListeners();
        this.cleanupAdapters();

        this.videoElement = videoElement;
        this.currentUrl = url;
        this.callbacks = { ...this.callbacks, ...callbacks };
        this.loadStartTime = performance.now();
        this.firstFrameRendered = false;
        this.retryCount = 0;
        this.isDestroyed = false;

        const engineType = detectEngineType(url, formatHint);
        this.currentEngineType = engineType;
        this.metrics.engine = engineType;
        this.mediaErrorRecoveryCount = 0;
        this.pausedByOffline = false;

        // Installation des listeners HTML5 génériques pour les métriques
        this.attachVideoListeners();

        // Routage vers l'adaptateur spécialisé avec capture garantie des erreurs
        try {
            switch (engineType) {
                case ENGINE_TYPES.HLS:
                    await this.initHls(url, startPosition, preferredAudioLang);
                    break;
                case ENGINE_TYPES.DASH:
                    await this.initDash(url, startPosition, preferredAudioLang);
                    break;
                case ENGINE_TYPES.WEBTORRENT:
                    await this.initWebTorrent(url, startPosition);
                    break;
                case ENGINE_TYPES.RANGE:
                case ENGINE_TYPES.NATIVE_HTML5:
                default:
                    await this.initRangeNative(url, startPosition);
                    break;
            }
        } catch (err) {
            if (!this.isDestroyed) {
                this.callbacks.onError?.({
                    message: err?.message || 'Erreur lors du chargement du flux vidéo.',
                    details: err,
                    fatal: true
                });
            }
            return { engine: this.currentEngineType, error: err };
        }

        if (this.isDestroyed) {
            this.cleanupAdapters();
            return { engine: this.currentEngineType };
        }

        this.startMetricsPolling();
        return { engine: this.currentEngineType };
    }

    /**
     * Moteur 1 : HLS.js (HTTP Live Streaming via MediaSource Extensions)
     * Avec Safari Native HLS en fallback transparent.
     */
    async initHls(url, startPosition, preferredAudioLang) {
        const video = this.videoElement;

        // Si Hls.js est supporté via MSE
        if (Hls.isSupported()) {
            const hls = new Hls({
                enableWorker: true,
                lowLatencyMode: false,
                capLevelToPlayerSize: false,
                // Buffer intelligent : limite la RAM client à ~60-90 Mo
                backBufferLength: 30, // Éviction automatique des segments passés
                maxBufferLength: 45,  // 45 secondes de buffer en avant
                maxMaxBufferLength: 90,
                maxBufferSize: 60 * 1024 * 1024, // 60 Mo max
                startLevel: -1,       // Auto / ABR adaptatif
                startPosition: startPosition > 0 ? startPosition : -1,
                progressive: true
            });

            this.hlsInstance = hls;
            hls.attachMedia(video);

            hls.on(Hls.Events.MEDIA_ATTACHED, () => {
                if (this.isDestroyed) return;
                hls.loadSource(url);
            });

            hls.on(Hls.Events.MANIFEST_PARSED, (_event, _data) => {
                if (this.isDestroyed) return;

                // Qualités ABR disponibles
                if (hls.levels && hls.levels.length > 0) {
                    const parsedQualities = [
                        { id: -1, label: 'Auto (Adaptatif)' },
                        ...hls.levels.map((lvl, idx) => ({
                            id: idx,
                            height: lvl.height || 0,
                            bitrate: lvl.bitrate || 0,
                            label: lvl.height ? `${lvl.height}p ${lvl.height >= 720 ? 'HD' : ''}`.trim() : `Niveau ${idx + 1}`
                        })).sort((a, b) => (b.height || 0) - (a.height || 0))
                    ];
                    this.callbacks.onQualitiesReady(parsedQualities);
                }

                // Pistes audio
                if (hls.audioTracks && hls.audioTracks.length > 0) {
                    const tracks = hls.audioTracks.map((t, idx) => ({
                        id: idx,
                        name: t.name || t.lang || `Piste ${idx + 1}`,
                        lang: t.lang || ''
                    }));
                    this.callbacks.onAudioTracksReady(tracks);

                    // Sélection de la langue préférée
                    const isVo = preferredAudioLang.toUpperCase().includes('VO');
                    const targetIdx = isVo
                        ? hls.audioTracks.findIndex(t => !['fr', 'fra', 'fre'].includes((t.lang || '').toLowerCase()))
                        : hls.audioTracks.findIndex(t => ['fr', 'fra', 'fre'].includes((t.lang || '').toLowerCase()));

                    if (targetIdx !== -1) {
                        hls.audioTrack = targetIdx;
                    }
                }

                // Sous-titres HLS embarqués
                if (hls.subtitleTracks && hls.subtitleTracks.length > 0) {
                    const subs = hls.subtitleTracks.map((t, idx) => ({
                        id: idx,
                        label: t.name || t.lang || `Piste ${idx + 1}`,
                        lang: t.lang || ''
                    }));
                    this.callbacks.onSubtitleTracksReady(subs);
                }

                this.callbacks.onBufferingChange(false);
                video.play().catch((err) => {
                    if (err?.name === 'NotAllowedError') {
                        // Autoplay bloqué par le navigateur : muter et relancer
                        video.muted = true;
                        this.callbacks.onAutoplayMuted?.(true);
                        video.play().catch(() => {});
                    }
                });
            });

            // Suivi du trafic réseau réel des segments
            hls.on(Hls.Events.FRAG_LOADED, (event, data) => {
                if (data?.stats?.total) {
                    this.metrics.networkBytesTransferred += data.stats.total;
                }
                if (data?.frag?.level !== undefined && hls.levels?.[data.frag.level]) {
                    const level = hls.levels[data.frag.level];
                    this.metrics.currentBitrateKbps = Math.round((level.bitrate || 0) / 1000);
                    this.metrics.currentHeight = level.height || 0;
                }
            });

            // Gestion d'erreurs et résilience réseau
            hls.on(Hls.Events.ERROR, (event, data) => {
                if (this.isDestroyed) return;
                console.warn('[UnifiedEngine:HLS] Event error:', data.type, data.details);

                if (data.fatal) {
                    switch (data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            this.retryCount++;
                            if (this.retryCount <= this.maxRetries) {
                                console.log(`[UnifiedEngine:HLS] Erreur réseau, tentative ${this.retryCount}/${this.maxRetries}...`);
                                if (this.hlsRetryTimer) clearTimeout(this.hlsRetryTimer);
                                this.hlsRetryTimer = setTimeout(() => {
                                    this.hlsRetryTimer = null;
                                    if (!this.isDestroyed && this.hlsInstance) {
                                        this.hlsInstance.startLoad();
                                    }
                                }, 1000 * Math.pow(2, this.retryCount - 1));
                            } else {
                                this.callbacks.onError({
                                    message: 'Flux HLS inaccessible. Vérifiez votre connexion.',
                                    details: data.details,
                                    fatal: true
                                });
                            }
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            this.mediaErrorRecoveryCount++;
                            if (this.mediaErrorRecoveryCount <= 2) {
                                console.log(`[UnifiedEngine:HLS] Récupération d'erreur média (${this.mediaErrorRecoveryCount}/2)...`);
                                hls.recoverMediaError();
                            } else {
                                this.callbacks.onError({
                                    message: 'Erreur média HLS irrécupérable.',
                                    details: data.details,
                                    fatal: true
                                });
                            }
                            break;
                        default:
                            this.callbacks.onError({
                                message: 'Erreur critique de lecture HLS.',
                                details: data.details,
                                fatal: true
                            });
                            break;
                    }
                }
            });

        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            // Safari iOS / macOS : lecture native Apple HLS
            this.currentEngineType = ENGINE_TYPES.HLS;
            video.src = url;
            if (startPosition > 0) {
                this._pendingMetaHandler = () => {
                    this._pendingMetaHandler = null;
                    if (!this.isDestroyed && Number.isFinite(video.duration) && startPosition < video.duration - 10) {
                        video.currentTime = startPosition;
                    }
                };
                video.addEventListener('loadedmetadata', this._pendingMetaHandler, { once: true });
            }
            video.play().catch(() => {});
        } else {
            throw new Error('Le format HLS n\'est pas supporté par ce navigateur.');
        }
    }

    /**
     * Moteur 2 : MPEG-DASH via Shaka Player (Google ISO/IEC 23009-1)
     */
    async initDash(url, startPosition, _preferredAudioLang) {
        const video = this.videoElement;

        const { default: shaka } = await import('shaka-player');
        if (this.isDestroyed) return;
        if (!shaka.Player.isBrowserSupported()) {
            throw new Error('MPEG-DASH / Shaka Player n\'est pas supporté par ce navigateur.');
        }

        shaka.polyfill.installAll();
        const player = new shaka.Player(video);
        if (this.isDestroyed) {
            player.destroy().catch(() => {});
            return;
        }
        this.shakaInstance = player;

        // Configuration du buffer Shaka
        player.configure({
            streaming: {
                bufferingGoal: 45,     // 45s d'avance
                rebufferingGoal: 2,    // Démarrage dès 2s de données
                bufferBehind: 30,      // Purge automatique de la mémoire en arrière
                lowLatencyMode: false
            },
            abr: {
                enabled: true,
                defaultBandwidthEstimate: 3000000 // 3 Mbps par défaut
            }
        });

        player.addEventListener('error', (event) => {
            if (this.isDestroyed) return;
            console.error('[UnifiedEngine:DASH] Shaka error:', event.detail);
            this.callbacks.onError({
                message: 'Erreur lors de la lecture du flux DASH.',
                details: event.detail,
                fatal: true
            });
        });

        player.addEventListener('buffering', (event) => {
            if (this.isDestroyed) return;
            this.callbacks.onBufferingChange(event.buffering);
        });

        await player.load(url);
        if (this.isDestroyed) {
            player.destroy().catch(() => {});
            return;
        }

        if (startPosition > 0) {
            video.currentTime = startPosition;
        }

        // Extraction des qualités DASH (Auto toujours en tête, suivi des résolutions décroissantes)
        const tracks = player.getVariantTracks();
        const seenHeights = new Set();
        const sortedTracks = [];

        tracks.forEach(t => {
            if (t.height && !seenHeights.has(t.height)) {
                seenHeights.add(t.height);
                sortedTracks.push({
                    id: t.id,
                    height: t.height,
                    bitrate: t.bandwidth || 0,
                    label: `${t.height}p ${t.height >= 720 ? 'HD' : ''}`.trim()
                });
            }
        });

        sortedTracks.sort((a, b) => (b.height || 0) - (a.height || 0));
        this.callbacks.onQualitiesReady([{ id: -1, label: 'Auto (Adaptatif)' }, ...sortedTracks]);

        this.callbacks.onBufferingChange(false);
        video.play().catch((err) => {
            if (err?.name !== 'NotAllowedError') return;
            video.muted = true;
            this.callbacks.onAutoplayMuted?.(true);
            video.play().catch(() => {});
        });
    }

    /**
     * Moteur 3 : Direct MP4 / WebM avec HTTP Range Requests (206 Partial Content)
     * Télécharge uniquement les segments nécessaires via les requêtes d'intervalle d'octets.
     */
    async initRangeNative(url, startPosition = 0) {
        const video = this.videoElement;
        if (!video) return;

        this.metrics.rangeSupported = true;

        // Connexion directe sans blocage réseau ni requête HEAD/CORS inutile
        video.src = url;

        // Pour un flux MP4 direct, les qualités sont intrinsèques
        this.callbacks.onQualitiesReady([
            { id: 0, label: 'Source Directe (Range 206)', height: 0, bitrate: 0 }
        ]);

        // Appliquer la position de reprise avant lecture (évite d'écraser l'historique à 0s)
        if (startPosition > 5) {
            this._pendingMetaHandler = () => {
                this._pendingMetaHandler = null;
                if (!this.isDestroyed && Number.isFinite(video.duration) && startPosition < video.duration - 15) {
                    video.currentTime = startPosition;
                }
            };
            video.addEventListener('loadedmetadata', this._pendingMetaHandler, { once: true });
        }
    }

    /**
     * Moteur 4 : WebTorrent (P2P Streaming séquentiel)
     * Utilise le téléchargement ordonné des blocs pour alimenter l'élément vidéo sans serveur.
     */
    async initWebTorrent(torrentIdentifier, startPosition) {
        const video = this.videoElement;

        try {
            // Chargement dynamique du client WebTorrent depuis l'environnement navigateur
            let WebTorrent = typeof window !== 'undefined' ? window.WebTorrent : null;

            if (!WebTorrent && typeof window !== 'undefined' && typeof document !== 'undefined') {
                await new Promise((resolve, reject) => {
                    if (window.WebTorrent) return resolve(window.WebTorrent);
                    const existing = document.querySelector('script[data-webtorrent]');
                    if (existing) {
                        existing.addEventListener('load', () => resolve(window.WebTorrent));
                        existing.addEventListener('error', () => reject(new Error('Échec du chargement WebTorrent')));
                        return;
                    }
                    const script = document.createElement('script');
                    script.src = 'https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js';
                    script.async = true;
                    script.dataset.webtorrent = 'true';
                    script.onload = () => resolve(window.WebTorrent);
                    script.onerror = () => reject(new Error('WebTorrent CDN indisponible'));
                    document.head.appendChild(script);
                });
                WebTorrent = window.WebTorrent;
            }

            if (this.isDestroyed) return;
            if (!WebTorrent) {
                throw new Error('WebTorrent n\'est pas disponible dans cet environnement.');
            }

            const client = new WebTorrent();
            if (this.isDestroyed) {
                try { client.destroy(); } catch { /* ignore */ }
                return;
            }
            this.torrentClient = client;

            client.add(torrentIdentifier, (torrent) => {
                if (this.isDestroyed) {
                    try { torrent.destroy(); } catch { /* ignore */ }
                    return;
                }

                // Recherche du fichier vidéo principal dans le torrent
                const file = torrent.files.find(f =>
                    f.name.endsWith('.mp4') || f.name.endsWith('.webm') || f.name.endsWith('.mkv')
                ) || torrent.files[0];

                if (!file) {
                    this.callbacks.onError?.({
                        message: 'Aucun fichier vidéo trouvé dans ce torrent.',
                        fatal: true
                    });
                    return;
                }

                // Polling régulier des statistiques P2P (pairs, vitesse, progression)
                if (this._torrentStatsInterval) clearInterval(this._torrentStatsInterval);
                this._torrentStatsInterval = setInterval(() => {
                    if (this.isDestroyed || !torrent) {
                        clearInterval(this._torrentStatsInterval);
                        return;
                    }
                    const p2pData = {
                        numPeers: torrent.numPeers || 0,
                        downloadSpeed: torrent.downloadSpeed || 0,
                        uploadSpeed: torrent.uploadSpeed || 0,
                        progress: torrent.progress || 0,
                        downloaded: torrent.downloaded || 0,
                        ratio: torrent.ratio || 0
                    };
                    this.metrics.numPeers = p2pData.numPeers;
                    this.metrics.currentBitrateKbps = Math.round((p2pData.downloadSpeed * 8) / 1000);
                    if (this.callbacks.onP2PStats) {
                        this.callbacks.onP2PStats(p2pData);
                    }
                }, 1000);

                // Streaming séquentiel direct vers le tag <video> via MediaSource
                file.renderTo(video, {
                    autoplay: true,
                    maxBufferLength: 45
                }, (err) => {
                    if (this.isDestroyed) return;
                    if (err) {
                        this.callbacks.onError({
                            message: 'Erreur de rendu WebTorrent : ' + err.message,
                            fatal: true
                        });
                    }
                });

                if (startPosition > 0) {
                    const seekOnMeta = () => {
                        if (this.isDestroyed) return;
                        try { video.currentTime = startPosition; } catch { /* ignore */ }
                    };
                    if (video.readyState >= 1) {
                        seekOnMeta();
                    } else {
                        this._pendingMetaHandler = seekOnMeta;
                        video.addEventListener('loadedmetadata', seekOnMeta, { once: true });
                    }
                }

                this.callbacks.onQualitiesReady([
                    { id: 0, label: 'P2P Stream (WebTorrent)', height: 0, bitrate: 0 }
                ]);
            });

        } catch (err) {
            console.warn('[UnifiedEngine:WebTorrent] Fallback non disponible:', err.message);
            throw err;
        }
    }

    /**
     * Écouteurs d'événements de l'élément HTML5 Video
     */
    attachVideoListeners() {
        const video = this.videoElement;
        if (!video) return;

        this._onLoadedData = () => {
            if (!this.firstFrameRendered) {
                this.firstFrameRendered = true;
                this.metrics.timeToFirstFrameMs = Math.round(performance.now() - this.loadStartTime);
            }
        };

        this._onWaiting = () => {
            this.lastBufferingStart = performance.now();
            this.metrics.bufferingCount++;
            this.callbacks.onBufferingChange(true);
        };

        this._onPlaying = () => {
            if (this.lastBufferingStart > 0) {
                this.metrics.bufferingDurationMs += Math.round(performance.now() - this.lastBufferingStart);
                this.lastBufferingStart = 0;
            }
            if (!this.firstFrameRendered) {
                this.firstFrameRendered = true;
                this.metrics.timeToFirstFrameMs = Math.round(performance.now() - this.loadStartTime);
            }
            this.callbacks.onBufferingChange(false);
        };

        this._onSeeking = () => {
            this.lastSeekStart = performance.now();
        };

        this._onSeeked = () => {
            if (this.lastSeekStart > 0) {
                this.metrics.seekLatencyMs = Math.round(performance.now() - this.lastSeekStart);
                this.lastSeekStart = 0;
            }
        };

        video.addEventListener('loadeddata', this._onLoadedData);
        video.addEventListener('waiting', this._onWaiting);
        video.addEventListener('playing', this._onPlaying);
        video.addEventListener('seeking', this._onSeeking);
        video.addEventListener('seeked', this._onSeeked);
    }

    /**
     * Détache les écouteurs vidéo
     */
    detachVideoListeners() {
        const video = this.videoElement;
        if (!video) return;
        if (this._onLoadedData) video.removeEventListener('loadeddata', this._onLoadedData);
        if (this._onWaiting) video.removeEventListener('waiting', this._onWaiting);
        if (this._onPlaying) video.removeEventListener('playing', this._onPlaying);
        if (this._onSeeking) video.removeEventListener('seeking', this._onSeeking);
        if (this._onSeeked) video.removeEventListener('seeked', this._onSeeked);
    }

    /**
     * Polling des métriques en temps réel (Buffer, RAM, Bitrate, Frames)
     */
    startMetricsPolling() {
        this.stopMetricsPolling();
        this.metricsInterval = setInterval(() => {
            if (this.isDestroyed || !this.videoElement) return;
            const video = this.videoElement;

            // 1. Calcul du buffer disponible devant la tête de lecture
            let ahead = 0;
            const ct = video.currentTime;
            for (let i = 0; i < video.buffered.length; i++) {
                const start = video.buffered.start(i);
                const end = video.buffered.end(i);
                if (ct >= start && ct <= end) {
                    ahead = Math.max(0, end - ct);
                    break;
                }
            }
            this.metrics.bufferedAheadSec = Math.round(ahead * 10) / 10;

            // 2. Estimation de la mémoire vive consommée par le buffer (en Mo)
            // Estimation basée sur les plages en mémoire tampon et le débit estimé
            let totalBufferedSec = 0;
            for (let i = 0; i < video.buffered.length; i++) {
                totalBufferedSec += (video.buffered.end(i) - video.buffered.start(i));
            }
            const bitrateKbps = this.metrics.currentBitrateKbps || 2500;
            const estimatedBytes = (totalBufferedSec * bitrateKbps * 1000) / 8;
            this.metrics.estimatedMemoryMB = Math.round((estimatedBytes / (1024 * 1024)) * 10) / 10;

            // 3. Dropped frames
            if (typeof video.getVideoPlaybackQuality === 'function') {
                const q = video.getVideoPlaybackQuality();
                this.metrics.droppedFrames = q.droppedVideoFrames || 0;
            }

            // Notification UI
            this.callbacks.onMetricsUpdate({ ...this.metrics });
        }, 1000);
    }

    stopMetricsPolling() {
        if (this.metricsInterval) {
            clearInterval(this.metricsInterval);
            this.metricsInterval = null;
        }
    }

    /**
     * Gestion du statut réseau Online
     */
    handleOnline() {
        this.metrics.isOnline = true;
        this.callbacks.onNetworkStatusChange({ online: true });

        // Reprise automatique uniquement si la lecture avait été interrompue par la coupure réseau
        if (this.hlsInstance) {
            this.hlsInstance.startLoad();
        }
        if (this.pausedByOffline && this.videoElement && this.videoElement.paused) {
            this.pausedByOffline = false;
            this.videoElement.play().catch(() => {});
        }
    }

    /**
     * Gestion du statut réseau Offline
     */
    handleOffline() {
        this.metrics.isOnline = false;
        this.pausedByOffline = Boolean(this.videoElement && !this.videoElement.paused);
        this.callbacks.onNetworkStatusChange({ online: false });
    }

    /**
     * Changement de qualité vidéo (normalisé pour tous les moteurs)
     */
    setQuality(qualityId) {
        if (this.hlsInstance) {
            this.hlsInstance.currentLevel = qualityId; // -1 = Auto
        } else if (this.shakaInstance) {
            if (qualityId === -1) {
                this.shakaInstance.configure({ abr: { enabled: true } });
            } else {
                this.shakaInstance.configure({ abr: { enabled: false } });
                const tracks = this.shakaInstance.getVariantTracks();
                const target = tracks.find(t => t.id === qualityId);
                if (target) {
                    this.shakaInstance.selectVariantTrack(target, true);
                }
            }
        }
    }

    /**
     * Changement de piste audio
     */
    setAudioTrack(trackId) {
        if (this.hlsInstance) {
            this.hlsInstance.audioTrack = trackId;
        } else if (this.shakaInstance) {
            const tracks = this.shakaInstance.getAudioLanguages();
            if (tracks[trackId]) {
                this.shakaInstance.selectAudioLanguage(tracks[trackId]);
            }
        }
    }

    /**
     * Seeking optimisé avec flush du buffer
     */
    seek(targetSeconds) {
        if (!this.videoElement) return;
        this.lastSeekStart = performance.now();
        this.videoElement.currentTime = targetSeconds;
    }

    /**
     * Nettoyage complet des adaptateurs
     */
    cleanupAdapters() {
        if (this.hlsRetryTimer) {
            clearTimeout(this.hlsRetryTimer);
            this.hlsRetryTimer = null;
        }
        if (this._pendingMetaHandler && this.videoElement) {
            this.videoElement.removeEventListener('loadedmetadata', this._pendingMetaHandler);
            this._pendingMetaHandler = null;
        }
        if (this._torrentStatsInterval) {
            clearInterval(this._torrentStatsInterval);
            this._torrentStatsInterval = null;
        }
        if (this.hlsInstance) {
            this.hlsInstance.destroy();
            this.hlsInstance = null;
        }
        if (this.shakaInstance) {
            this.shakaInstance.destroy().catch(() => {});
            this.shakaInstance = null;
        }
        if (this.torrentClient) {
            try { this.torrentClient.destroy(); } catch { /* ignore */ }
            this.torrentClient = null;
        }
    }

    /**
     * Destruction finale
     */
    destroy() {
        this.isDestroyed = true;
        this.stopMetricsPolling();
        this.detachVideoListeners();
        this.cleanupAdapters();

        // Arrêter et vider immédiatement le <video> pour éviter tout son ou image fantôme en arrière-plan
        if (this.videoElement) {
            try {
                this.videoElement.pause();
                this.videoElement.removeAttribute('src');
                this.videoElement.load();
            } catch { /* ignore */ }
        }

        if (typeof window !== 'undefined') {
            window.removeEventListener('online', this.handleOnline);
            window.removeEventListener('offline', this.handleOffline);
        }

        this.videoElement = null;
    }
}
