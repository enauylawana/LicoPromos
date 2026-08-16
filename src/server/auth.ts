import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { config } from './config.js';

const ttl = 12 * 60 * 60 * 1000;
const sign = (payload: string) => crypto.createHmac('sha256', config.SESSION_SECRET).update(payload).digest('base64url');

export function createSession(userId: string) {
  const payload = Buffer.from(JSON.stringify({ userId, expiresAt: Date.now() + ttl })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function readSession(token?: string) {
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature || signature.length !== sign(payload).length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(sign(payload)))) return null;
  try { const session = JSON.parse(Buffer.from(payload, 'base64url').toString()); return session.expiresAt > Date.now() ? session : null; } catch { return null; }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const session = readSession(req.cookies?.session);
  if (!session) return res.status(401).json({ error: 'Faça login para continuar.' });
  res.locals.userId = session.userId;
  next();
}
