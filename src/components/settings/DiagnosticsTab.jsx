import { motion } from 'framer-motion';
import { Card, SectionHeader } from './SettingsUI';
import Icon from '../ui/Icons';

const TONES = {
    ok: { dot: 'bg-[#46d369]', text: 'text-white' },
    error: { dot: 'bg-[#E50914]', text: 'text-[#ff5a63]' },
    pending: { dot: 'bg-white/40 animate-pulse', text: 'text-white/40' },
    off: { dot: 'bg-white/25', text: 'text-white/60' },
};

const Monitor = ({ label, description, value, tone }) => (
    <div className="flex items-center justify-between gap-4 px-6 py-4">
        <div className="flex min-w-0 items-center gap-3.5">
            <span className={`h-2.5 w-2.5 flex-none rounded-full ${TONES[tone].dot}`} aria-hidden="true" />
            <div className="min-w-0">
                <p className="text-[15px] font-semibold text-white">{label}</p>
                <p className="mt-0.5 truncate text-[13px] text-white/50">{description}</p>
            </div>
        </div>
        <p className={`flex-none font-display text-lg font-bold tabular-nums ${TONES[tone].text}`}>{value}</p>
    </div>
);

const pingTone = (ping) => (ping.status === 'success' ? 'ok' : ping.status === 'error' ? 'error' : 'pending');
const pingValue = (ping) => (ping.status === 'success' ? `${ping.ms} ms` : ping.status === 'error' ? 'Erreur' : '…');

/** Everything shown here is measured live on this device — nothing is hard-coded. */
export default function DiagnosticsTab({
    loadTime,
    diagnosticsRunning,
    runDiagnostics,
    firestorePing,
    tmdbPing,
    pwaStatus,
    httpsStatus,
    t
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.22 }}
            className="space-y-6"
        >
            <Card>
                <SectionHeader
                    icon={<Icon name="pulse" />}
                    title={t('settings.diagnosticsMonitorsTitle')}
                    subtitle={t('settings.diagnosticsMonitorsDesc')}
                    action={
                        <button
                            type="button"
                            onClick={runDiagnostics}
                            disabled={diagnosticsRunning}
                            className="flex h-9 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-3.5 text-[13px] font-semibold text-white/80 transition-colors hover:bg-white/15 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <Icon name="refresh" className={`h-4 w-4 ${diagnosticsRunning ? 'animate-spin' : ''}`} />
                            <span className="hidden sm:inline">{diagnosticsRunning ? t('settings.diagnosticsRerunning') : t('settings.diagnosticsRerun')}</span>
                        </button>
                    }
                />
                <div className="divide-y divide-white/[0.07]">
                    <Monitor label={t('settings.monFirestore')} description={t('settings.monFirestoreDesc')} value={pingValue(firestorePing)} tone={pingTone(firestorePing)} />
                    <Monitor label={t('settings.monTmdb')} description={t('settings.monTmdbDesc')} value={pingValue(tmdbPing)} tone={pingTone(tmdbPing)} />
                    <Monitor
                        label={t('settings.monPwa')}
                        description={t('settings.monPwaDesc')}
                        value={pwaStatus === 'active' ? 'Actif' : pwaStatus === 'checking' ? '…' : 'Inactif'}
                        tone={pwaStatus === 'active' ? 'ok' : pwaStatus === 'checking' ? 'pending' : 'off'}
                    />
                    <Monitor
                        label="Connexion sécurisée"
                        description={httpsStatus ? 'Les échanges avec le site sont chiffrés (HTTPS).' : 'Le site est servi en HTTP, sans chiffrement.'}
                        value={httpsStatus ? 'HTTPS' : 'HTTP'}
                        tone={httpsStatus ? 'ok' : 'error'}
                    />
                    <Monitor
                        label={t('settings.initTimeTitle')}
                        description={t('settings.initTimeDesc')}
                        value={loadTime > 0 ? `${loadTime} ms` : '—'}
                        tone={loadTime > 0 ? 'ok' : 'off'}
                    />
                </div>
            </Card>
        </motion.div>
    );
}
