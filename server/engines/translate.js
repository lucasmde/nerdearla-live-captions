// Segment translation with a small rolling context so terminology stays consistent.
// One call translates a segment into ALL target languages (JSON out) to keep request
// counts low. Providers: gemini (generateContent), ollama (local Gemma), none.
// Gemini: rotates across fallback models on 429 (each model has its own quota bucket).
import { GoogleGenAI } from '@google/genai';
import { langLabel } from '../config.js';

const SYSTEM = (targets) => `You are a live subtitle translator at a tech conference.
Translate the LAST line of the transcript into these languages: ${targets.map((t) => `${t} (${langLabel(t)})`).join(', ')}.
Rules: answer ONLY with a JSON object whose keys are exactly ${JSON.stringify(targets)} and whose values are the translations of the LAST line. No markdown, no extra keys.
Keep it short and natural, as a subtitle. Keep product names, code identifiers, acronyms and proper nouns unchanged. Preserve numbers.
Previous lines are context only; do not translate them. If the last line is already in a target language, return it unchanged for that key.`;

const buildPrompt = (text, context) => [...context.slice(-4), text].map((l, i, a) => (i === a.length - 1 ? `LAST: ${l}` : `- ${l}`)).join('\n');

export function makeTranslator(cfg, log) {
  if (cfg.translator === 'none') return { translateMany: async (t, targets) => Object.fromEntries(targets.map((l) => [l, t])) };
  if (cfg.translator === 'ollama') return ollamaTranslator(cfg, log);
  return geminiTranslator(cfg, log);
}

function geminiTranslator(cfg, log) {
  const ai = new GoogleGenAI({ apiKey: cfg.geminiApiKey });
  const models = [cfg.translateModel, ...cfg.translateFallbackModels.filter((m) => m !== cfg.translateModel)];
  const cooldown = new Map(); // model -> timestamp until which it is rate limited
  return {
    async translateMany(text, targets, context = []) {
      const prompt = buildPrompt(text, context);
      let lastErr;
      for (let attempt = 0; attempt < models.length + 1; attempt++) {
        const model = models.find((m) => (cooldown.get(m) || 0) < Date.now()) || models[0];
        try {
          const res = await ai.models.generateContent({
            model,
            contents: prompt,
            config: { systemInstruction: SYSTEM(targets), temperature: 0.2, maxOutputTokens: 600, responseMimeType: 'application/json', thinkingConfig: { thinkingLevel: 'minimal' } },
          });
          return parse(res.text, targets, text);
        } catch (e) {
          lastErr = e;
          const msg = String(e?.message || e);
          if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
            const m = msg.match(/retry in ([\d.]+)s/i);
            const wait = m ? Math.min(60000, Number(m[1]) * 1000) : 30000;
            cooldown.set(model, Date.now() + wait);
            log?.('translate', `${model} rate limited, cooling down ${Math.round(wait / 1000)}s`);
            continue;
          }
          if (msg.includes('400')) { log?.('translate', `${model} rejected request: ${msg.slice(0, 120)}`); continue; }
          throw e;
        }
      }
      throw lastErr;
    },
  };
}

function ollamaTranslator(cfg) {
  return {
    async translateMany(text, targets, context = []) {
      const r = await fetch(`${cfg.ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: cfg.ollamaModel, stream: false, format: 'json', options: { temperature: 0.2 },
          messages: [{ role: 'system', content: SYSTEM(targets) }, { role: 'user', content: buildPrompt(text, context) }],
        }),
      });
      if (!r.ok) throw new Error(`ollama ${r.status}`);
      const j = await r.json();
      return parse(j.message?.content || '', targets, text);
    },
  };
}

function parse(raw, targets, original) {
  let obj = {};
  try { obj = JSON.parse((raw || '').replace(/^```(json)?|```$/g, '').trim()); } catch { /* fall through */ }
  const out = {};
  for (const t of targets) {
    const v = typeof obj[t] === 'string' ? obj[t].trim() : '';
    out[t] = v || (targets.length === 1 && raw && !raw.trim().startsWith('{') ? clean(raw) : original);
  }
  return out;
}

function clean(s) {
  return (s || '').trim().replace(/^LAST:\s*/i, '').replace(/^["“”']+|["“”']+$/g, '').trim();
}
