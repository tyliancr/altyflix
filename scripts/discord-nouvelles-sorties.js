/**
 * discord-nouvelles-sorties.js
 * 
 * Envoie un embed Discord avec les nouveaux films et séries
 * disponibles sur AltyFlix (via l'API TMDB).
 * 
 * Usage: node scripts/discord-nouvelles-sorties.js
 */

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMAGE = 'https://image.tmdb.org/t/p/w500';
const SITE_URL = 'https://altyflix.netlify.app';
const BOT_NAME = 'ALTYFLIX';
const BOT_AVATAR = 'https://altyflix.netlify.app/brand/altyflix-icon-512.png';

// Couleur rouge AltyFlix (hex → decimal)
const COLOR_RED = 0xE50914;  // 15009044
const COLOR_BLUE = 0x3b82f6; // Bleu pour les séries

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function fetchTMDB(endpoint, params = {}) {
    const url = new URL(`${TMDB_BASE}${endpoint}`);
    url.searchParams.set('api_key', TMDB_API_KEY);
    url.searchParams.set('language', 'fr-FR');
    for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
    }

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`TMDB error ${res.status} on ${endpoint}`);
    return res.json();
}

function getToday() {
    return new Date().toISOString().split('T')[0];
}

function getDateDaysAgo(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().split('T')[0];
}

function formatDate(dateStr) {
    if (!dateStr) return 'Date inconnue';
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function ratingStars(vote) {
    const stars = Math.round(vote / 2);
    return '⭐'.repeat(Math.min(stars, 5)) + '☆'.repeat(Math.max(0, 5 - stars));
}

// ─── Fetch new content ────────────────────────────────────────────────────────

async function getNewMovies(days = 14) {
    const data = await fetchTMDB('/discover/movie', {
        'primary_release_date.gte': getDateDaysAgo(days),
        'primary_release_date.lte': getToday(),
        'sort_by': 'popularity.desc',
        'vote_count.gte': 10,
        'with_original_language': 'fr|en',
        'region': 'FR'
    });
    return (data.results || []).slice(0, 5);
}

async function getNewSeries(days = 14) {
    const data = await fetchTMDB('/discover/tv', {
        'first_air_date.gte': getDateDaysAgo(days),
        'first_air_date.lte': getToday(),
        'sort_by': 'popularity.desc',
        'vote_count.gte': 5,
    });
    return (data.results || []).slice(0, 5);
}

// ─── Build embeds ─────────────────────────────────────────────────────────────

function buildMovieEmbed(movies) {
    const fields = movies.map((m) => ({
        name: `🎬 ${m.title}`,
        value: [
            `> ${m.overview ? m.overview.slice(0, 120) + (m.overview.length > 120 ? '...' : '') : 'Pas de description.'}`,
            `📅 ${formatDate(m.release_date)} • ${ratingStars(m.vote_average)} ${m.vote_average?.toFixed(1)}/10`,
            `[▶ Regarder sur AltyFlix](${SITE_URL}/movie/${m.id})`
        ].join('\n'),
        inline: false,
    }));

    return {
        title: '🎬 Nouveaux Films',
        color: COLOR_RED,
        description: `Les dernières sorties disponibles sur **[AltyFlix](${SITE_URL})** !`,
        fields,
        thumbnail: movies[0]?.poster_path
            ? { url: `${TMDB_IMAGE}${movies[0].poster_path}` }
            : undefined,
        footer: {
            text: 'AltyFlix • Nouveaux Films',
            icon_url: `${SITE_URL}/altyflix-icon-512.png`,
        },
        timestamp: new Date().toISOString(),
    };
}

function buildSeriesEmbed(series) {
    const fields = series.map((s) => ({
        name: `📺 ${s.name}`,
        value: [
            `> ${s.overview ? s.overview.slice(0, 120) + (s.overview.length > 120 ? '...' : '') : 'Pas de description.'}`,
            `📅 ${formatDate(s.first_air_date)} • ${ratingStars(s.vote_average)} ${s.vote_average?.toFixed(1)}/10`,
            `[▶ Regarder sur AltyFlix](${SITE_URL}/tv/${s.id})`
        ].join('\n'),
        inline: false,
    }));

    return {
        title: '📺 Nouvelles Séries',
        color: COLOR_BLUE,
        description: `Les dernières séries disponibles sur **[AltyFlix](${SITE_URL})** !`,
        fields,
        thumbnail: series[0]?.poster_path
            ? { url: `${TMDB_IMAGE}${series[0].poster_path}` }
            : undefined,
        footer: {
            text: 'AltyFlix • Nouvelles Séries',
            icon_url: `${SITE_URL}/altyflix-icon-512.png`,
        },
        timestamp: new Date().toISOString(),
    };
}

// ─── Send to Discord ──────────────────────────────────────────────────────────

async function sendToDiscord(embeds, content = '') {
    const body = {
        username: BOT_NAME,
        avatar_url: BOT_AVATAR,
        content,
        embeds,
    };

    const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Discord webhook error ${res.status}: ${err}`);
    }

    // Discord rate limit: max 10 embeds par message, on split en 2 requêtes
    // avec un petit délai pour éviter le rate limit
    return res;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    const args = process.argv.slice(2);
    const days = parseInt(args[0]) || 14; // Défaut : 14 derniers jours

    console.log(`🔍 Récupération des nouveaux contenus des ${days} derniers jours...`);

    try {
        const [movies, series] = await Promise.all([
            getNewMovies(days),
            getNewSeries(days),
        ]);

        console.log(`✅ ${movies.length} film(s) et ${series.length} série(s) trouvés`);

        if (movies.length === 0 && series.length === 0) {
            console.log('❌ Aucun nouveau contenu trouvé.');
            return;
        }

        const embeds = [];
        if (movies.length > 0) embeds.push(buildMovieEmbed(movies));
        if (series.length > 0) embeds.push(buildSeriesEmbed(series));

        // Discord limite à 10 embeds par message — on envoie films et séries séparément si besoin
        if (embeds.length <= 10) {
            await sendToDiscord(embeds, '🍿 **Nouveautés de la semaine sur AltyFlix !**');
            console.log('✅ Embed envoyé sur Discord !');
        } else {
            await sendToDiscord([embeds[0]], '🍿 **Nouveautés de la semaine sur AltyFlix !**\n🎬 Films :');
            await new Promise(r => setTimeout(r, 1000));
            await sendToDiscord([embeds[1]], '📺 Séries :');
            console.log('✅ Embeds envoyés sur Discord (en 2 messages) !');
        }

    } catch (err) {
        console.error('❌ Erreur :', err.message);
        process.exit(1);
    }
}

main();
