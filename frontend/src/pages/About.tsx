import { useTranslation } from 'react-i18next';

export default function About() {
  const { t } = useTranslation();

  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto animate-fade-in">
      <div className="bg-app-surface rounded-xl border border-app-border shadow-app-card p-8 lg:p-10 text-center">
        {/* Logo */}
        <img
          src="/neocraft-logo.png"
          alt="NeoCraft"
          className="w-24 h-24 mx-auto mb-6 rounded-xl object-contain"
        />

        {/* App name & version */}
        <h1 className="text-2xl font-bold text-app-text tracking-tight">
          NeoCraft
        </h1>
        <p className="text-sm text-app-text-secondary mt-2">
          {t('about.tagline')}
        </p>

        {/* Divider */}
        <div className="my-8 border-t border-app-border" />

        {/* Author */}
        <div className="space-y-4 text-sm text-app-text-secondary">
          <div>
            <span className="text-app-text-muted">{t('about.author')}</span>
            <span className="ml-2 text-app-text font-semibold">SoraStr@Marshmallow</span>
          </div>

          {/* License */}
          <div>
            <span className="text-app-text-muted">{t('about.license')}</span>
            <span className="ml-2 text-app-text font-mono text-xs bg-app-input px-2 py-0.5 rounded border border-app-border">
              MIT
            </span>
          </div>

          {/* Repository */}
          <div>
            <a
              href="https://github.com/SoraStr/NeoCraft"
              target="_blank"
              rel="noopener noreferrer"
              className="text-app-accent hover:text-app-accent-hover transition-colors font-medium"
            >
              {t('about.viewSource')}
            </a>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-app-border">
          <p className="text-xs text-app-text-muted">
            {t('about.footer')}
          </p>
        </div>
      </div>
    </div>
  );
}
