// Segment translation with a small rolling context so terminology stays consistent.
// Providers: gemini (generateContent), ollama (local Gemma), none.
import { GoogleGenAI } from '@google/genai';
import { langLabel } from '../config.js';

const SYSTEM = (target) => `You are a live subtitle translator at a tech conference.
Translate the LAST line of the transcript into ${langLabel(target)} (${target}).
Rules: output ONLY the translation of the last line, nothing else. Keep it short and natural, as a subtitle.
Keep product names, code identifiers, acronyms and proper nouns unchanged. Preserve numbers.
Previous lines are context only; do not translate them again.
If the last line is already in ${langLabel(target)}, return it unchanged.`;

export function makeTranslator(cfg, log) {
  if (cfg.translator === 'none') return { translate: async (t) => t };
  if (cfg.translator === 'ollama') return ollamaTranslator(cfg, log);
  return geminiTranslator(cfg, log);
}

function geminiTranslator(cfg, log) {
  const ai = new GoogleGenAI({ apiKey: cfg.geminiApiKey });
  return {
    async translate(text, target, context = []) {
      const prompt = [...context.slice(-4), text].map((l, i, a) => (i === a.length - 1 ? `LAST: ${l}` : `- ${l}`)).join('\n');
      const res = await ai.models.generateContent({
        model: cfg.translateModel,
        contents: prompt,
        config: { systemInstruction: SYSTEM(target), temperature: 0.2, maxOutputTokens: 400, thinkingConfig: { thinkingBudget: 0 } },
      });
      return clean(res.text);
    },
  };
}

function ollamaTranslator(cfg, log) {
  return {
    async translate(text, target, context = []) {
      const prompt = [...context.slice(-4), text].map((l, i, a) => (i === a.length - 1 ? `LAST: ${l}` : `- ${l}`)).join('\n');
      const r = await fetch(`${cfg.ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: cfg.ollamaModel,
          stream: false,
          options: { temperature: 0.2 },
          messages: [{ role: 'system', content: SYSTEM(target) }, { role: 'user', content: prompt }],
        }),
      });
      if (!r.ok) throw new Error(`ollama ${r.status}`);
      const j = await r.json();
      return clean(j.message?.content || '');
    },
  };
}

function clean(s) {
  return (s || '').trim().replace(/^LAST:\s*/i, '').replace(/^["“”']+|["“”']+$/g, '').trim();
}
