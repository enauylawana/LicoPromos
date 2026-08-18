import { z } from "zod";

const booleanString = z
  .string()
  .optional()
  .transform((value) => value === "true");

export const config = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().default(3000),
    APP_URL: z.string().default("http://localhost:5174"),
    TIMEZONE: z.string().default("America/Porto_Velho"),
    SESSION_SECRET: z
      .string()
      .min(16)
      .default("local-development-secret-change-me"),
    DRY_RUN: booleanString,
    EXTERNAL_PUBLISHING_ENABLED: booleanString,
    AUTO_APPROVAL: booleanString,
    N8N_API_KEY: z.string().min(24).optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GOOGLE_REDIRECT_URI: z.string().url().optional(),
    MERCADO_LIVRE_ACCESS_TOKEN: z.string().optional(),
    MERCADO_LIVRE_CLIENT_ID: z.string().optional(),
    MERCADO_LIVRE_CLIENT_SECRET: z.string().optional(),
    MERCADO_LIVRE_REDIRECT_URI: z.string().url().optional(),
    MERCADO_LIVRE_SEARCH_LIMIT: z.coerce
      .number()
      .int()
      .min(1)
      .max(20)
      .default(6),
    META_GRAPH_API_VERSION: z
      .string()
      .regex(/^v\d+\.\d+$/)
      .default("v23.0"),
  })
  .parse(process.env);

if (!config.DRY_RUN && !config.EXTERNAL_PUBLISHING_ENABLED && config.NODE_ENV !== "test") {
  throw new Error("Inicialização recusada: envio real exige EXTERNAL_PUBLISHING_ENABLED=true.");
}
