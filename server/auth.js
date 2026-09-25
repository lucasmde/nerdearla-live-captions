// Sign in with Google (Google Identity Services ID token) -> signed session cookie.
// Works without configuration too: when GOOGLE_CLIENT_ID is empty, guests are allowed
// and the room keeps the "name + role" entry from v1.
import crypto from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';

const COOKIE = 'lc_session';
const MAX_AGE_S = 60 * 60 * 24 * 30; // 30 days

export function makeAuth(cfg) {
  const secret = cfg.sessionSecret || crypto.randomBytes(32).toString('hex');
  const client = cfg.googleClientId ? new OAuth2Client(cfg.googleClientId) : null;
  const speakerEmails = new Set(cfg.speakerEmails.map((e) => e.toLowerCase()));

  const sign = (payload) => {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const mac = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    return `${body}.${mac}`;
  };
  const verify = (token) => {
    if (!token || !token.includes('.')) return null;
    const [body, mac] = token.split('.');
    const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
    try { const p = JSON.parse(Buffer.from(body, 'base64url').toString()); return p.exp > Date.now() ? p : null; } catch { return null; }
  };
  const parseCookies = (header) => Object.fromEntries((header || '').split(';').map((c) => c.trim().split('=')).filter((kv) => kv[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));

  return {
    enabled: !!client,
    allowGuests: cfg.allowGuests,
    clientId: cfg.googleClientId,

    /** Session from an incoming HTTP/WS request, or null. */
    fromRequest(req) {
      return verify(parseCookies(req.headers.cookie)[COOKIE]);
    },

    /** Verify a Google ID token and return a session payload. */
    async loginWithGoogle(credential) {
      if (!client) throw new Error('Google login not configured');
      const ticket = await client.verifyIdToken({ idToken: credential, audience: cfg.googleClientId });
      const p = ticket.getPayload();
      if (!p?.sub || !p.email_verified) throw new Error('unverified Google account');
      const email = (p.email || '').toLowerCase();
      if (cfg.allowedDomains.length && !cfg.allowedDomains.some((d) => email.endsWith('@' + d))) throw new Error('email domain not allowed');
      const isSpeaker = speakerEmails.size ? speakerEmails.has(email) : false;
      return { sub: p.sub, name: p.name || email.split('@')[0], email, picture: p.picture || '', canSpeak: isSpeaker || speakerEmails.size === 0, exp: Date.now() + MAX_AGE_S * 1000 };
    },

    githubEnabled: !!(cfg.githubClientId && cfg.githubClientSecret),
    githubAuthUrl(redirectUri, state) {
      return `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(cfg.githubClientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=read:user%20user:email&state=${encodeURIComponent(state)}`;
    },
    /** Exchange the OAuth code for a session payload (name, avatar, primary e-mail). */
    async loginWithGithub(code, redirectUri) {
      const tr = await fetch('https://github.com/login/oauth/access_token', { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json' }, body: JSON.stringify({ client_id: cfg.githubClientId, client_secret: cfg.githubClientSecret, code, redirect_uri: redirectUri }) });
      const tok = (await tr.json()).access_token;
      if (!tok) throw new Error('GitHub did not return a token');
      const h = { authorization: `Bearer ${tok}`, accept: 'application/vnd.github+json', 'user-agent': 'live-captions' };
      const u = await (await fetch('https://api.github.com/user', { headers: h })).json();
      let email = (u.email || '').toLowerCase();
      if (!email) { try { const list = await (await fetch('https://api.github.com/user/emails', { headers: h })).json(); email = (list.find((e) => e.primary && e.verified)?.email || '').toLowerCase(); } catch {} }
      if (cfg.allowedDomains.length && !cfg.allowedDomains.some((d) => email.endsWith('@' + d))) throw new Error('email domain not allowed');
      const isSpeaker = speakerEmails.size ? speakerEmails.has(email) : false;
      return { sub: 'gh:' + u.id, name: u.name || u.login, email, picture: u.avatar_url || '', provider: 'github', canSpeak: isSpeaker || speakerEmails.size === 0, exp: Date.now() + MAX_AGE_S * 1000 };
    },

    cookieFor(session, secure) {
      return `${COOKIE}=${encodeURIComponent(sign(session))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_S}${secure ? '; Secure' : ''}`;
    },
    clearCookie() { return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`; },
  };
}
