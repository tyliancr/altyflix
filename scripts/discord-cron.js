/**
 * discord-cron.js
 * ──────────────────────────────────────────────────────────────────────────────
 * Lance les nouveautés AltyFlix automatiquement chaque LUNDI à 10h00
 *
 * Usage : node scripts/discord-cron.js
 * (laisser tourner en arrière-plan — ex: avec PM2 ou Task Scheduler Windows)
 *
 * PM2 : pm2 start scripts/discord-cron.js --name altyflix-cron
 */

import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ─── Config ───────────────────────────────────────────────────────────────────
const HEURE_ENVOI = 10; // Lundi à 10h00 (heure locale)
const MINUTES     = 0;

// ─── Utilitaires ──────────────────────────────────────────────────────────────
function prochainLundi() {
    const now = new Date();
    const jour = now.getDay(); // 0=dim, 1=lun, ..., 6=sam

    // Jours restants avant le prochain lundi
    const joursRestants = jour === 1
        ? 7  // On est lundi → prochain lundi dans 7 jours
        : (8 - jour) % 7 || 7;

    const lundi = new Date(now);
    lundi.setDate(now.getDate() + joursRestants);
    lundi.setHours(HEURE_ENVOI, MINUTES, 0, 0);
    return lundi;
}

function formatDate(date) {
    return date.toLocaleString('fr-FR', {
        weekday: 'long', day: '2-digit', month: 'long',
        year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
}

function msJusquaLundi() {
    return prochainLundi().getTime() - Date.now();
}

// ─── Exécution du script de nouveautés ───────────────────────────────────────
function lancerNouveautes() {
    console.log(`\n🚀  [${new Date().toLocaleString('fr-FR')}] Lancement des nouveautés...`);

    const proc = spawn(
        process.execPath,
        [path.join(__dirname, 'discord-nouveautes.js')],
        { cwd: ROOT, stdio: 'inherit' }
    );

    proc.on('close', (code) => {
        if (code === 0) {
            console.log(`✅  Nouveautés postées avec succès !`);
        } else {
            console.error(`❌  Erreur lors de l'envoi (code ${code})`);
        }

        // Programmer le prochain lundi
        planifier();
    });
}

// ─── Planification ────────────────────────────────────────────────────────────
function planifier() {
    const ms     = msJusquaLundi();
    const lundi  = prochainLundi();
    const heures = Math.floor(ms / 3600000);
    const mins   = Math.floor((ms % 3600000) / 60000);

    console.log(`\n⏰  Prochain envoi : ${formatDate(lundi)}`);
    console.log(`   Dans ${heures}h ${mins}min\n`);

    setTimeout(() => {
        lancerNouveautes();
    }, ms);
}

// ─── Démarrage ────────────────────────────────────────────────────────────────
console.log('🤖  AltyFlix Cron Bot — Nouveautés hebdomadaires');
console.log('═══════════════════════════════════════════════════');
console.log(`   Envoi programmé : Chaque lundi à ${String(HEURE_ENVOI).padStart(2,'0')}h${String(MINUTES).padStart(2,'0')}`);

planifier();
