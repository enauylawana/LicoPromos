import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { config } from "./config.js";

function suppliedKey(req: Request) {
  const direct = req.get("x-api-key")?.trim();
  if (direct) return direct;
  const authorization = req.get("authorization") ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
}

export function requireN8nApiKey(req: Request, res: Response, next: NextFunction) {
  if (!config.N8N_API_KEY) {
    return res.status(503).json({ error: { code: "n8n_api_disabled", message: "A API do n8n ainda não foi configurada." } });
  }
  const expected = crypto.createHash("sha256").update(config.N8N_API_KEY).digest();
  const received = crypto.createHash("sha256").update(suppliedKey(req)).digest();
  if (!crypto.timingSafeEqual(expected, received)) {
    return res.status(401).json({ error: { code: "invalid_api_key", message: "API key inválida." } });
  }
  next();
}
