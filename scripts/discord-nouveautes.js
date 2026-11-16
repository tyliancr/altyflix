/**
 * discord-nouveautes.js
 * ──────────────────────────────────────────────────────────────────────────────
 * Poste automatiquement les nouveautés de la semaine dans #nouveautés
 * Mentionne le rôle @🆕 Nouveautés (pas @everyone)
 *
 * ► Lance manuellement : node scripts/discord-nouveautes.js
 * ► Automatique chaque lundi : node scripts/discord-cron.js
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(path.join(__dirname, 'bot-config.json'), 'utf8'));

const { TOKEN: _legacyToken, guildId } = config;
const TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_API = 'https://discord.com/api/v10';
const TMDB_API    = 'https://api.themoviedb.org/3';
const TMDB_KEY    = process.env.TMDB_API_KEY;
const TMDB_IMG    = 'https://image.tmdb.org/t/p/w185';
const SITE_URL    = 'https://altyflix.netlify.app';

// ─── IDs des rôles Discord ────────────────────────────────────────────────────
const ROLE_NOUVEAUTES = '1554913920374804491'; // 🆕 Nouveautés

// ─── Couleurs ─────────────────────────────────────────────────────────────────
const RED  = 0xE50914;
const BLUE = 0x5865F2;
const GOLD = 0xF1A817;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── Discord API ───────────────────────────────────────────────────────────────
async function discordApi(method, endpoint, body = null) {
    const opts = {
        method,
        headers: { Authorization: `Bot ${TOKEN}`, 'Content-Type': 'application/json' },
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${DISCORD_API}${endpoint}`, opts);
    if (res.status === 429) {
        const d = await res.json();
        const wait = Math.ceil((d.retry_after || 1) * 1000) + 300;
        console.log(`   ⏳ Rate limit — attente ${wait}ms`);
        await sleep(wait);
        return discordApi(method, endpoint, body);
    }
    if (res.status === 204) return null;
    if (!res.ok) throw new Error(`Discord ${method} ${endpoint} → ${res.status}: ${await res.text()}`);
    return res.json();
}

const dGet  = ep      => discordApi('GET',  ep);
const dPost = (ep, b) => discordApi('POST', ep, b);

// ─── TMDB API ─────────────────────────────────────────────────────────────────
async function tmdbGet(endpoint, params = {}) {
    const url = new URL(`${TMDB_API}${endpoint}`);
    url.searchParams.set('api_key', TMDB_KEY);
    url.searchParams.set('language', 'fr-FR');
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`TMDB ${endpoint} → ${res.status}`);
    return res.json();
}

// ─── Récupération des nouveautés ──────────────────────────────────────────────
async function fetchNouveautes() {
    const today   = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(today.getDate() - 7);

    const todayStr   = today.toISOString().split('T')[0];
    const weekAgoStr = weekAgo.toISOString().split('T')[0];

    const [filmsData, seriesData] = await Promise.all([
        tmdbGet('/discover/movie', {
            'primary_release_date.gte': weekAgoStr,
            'primary_release_date.lte': todayStr,
            sort_by: 'popularity.desc',
            include_adult: false,
            'vote_count.gte': 10,
        }),
        tmdbGet('/discover/tv', {
            'first_air_date.gte': weekAgoStr,
            'first_air_date.lte': todayStr,
            sort_by: 'popularity.desc',
            'vote_count.gte': 5,
        }),
    ]);

    return {
        films:  (filmsData.results  || []).slice(0, 5),
        series: (seriesData.results || []).slice(0, 5),
    };
}

// ─── Formatage ────────────────────────────────────────────────────────────────
const stars = (note) => '⭐'.repeat(Math.min(Math.round(note / 2), 5)) || '☆';

function formatItem(item, isMovie) {
    const titre     = item.title || item.name || '?';
    const date      = item.release_date || item.first_air_date || '?';
    const note      = item.vote_average ? `${item.vote_average.toFixed(1)}/10 ${stars(item.vote_average)}` : 'N/A';
    const resume    = item.overview
        ? (item.overview.length > 130 ? item.overview.slice(0, 127) + '...' : item.overview)
        : '*Aucun résumé disponible.*';
    const emoji     = isMovie ? '🎥' : '📺';
    const mediaType = isMovie ? 'films' : 'series';
    const lien      = `${SITE_URL}/${mediaType}/${item.id}`;
    return `${emoji} **[${titre}](${lien})** *(${date})* — ${note}\n> ${resume}`;
}

// ─── Embeds ───────────────────────────────────────────────────────────────────
function buildIntroEmbed(semaine) {
    return {
        // Mentionne uniquement le rôle @🆕 Nouveautés
        content: `<@&${ROLE_NOUVEAUTES}>`,
        embeds: [{
            title: `🗓️  Nouveautés de la semaine — ${semaine}`,
            color: GOLD,
            description: [
                '🍿 Voici les **films et séries** qui viennent de débarquer sur **AltyFlix** cette semaine !',
                '',
                `> 🌐 Tout voir sur **[altyflix.netlify.app](${SITE_URL})**`,
            ].join('\n'),
            footer: { text: 'AltyFlix · Nouveautés hebdomadaires chaque lundi' },
            timestamp: new Date().toISOString(),
        }],
        allowed_mentions: { roles: [ROLE_NOUVEAUTES] },
    };
}

function buildFilmsEmbed(films) {
    return {
        embeds: [{
            title: '🎥  Nouveaux Films',
            color: RED,
            description: films.map(f => formatItem(f, true)).join('\n\n'),
            thumbnail: films[0]?.poster_path ? { url: `${TMDB_IMG}${films[0].poster_path}` } : undefined,
            footer: { text: `${films.length} film(s) cette semaine · AltyFlix` },
        }],
    };
}

function buildSeriesEmbed(series) {
    return {
        embeds: [{
            title: '📺  Nouvelles Séries',
            color: BLUE,
            description: series.map(s => formatItem(s, false)).join('\n\n'),
            thumbnail: series[0]?.poster_path ? { url: `${TMDB_IMG}${series[0].poster_path}` } : undefined,
            footer: { text: `${series.length} série(s) cette semaine · AltyFlix` },
        }],
    };
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
    console.log('🎬  AltyFlix — Nouveautés de la semaine...\n');

    const channels     = await dGet(`/guilds/${guildId}/channels`);
    const nouveautesCh = channels.find(c => c.name?.includes('nouveaut'));

    if (!nouveautesCh) {
        console.error('❌  Salon #nouveautés introuvable !');
        process.exit(1);
    }

    console.log(`   📺  Salon trouvé : #${nouveautesCh.name}`);
    console.log('   🌐  Récupération TMDB...');

    const { films, series } = await fetchNouveautes();
    console.log(`   🎥  Films  : ${films.length} trouvés`);
    console.log(`   📺  Séries : ${series.length} trouvées`);

    // Date de la semaine formatée
    const today = new Date();
    const semaine = today.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

    // Envoi dans l'ordre : intro → films → séries
    await dPost(`/channels/${nouveautesCh.id}/messages`, buildIntroEmbed(semaine));
    console.log('   ✅  Intro envoyée');
    await sleep(1000);

    if (films.length > 0) {
        await dPost(`/channels/${nouveautesCh.id}/messages`, buildFilmsEmbed(films));
        console.log('   ✅  Films envoyés');
        await sleep(1000);
    }

    if (series.length > 0) {
        await dPost(`/channels/${nouveautesCh.id}/messages`, buildSeriesEmbed(series));
        console.log('   ✅  Séries envoyées');
    }

    console.log(`\n🎉  Nouveautés postées avec succès !`);
    console.log(`   🎭  Rôle mentionné : @🆕 Nouveautés`);
    console.log(`   🎥  Films  : ${films.length}`);
    console.log(`   📺  Séries : ${series.length}`);
}

main().catch(err => {
    console.error('❌  Erreur :', err.message);
    process.exit(1);
});
