import crypto from 'node:crypto';
import { z } from 'zod';
import { config } from './config.js';
import { db } from './db.js';

const tokenSchema = z.object({
  access_token: z.string(),
  token_type: z.string().default('bearer'),
  expires_in: z.number().positive(),
  scope: z.string().optional(),
  user_id: z.number().optional(),
  refresh_token: z.string().optional(),
});

type StoredToken = z.infer<typeof tokenSchema> & { expires_at: number };
const tokenKey = 'mercadoLivreOAuthTokens';
const stateKey = 'mercadoLivreOAuthState';

function encryptionKey() {
  return crypto.createHash('sha256').update(process.env.ENCRYPTION_KEY || config.SESSION_SECRET).digest();
}

function encrypt(value: unknown) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

function decrypt<T>(value: string): T {
  const [iv, tag, encrypted] = value.split('.');
  if (!iv || !tag || !encrypted) throw new Error('Credencial criptografada inválida.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8')) as T;
}

function requireOAuthConfig() {
  if (!config.MERCADO_LIVRE_CLIENT_ID || !config.MERCADO_LIVRE_CLIENT_SECRET || !config.MERCADO_LIVRE_REDIRECT_URI) {
    throw new Error('Preencha CLIENT_ID, CLIENT_SECRET e REDIRECT_URI do Mercado Livre no arquivo .env.');
  }
  return { clientId: config.MERCADO_LIVRE_CLIENT_ID, clientSecret: config.MERCADO_LIVRE_CLIENT_SECRET, redirectUri: config.MERCADO_LIVRE_REDIRECT_URI };
}

async function exchange(body: URLSearchParams) {
  const response = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Não foi possível concluir a autorização do Mercado Livre (${response.status}).`);
  const token = tokenSchema.parse(await response.json());
  const stored: StoredToken = { ...token, expires_at: Date.now() + token.expires_in * 1000 };
  await db.setting.upsert({ where: { key: tokenKey }, update: { value: encrypt(stored) }, create: { key: tokenKey, value: encrypt(stored) } });
  return stored;
}

export async function createAuthorizationUrl() {
  const { clientId, redirectUri } = requireOAuthConfig();
  const state = crypto.randomBytes(32).toString('base64url');
  const stateHash = crypto.createHash('sha256').update(state).digest('hex');
  await db.setting.upsert({ where: { key: stateKey }, update: { value: JSON.stringify({ stateHash, expiresAt: Date.now() + 10 * 60_000 }) }, create: { key: stateKey, value: JSON.stringify({ stateHash, expiresAt: Date.now() + 10 * 60_000 }) } });
  const params = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirectUri, state });
  return `https://auth.mercadolivre.com.br/authorization?${params}`;
}

export async function completeAuthorization(code: string, state: string) {
  const saved = await db.setting.findUnique({ where: { key: stateKey } });
  if (!saved) throw new Error('Autorização não iniciada ou expirada.');
  const expected = z.object({ stateHash: z.string(), expiresAt: z.number() }).parse(JSON.parse(saved.value));
  const actualHash = crypto.createHash('sha256').update(state).digest('hex');
  if (expected.expiresAt < Date.now() || actualHash.length !== expected.stateHash.length || !crypto.timingSafeEqual(Buffer.from(actualHash), Buffer.from(expected.stateHash))) throw new Error('Estado da autorização inválido ou expirado.');
  await db.setting.delete({ where: { key: stateKey } });
  const { clientId, clientSecret, redirectUri } = requireOAuthConfig();
  return exchange(new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri }));
}

export async function getMercadoLivreAccessToken() {
  if (config.MERCADO_LIVRE_ACCESS_TOKEN) return config.MERCADO_LIVRE_ACCESS_TOKEN;
  const saved = await db.setting.findUnique({ where: { key: tokenKey } });
  if (!saved) throw new Error('Mercado Livre não conectado. Use o botão Conectar Mercado Livre.');
  const token = decrypt<StoredToken>(saved.value);
  if (token.expires_at > Date.now() + 60_000) return token.access_token;
  if (!token.refresh_token) throw new Error('A conexão expirou e não possui refresh token. Conecte novamente.');
  const { clientId, clientSecret } = requireOAuthConfig();
  const renewed = await exchange(new URLSearchParams({ grant_type: 'refresh_token', client_id: clientId, client_secret: clientSecret, refresh_token: token.refresh_token }));
  return renewed.access_token;
}

export async function connectionStatus() {
  const configured = Boolean(config.MERCADO_LIVRE_CLIENT_ID && config.MERCADO_LIVRE_CLIENT_SECRET && config.MERCADO_LIVRE_REDIRECT_URI);
  const saved = config.MERCADO_LIVRE_ACCESS_TOKEN ? true : Boolean(await db.setting.findUnique({ where: { key: tokenKey }, select: { key: true } }));
  return { configured, connected: saved };
}

const trendSchema = z.object({
  keyword: z.string().trim().min(1),
  url: z.string().url(),
});

let trendsCache: { expiresAt: number; items: Array<{ position: number; keyword: string; url: string }> } | null = null;

/** Termos agregados mais procurados no Mercado Livre Brasil. */
export async function getMercadoLivreTrends() {
  if (trendsCache && trendsCache.expiresAt > Date.now()) return trendsCache.items;
  const accessToken = await getMercadoLivreAccessToken();
  const response = await fetch('https://api.mercadolibre.com/trends/MLB', {
    headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Não foi possível consultar as tendências do Mercado Livre (${response.status}).`);
  const payload = await response.json();
  const source = Array.isArray(payload) ? payload : Array.isArray(payload?.results) ? payload.results : [];
  const items = z.array(trendSchema).parse(source).slice(0, 50).map((item, index) => ({
    position: index + 1,
    keyword: item.keyword,
    url: item.url,
  }));
  trendsCache = { expiresAt: Date.now() + 6 * 60 * 60_000, items };
  return items;
}
