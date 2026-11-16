import { motion } from 'framer-motion';
import { Card, SectionHeader, Field, SubmitBtn } from './SettingsUI';

export default function AccountTab({
    handleEmailChange,
    emailForm,
    setEmailForm,
    handlePasswordChange,
    passwordForm,
    setPasswordForm,
    handleDeleteAccount,
    loading,
    t
}) {
    return (
        <motion.div
            key="account"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
        >
            {/* Change Email */}
            <Card>
                <SectionHeader
                    icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>}
                    title={t('settings.changeEmailTitle')}
                    subtitle="Un lien de validation sera transmis à la nouvelle adresse e-mail saisie."
                />
                <form onSubmit={handleEmailChange} className="p-6 space-y-4">
                    <Field
                        label="Nouvelle adresse e-mail"
                        type="email"
                        value={emailForm.newEmail}
                        onChange={e => setEmailForm({ ...emailForm, newEmail: e.target.value })}
                        required
                        autoComplete="email"
                    />
                    <Field
                        label="Mot de passe actuel"
                        type="password"
                        value={emailForm.password}
                        onChange={e => setEmailForm({ ...emailForm, password: e.target.value })}
                        required
                        autoComplete="current-password"
                    />
                    <SubmitBtn loading={loading} label={t('settings.changeEmailBtn')} />
                </form>
            </Card>

            {/* Change Password */}
            <Card>
                <SectionHeader
                    icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>}
                    title={t('settings.changePasswordTitle')}
                    subtitle="Définissez un mot de passe robuste de 6 caractères au minimum."
                />
                <form onSubmit={handlePasswordChange} className="p-6 space-y-4">
                    <Field
                        label="Mot de passe actuel"
                        type="password"
                        value={passwordForm.currentPassword}
                        onChange={e => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                        required
                        autoComplete="current-password"
                    />
                    <div className="grid sm:grid-cols-2 gap-4">
                        <Field
                            label={t('settings.newPassword')}
                            type="password"
                            value={passwordForm.newPassword}
                            onChange={e => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                            required
                            autoComplete="new-password"
                        />
                        <Field
                            label={t('settings.repeatPassword')}
                            type="password"
                            value={passwordForm.confirmPassword}
                            onChange={e => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                            required
                            autoComplete="new-password"
                        />
                    </div>
                    <SubmitBtn loading={loading} label={t('settings.changePasswordBtn')} />
                </form>
            </Card>

            {/* Danger Zone */}
            <Card className="border-red-500/20 bg-red-500/[0.02]">
                <div className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
                    <div>
                        <div className="flex items-center gap-2 mb-1.5">
                            <svg className="w-4 h-4 text-red-500 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <h3 className="font-bold text-red-500 text-xs uppercase tracking-widest">{t('settings.dangerZoneTitle')}</h3>
                        </div>
                        <p className="text-white/40 text-[11px] sm:text-xs leading-relaxed max-w-md">
                            {t('settings.dangerZoneDesc')}
                        </p>
                    </div>
                    <button
                        onClick={handleDeleteAccount}
                        className="px-5 py-2.5 bg-red-600/10 text-red-500 border border-red-500/30 hover:bg-red-600 hover:text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all"
                    >
                        {t('settings.deleteAccountBtn')}
                    </button>
                </div>
            </Card>
        </motion.div>
    );
}
