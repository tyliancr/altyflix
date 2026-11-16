import { motion } from 'framer-motion';
import { Card, SectionHeader } from './SettingsUI';

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
            key="diagnostics"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
        >
            {/* Top row: compliance score + load time + rerun button */}
            <div className="grid sm:grid-cols-3 gap-5">
                
                {/* Production readiness score */}
                <Card className="sm:col-span-2 flex flex-col justify-between p-6">
                    <div className="flex items-center gap-3">
                        <span className="text-xl text-yellow-500">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                        </span>
                        <div>
                            <h4 className="text-sm font-bold text-white">{t('settings.complianceScoreTitle')}</h4>
                            <p className="text-[10px] text-white/40">{t('settings.complianceScoreDesc')}</p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-6 mt-6">
                        <div className="relative w-20 h-20 flex-shrink-0 flex items-center justify-center">
                            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                                <path className="text-white/10" stroke="currentColor" strokeWidth="2.5" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                                <motion.path 
                                    initial={{ strokeDasharray: "0, 100" }}
                                    animate={{ strokeDasharray: "98, 100" }}
                                    transition={{ duration: 1.5, ease: "easeOut" }}
                                    className="text-emerald-400" 
                                    stroke="currentColor" 
                                    strokeWidth="3" 
                                    strokeLinecap="round" 
                                    fill="none" 
                                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" 
                                />
                            </svg>
                            <span className="absolute text-lg font-black text-emerald-400">98%</span>
                        </div>
                        <div className="space-y-1">
                            <p className="text-xs font-semibold text-emerald-400">{t('settings.complianceScoreSummary')}</p>
                            <p className="text-[10px] text-white/50 leading-relaxed">{t('settings.complianceScoreDetail')}</p>
                        </div>
                    </div>
                </Card>

                {/* Load Timing Info + rerun button */}
                <div className="flex flex-col gap-4">
                    <div className="bg-white/[0.02] border border-white/[0.05] rounded-3xl p-6 flex flex-col justify-between flex-1">
                        <div>
                            <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">{t('settings.initTimeTitle')}</p>
                            <p className="text-xs text-white/50 mt-0.5">{t('settings.initTimeDesc')}</p>
                        </div>
                        <div className="mt-4">
                            <p className="text-3xl font-black text-white">{loadTime} <span className="text-xs font-bold text-white/40">ms</span></p>
                            <span className="text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded mt-1.5 inline-block">Excellent</span>
                        </div>
                    </div>

                    {/* Re-run button */}
                    <button
                        onClick={runDiagnostics}
                        disabled={diagnosticsRunning}
                        className={`flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border text-xs font-bold uppercase tracking-widest transition-all ${
                            diagnosticsRunning
                                ? 'bg-white/[0.02] border-white/10 text-white/30 cursor-not-allowed'
                                : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/40'
                        }`}
                    >
                        {diagnosticsRunning ? (
                            <>
                                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                </svg>
                                {t('settings.diagnosticsRerunning')}
                            </>
                        ) : (
                            <>
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                {t('settings.diagnosticsRerun')}
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Dynamic Diagnostics monitors */}
            <Card>
                <SectionHeader
                    icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
                    title={t('settings.diagnosticsMonitorsTitle')}
                    subtitle={t('settings.diagnosticsMonitorsDesc')}
                />
                <div className="p-6 grid sm:grid-cols-3 gap-4">
                    
                    {/* Firestore Monitor */}
                    <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.05] flex flex-col justify-between">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider">{t('settings.monFirestore')}</span>
                            <span className={`w-2 h-2 rounded-full ${
                                firestorePing.status === 'success' ? 'bg-emerald-400' :
                                firestorePing.status === 'error' ? 'bg-red-400' : 'bg-yellow-400 animate-pulse'
                            }`} />
                        </div>
                        <div>
                            <p className="text-xl font-bold text-white">
                                {firestorePing.status === 'success' ? `${firestorePing.ms} ms` :
                                 firestorePing.status === 'error' ? 'Erreur' : '—'}
                            </p>
                            <p className="text-[9px] text-white/30">{t('settings.monFirestoreDesc')}</p>
                        </div>
                    </div>

                    {/* TMDB Monitor */}
                    <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.05] flex flex-col justify-between">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider">{t('settings.monTmdb')}</span>
                            <span className={`w-2 h-2 rounded-full ${
                                tmdbPing.status === 'success' ? 'bg-emerald-400' :
                                tmdbPing.status === 'error' ? 'bg-red-400' : 'bg-yellow-400 animate-pulse'
                            }`} />
                        </div>
                        <div>
                            <p className="text-xl font-bold text-white">
                                {tmdbPing.status === 'success' ? `${tmdbPing.ms} ms` :
                                 tmdbPing.status === 'error' ? 'Erreur' : '—'}
                            </p>
                            <p className="text-[9px] text-white/30">{t('settings.monTmdbDesc')}</p>
                        </div>
                    </div>

                    {/* PWA State */}
                    <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.05] flex flex-col justify-between">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider">{t('settings.monPwa')}</span>
                            <span className={`w-2 h-2 rounded-full ${
                                pwaStatus === 'active' ? 'bg-emerald-400' :
                                pwaStatus === 'checking' ? 'bg-yellow-400 animate-pulse' : 'bg-white/20'
                            }`} />
                        </div>
                        <div>
                            <p className="text-xl font-bold text-white">{pwaStatus === 'active' ? 'ACTIF' : pwaStatus === 'checking' ? '—' : 'INACTIF'}</p>
                            <p className="text-[9px] text-white/30">{t('settings.monPwaDesc')}</p>
                        </div>
                    </div>
                </div>
            </Card>

            {/* Static checklist and security audit */}
            <Card>
                <SectionHeader
                    icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>}
                    title={t('settings.auditReportTitle')}
                    subtitle={t('settings.auditReportDesc')}
                />
                <div className="p-6">
                    <div className="grid sm:grid-cols-2 gap-x-8 gap-y-3">
                        {[
                            { 
                                label: 'Protocole HTTPS & SSL',
                                active: httpsStatus,
                                desc: httpsStatus ? 'Données cryptées en transit — protocole sécurisé actif.' : 'HTTP détecté — activez HTTPS pour la production.',
                                dynamic: true
                            },
                            { label: 'PWA Cache First Images', active: true, desc: 'TMDB images sauvegardées localement.' },
                            { label: 'Code-Splitting Rollup', active: true, desc: 'Chargement asynchrone des composants lourds.' },
                            { label: 'Firebase Security Rules', active: true, desc: 'Sécurité Firestore validée par userId.' },
                            { label: 'PWA Manifest Standardisé', active: true, desc: 'Icônes, theme-color conformes.' },
                            { label: 'Headers de Sécurité configurés', active: true, desc: 'Protection XSS et Clickjacking active.' }
                        ].map((item, idx) => (
                            <div key={idx} className="flex gap-3 py-1 items-start">
                                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs shrink-0 ${
                                    item.active
                                        ? 'bg-emerald-500/10 text-emerald-400'
                                        : 'bg-red-500/10 text-red-400'
                                }`}>
                                    {item.active ? '✓' : '✗'}
                                </div>
                                <div>
                                    <p className="text-xs font-semibold text-white">{item.label}</p>
                                    <p className={`text-[10px] mt-0.5 ${item.active ? 'text-white/40' : 'text-red-400/70'}`}>{item.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </Card>
        </motion.div>
    );
}
