import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

const SECTION_SIGN = String.fromCharCode(0xa7);
const GENERATED_SECTION_CODE = '\\u00A7';

type MotdGeneratorDialogProps = {
  open: boolean;
  initialValue: string;
  onApply: (value: string) => void;
  onClose: () => void;
};

type MotdColor = {
  code: string;
  name: string;
  hex: string;
};

type MotdFormat = {
  code: string;
  key: string;
  label: string;
  className?: string;
};

type PreviewState = {
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  obfuscated: boolean;
};

type PreviewSegment = PreviewState & {
  text: string;
};

const DEFAULT_COLOR = '#AAAAAA';

const COLORS: MotdColor[] = [
  { code: '0', name: 'Black', hex: '#000000' },
  { code: '1', name: 'Dark Blue', hex: '#0000AA' },
  { code: '2', name: 'Dark Green', hex: '#00AA00' },
  { code: '3', name: 'Dark Aqua', hex: '#00AAAA' },
  { code: '4', name: 'Dark Red', hex: '#AA0000' },
  { code: '5', name: 'Dark Purple', hex: '#AA00AA' },
  { code: '6', name: 'Gold', hex: '#FFAA00' },
  { code: '7', name: 'Gray', hex: '#AAAAAA' },
  { code: '8', name: 'Dark Gray', hex: '#555555' },
  { code: '9', name: 'Blue', hex: '#5555FF' },
  { code: 'a', name: 'Green', hex: '#55FF55' },
  { code: 'b', name: 'Aqua', hex: '#55FFFF' },
  { code: 'c', name: 'Red', hex: '#FF5555' },
  { code: 'd', name: 'Light Purple', hex: '#FF55FF' },
  { code: 'e', name: 'Yellow', hex: '#FFFF55' },
  { code: 'f', name: 'White', hex: '#FFFFFF' },
];

const FORMATS: MotdFormat[] = [
  { code: 'l', key: 'bold', label: 'B', className: 'font-bold' },
  { code: 'm', key: 'strike', label: 'S', className: 'line-through' },
  { code: 'n', key: 'underline', label: 'U', className: 'underline' },
  { code: 'o', key: 'italic', label: 'I', className: 'italic' },
  { code: 'k', key: 'obfuscated', label: 'K' },
  { code: 'r', key: 'reset', label: 'R' },
];

const VALID_CODES = new Set('0123456789abcdefklmnor'.split(''));
const COLOR_MAP = new Map(COLORS.map((color) => [color.code, color.hex]));
const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function defaultPreviewState(): PreviewState {
  return {
    color: DEFAULT_COLOR,
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    obfuscated: false,
  };
}

function decodeMotdValue(value: string): string {
  return value
    .replace(/\\u00a7/gi, SECTION_SIGN)
    .split(SECTION_SIGN)
    .join('&')
    .replace(/\\n/g, '\n');
}

function limitToTwoLines(value: string): string {
  const normalized = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  return lines.slice(0, 2).join('\n');
}

function normalizeEditorValue(value: string): string {
  return limitToTwoLines(decodeMotdValue(value));
}

function encodeMotdValue(value: string): string {
  return normalizeEditorValue(value)
    .replace(/&([0-9a-fk-or])/gi, (_, code: string) => `${GENERATED_SECTION_CODE}${code.toLowerCase()}`)
    .replace(/\n/g, '\\n');
}

function visibleMotdText(value: string): string {
  return normalizeEditorValue(value).replace(/&[0-9a-fk-or]/gi, '');
}

function textDecorations(segment: PreviewSegment): string | undefined {
  const decorations: string[] = [];
  if (segment.underline) decorations.push('underline');
  if (segment.strike) decorations.push('line-through');
  return decorations.length ? decorations.join(' ') : undefined;
}

function obfuscate(text: string, offset: number): string {
  return text
    .split('')
    .map((char, index) => {
      if (char.trim() === '') return char;
      return SCRAMBLE_CHARS[(char.charCodeAt(0) + offset + index) % SCRAMBLE_CHARS.length];
    })
    .join('');
}

function parsePreviewLine(line: string): PreviewSegment[] {
  const segments: PreviewSegment[] = [];
  let state = defaultPreviewState();
  let buffer = '';

  const flush = () => {
    if (!buffer) return;
    segments.push({ ...state, text: buffer });
    buffer = '';
  };

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1]?.toLowerCase();
    if ((char === '&' || char === SECTION_SIGN) && next && VALID_CODES.has(next)) {
      flush();
      i += 1;
      const color = COLOR_MAP.get(next);
      if (color) {
        state = { ...defaultPreviewState(), color };
      } else if (next === 'r') {
        state = defaultPreviewState();
      } else if (next === 'l') {
        state = { ...state, bold: true };
      } else if (next === 'm') {
        state = { ...state, strike: true };
      } else if (next === 'n') {
        state = { ...state, underline: true };
      } else if (next === 'o') {
        state = { ...state, italic: true };
      } else if (next === 'k') {
        state = { ...state, obfuscated: true };
      }
      continue;
    }

    buffer += char;
  }

  flush();
  return segments;
}

function parsePreview(value: string): PreviewSegment[][] {
  return normalizeEditorValue(value)
    .split('\n')
    .map((line) => parsePreviewLine(line));
}

function IconClose({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconCopy({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="6" y="6" width="7" height="7" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3 10V4.5A1.5 1.5 0 014.5 3H10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function IconWand({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M10.5 2.5l3 3-7.8 7.8a1 1 0 01-1.4 0l-1.6-1.6a1 1 0 010-1.4l7.8-7.8z" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8.9 4.1l3 3M3 3.2V1.8M3 6.2V4.8M1.8 4h-1M5.2 4h-1M13 11v-1.2M13 14v-1.2M11.8 12h-1M15.2 12h-1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function MotdGeneratorDialog({ open, initialValue, onApply, onClose }: MotdGeneratorDialogProps) {
  if (!open) return null;

  return (
    <MotdGeneratorDialogInner
      key={initialValue}
      initialValue={initialValue}
      onApply={onApply}
      onClose={onClose}
    />
  );
}

function MotdGeneratorDialogInner({
  initialValue,
  onApply,
  onClose,
}: Omit<MotdGeneratorDialogProps, 'open'>) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(() => normalizeEditorValue(initialValue));
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const previewLines = useMemo(() => parsePreview(draft), [draft]);
  const generatedValue = useMemo(() => encodeMotdValue(draft), [draft]);
  const generatedLine = `motd=${generatedValue}`;
  const plainLength = visibleMotdText(draft).length;

  const insertCode = (code: string) => {
    const marker = `&${code}`;
    const textarea = textareaRef.current;
    const selectionStart = textarea?.selectionStart ?? draft.length;
    const selectionEnd = textarea?.selectionEnd ?? draft.length;
    const nextDraft = limitToTwoLines(`${draft.slice(0, selectionStart)}${marker}${draft.slice(selectionEnd)}`);
    setDraft(nextDraft);

    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      const position = selectionStart + marker.length;
      textareaRef.current?.setSelectionRange(position, position);
    });
  };

  const handleDraftChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setDraft(limitToTwoLines(event.target.value));
    setCopied(false);
  };

  const handleExample = () => {
    setDraft('&a&lNeoCraft &fServer\n&7Survival &8| &eFriends welcome');
    setCopied(false);
  };

  const handleReset = () => {
    setDraft('');
    setCopied(false);
  };

  const handleCopy = async () => {
    if (!navigator.clipboard) return;
    await navigator.clipboard.writeText(generatedLine);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const handleApply = () => {
    onApply(generatedValue);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 animate-fade-in" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="motd-generator-title"
        className="relative w-full max-w-5xl max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl bg-app-surface border border-app-border shadow-xl animate-slide-up"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-app-border">
          <div className="flex items-center gap-3 min-w-0">
            <span className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-app-accent-border bg-app-accent-bg text-app-accent">
              <IconWand className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h2 id="motd-generator-title" className="text-base font-bold text-app-text truncate">
                {t('config.motdGenerator.title')}
              </h2>
              <p className="text-xs text-app-text-muted">
                {t('config.motdGenerator.subtitle', { count: plainLength })}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-app-text-muted hover:bg-app-border-light hover:text-app-text-secondary transition-colors"
            title={t('config.motdGenerator.close')}
            aria-label={t('config.motdGenerator.close')}
          >
            <IconClose className="w-4 h-4" />
          </button>
        </div>

        <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
          <section className="space-y-4 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-app-text">{t('config.motdGenerator.inputLabel')}</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExample}
                  className="px-3 py-1.5 rounded-lg border border-app-border bg-app-input text-xs font-semibold text-app-text-secondary hover:bg-app-border-light hover:text-app-text transition-colors"
                >
                  {t('config.motdGenerator.example')}
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-app-text-muted hover:bg-app-border-light hover:text-app-text-secondary transition-colors"
                >
                  {t('config.motdGenerator.reset')}
                </button>
              </div>
            </div>

            <textarea
              ref={textareaRef}
              value={draft}
              onChange={handleDraftChange}
              rows={5}
              spellCheck={false}
              className="w-full resize-none rounded-xl border border-app-border bg-app-input px-3 py-3 font-mono text-sm text-app-text outline-none focus:border-app-accent focus:bg-app-input-focus"
              placeholder="&aNeoCraft Server&#10;&7Survival | &eWelcome"
              autoFocus
            />

            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-app-text-muted">
                {t('config.motdGenerator.colors')}
              </h4>
              <div className="grid grid-cols-8 gap-2 sm:flex sm:flex-wrap">
                {COLORS.map((color) => (
                  <button
                    key={color.code}
                    type="button"
                    onClick={() => insertCode(color.code)}
                    className="h-8 w-8 rounded-lg border border-app-border shadow-sm transition-transform hover:scale-105 focus-visible:scale-105"
                    style={{ backgroundColor: color.hex }}
                    title={`${color.name} (&${color.code})`}
                    aria-label={`${color.name} (&${color.code})`}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-app-text-muted">
                {t('config.motdGenerator.formats')}
              </h4>
              <div className="flex flex-wrap gap-2">
                {FORMATS.map((format) => (
                  <button
                    key={format.code}
                    type="button"
                    onClick={() => insertCode(format.code)}
                    className={`inline-flex h-8 min-w-8 items-center justify-center rounded-lg border border-app-border bg-app-input px-2.5 font-mono text-xs text-app-text-secondary hover:bg-app-border-light hover:text-app-text transition-colors ${format.className ?? ''}`}
                    title={`${t(`config.motdGenerator.formatNames.${format.key}`)} (&${format.code})`}
                    aria-label={`${t(`config.motdGenerator.formatNames.${format.key}`)} (&${format.code})`}
                  >
                    {format.label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="space-y-4 min-w-0">
            <div>
              <h3 className="text-sm font-bold text-app-text mb-3">{t('config.motdGenerator.previewLabel')}</h3>
              <div className="rounded-xl bg-[#1e1e1e] p-3 font-mono shadow-inner">
                <div className="flex min-h-[92px] items-center">
                  <div className="mr-3 flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-md border-2 border-[#151515] bg-[#646464] text-[10px] text-zinc-400">
                    ICON
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-bold text-white">Minecraft Server</span>
                      <span className="flex-shrink-0 text-xs text-[#777777]">10/20</span>
                    </div>
                    <div className="min-h-[44px] whitespace-pre-wrap break-words text-base leading-tight">
                      {previewLines.map((line, lineIndex) => (
                        <div key={`line-${lineIndex}`} className="min-h-[20px]">
                          {line.length === 0 ? (
                            <span>&nbsp;</span>
                          ) : (
                            line.map((segment, segmentIndex) => {
                              const style: CSSProperties = {
                                color: segment.color,
                                fontWeight: segment.bold ? 700 : 400,
                                fontStyle: segment.italic ? 'italic' : 'normal',
                                textDecoration: textDecorations(segment),
                              };
                              const text = segment.obfuscated ? obfuscate(segment.text, lineIndex + segmentIndex) : segment.text;
                              return (
                                <span key={`${lineIndex}-${segmentIndex}`} style={style}>
                                  {text}
                                </span>
                              );
                            })
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-app-text">{t('config.motdGenerator.outputLabel')}</h3>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-app-border bg-app-input px-2.5 py-1.5 text-xs font-semibold text-app-text-secondary hover:bg-app-border-light hover:text-app-text transition-colors"
                >
                  <IconCopy className="w-3.5 h-3.5" />
                  {copied ? t('config.motdGenerator.copied') : t('config.motdGenerator.copy')}
                </button>
              </div>
              <code className="block min-h-16 break-all rounded-xl bg-app-console-bg border border-app-border px-3 py-3 font-mono text-xs leading-relaxed text-app-text-secondary">
                {generatedLine}
              </code>
            </div>
          </section>
        </div>

        <div className="flex flex-wrap justify-end gap-3 px-5 py-4 border-t border-app-border bg-app-bg/60">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-app-border bg-app-input text-sm font-semibold text-app-text-secondary hover:bg-app-border-light hover:text-app-text transition-colors"
          >
            {t('config.cancel')}
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="inline-flex items-center gap-2 rounded-lg bg-app-accent px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-app-accent-hover transition-colors"
          >
            <IconWand className="w-4 h-4" />
            {t('config.motdGenerator.apply')}
          </button>
        </div>
      </div>
    </div>
  );
}
