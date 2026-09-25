import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Load .env from the project root (no dependency needed). Existing env vars win.
try {
  const envFile = path.join(ROOT, '.env');
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!m || line.trim().startsWith('#')) continue;
      const val = m[2].replace(/^(['"])(.*)\1$/, '$2');
      if (process.env[m[1]] === undefined) process.env[m[1]] = val;
    }
  }
} catch { /* ignore */ }

function loadSessionsFile() {
  const candidates = [
    process.env.SESSIONS_FILE,
    path.join(ROOT, 'sessions.json'),
    path.join(ROOT, 'sessions.example.json'),
  ].filter(Boolean);
  for (const f of candidates) {
    if (fs.existsSync(f)) {
      return { file: f, data: JSON.parse(fs.readFileSync(f, 'utf8')) };
    }
  }
  return { file: null, data: { sessions: [] } };
}

const { file, data } = loadSessionsFile();

export const config = {
  root: ROOT,
  port: Number(process.env.PORT || 8080),
  engine: process.env.ENGINE || (process.env.GEMINI_API_KEY ? 'gemini' : 'mock'),
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  // Live transcription model (streaming speech-to-text).
  transcribeModel: process.env.TRANSCRIBE_MODEL || 'gemini-3.5-transcribe-live',
  // Text model used to translate finalized segments.
  translateModel: process.env.TRANSLATE_MODEL || 'gemini-3.5-flash-lite',
  // Tried in order when the primary model is rate limited (each model has its own free-tier bucket).
  translateFallbackModels: (process.env.TRANSLATE_FALLBACK_MODELS || 'gemini-3.1-flash-lite,gemini-2.5-flash-lite,gemini-flash-lite-latest').split(',').map((s) => s.trim()).filter(Boolean),
  translator: process.env.TRANSLATOR || 'gemini', // gemini | ollama | none
  ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
  ollamaModel: process.env.OLLAMA_MODEL || 'gemma3:4b',
  // Shared secret for ingest/operator endpoints. Empty = open (dev only).
  ingestToken: process.env.INGEST_TOKEN || '',
  // Reconnect the live session proactively before the provider's limit.
  sessionRotateMs: Number(process.env.SESSION_ROTATE_MS || 8.5 * 60 * 1000),
  // Translate long partial hypotheses too (adds cost, lowers perceived latency).
  translatePartials: process.env.TRANSLATE_PARTIALS !== '0',
  partialTranslateEveryMs: Number(process.env.PARTIAL_TRANSLATE_EVERY_MS || 2500),
  transcriptsDir: process.env.TRANSCRIPTS_DIR || path.join(ROOT, 'transcripts'),
  // --- v2: identity ---
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',           // Sign in with Google (Google Identity Services)
  sessionSecret: process.env.SESSION_SECRET || '',              // HMAC secret for the session cookie (random per start if empty)
  allowGuests: process.env.ALLOW_GUESTS !== '0',               // let people in with just a name (no account)
  speakerEmails: (process.env.SPEAKER_EMAILS || '').split(',').map((s) => s.trim()).filter(Boolean), // who may transmit; empty = anyone signed in
  allowedDomains: (process.env.ALLOWED_DOMAINS || '').split(',').map((s) => s.trim()).filter(Boolean), // restrict sign-in to these email domains
  publicUrl: process.env.PUBLIC_URL || '',
  githubClientId: process.env.GITHUB_CLIENT_ID || '',           // "Sign in with GitHub" (OAuth App)
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET || '',
  smtpUrl: process.env.SMTP_URL || '',
  resendApiKey: process.env.RESEND_API_KEY || '',
  mailFrom: process.env.MAIL_FROM || '',                     // e.g. https://captions.example.org (used for links in mails)
  sessionsFile: file,
  sessions: (data.sessions || []).map((s) => ({
    id: s.id,
    name: s.name || s.id,
    room: s.room || '',
    sourceLang: s.sourceLang || 'auto', // 'auto' | BCP-47 (e.g. 'en', 'es')
    targetLangs: s.targetLangs || ['es', 'en'],
    vocabulary: [...(s.vocabulary || []), ...(s.agenda || []).flatMap((t) => (t.speaker || '').split(',').map((x) => x.trim()).filter(Boolean))],
    color: s.color || '',
    agenda: (s.agenda || []).map((t) => ({ day: t.day || '', start: t.start, end: t.end, title: t.title, speaker: t.speaker || '', lang: t.lang || '' })),
  })),
  globalVocabulary: data.vocabulary || [],
  event: data.event || '',
  timezone: data.timezone || process.env.TZ || 'America/Argentina/Buenos_Aires',
};

export function langLabel(code) {
  const map = {
    en: 'English', es: 'Español', pt: 'Português', fr: 'Français', de: 'Deutsch',
    it: 'Italiano', ja: '日本語', zh: '中文', ko: '한국어', hi: 'हिन्दी', ar: 'العربية',
  };
  return map[code] || code;
}
