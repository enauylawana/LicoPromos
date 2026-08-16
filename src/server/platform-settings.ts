import crypto from "node:crypto";
import { z } from "zod";
import { db } from "./db.js";
import { config } from "./config.js";

const profileSchema = z.object({
  firstName: z.string().trim().max(80).default(""),
  lastName: z.string().trim().max(80).default(""),
  countryCode: z.string().trim().max(8).default("+55"),
  areaCode: z.string().trim().max(4).default(""),
  phone: z.string().trim().max(20).default(""),
  taxId: z.string().trim().max(20).default(""),
  acceptedTerms: z.boolean().default(false),
  marketingConsent: z.boolean().default(false),
});

const networkIds = ["mercado_livre", "shopee", "amazon", "aliexpress"] as const;
export const networkIdSchema = z.enum(networkIds);

const networkInputSchema = z.object({
  affiliateId: z.string().trim().max(200).optional(),
  trackingId: z.string().trim().max(200).optional(),
  storeName: z.string().trim().max(200).optional(),
  apiKey: z.string().trim().max(1000).optional(),
  secret: z.string().trim().max(1000).optional(),
});

const messagingSchema = z.object({
  telegram: z.object({
    botUsername: z.string().trim().max(100).default(""),
    channelId: z.string().trim().max(100).default(""),
    botToken: z.string().trim().max(1000).optional(),
  }),
  whatsapp: z.object({
    phoneNumber: z.string().trim().max(30).default(""),
    phoneNumberId: z.string().trim().max(100).default(""),
    businessAccountId: z.string().trim().max(100).default(""),
    testRecipient: z.string().trim().max(30).default(""),
    accessToken: z.string().trim().max(2000).optional(),
  }),
});

const channelSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(2).max(80),
  type: z.enum(["telegram", "whatsapp"]),
  externalId: z.string().trim().max(150).default(""),
  enabled: z.boolean().default(true),
});

export const channelInputSchema = channelSchema.omit({ id: true });

function key() {
  return crypto
    .createHash("sha256")
    .update(process.env.ENCRYPTION_KEY || config.SESSION_SECRET)
    .digest();
}
function encrypt(value: unknown) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return [
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}
function decrypt<T>(value: string): T {
  const [iv, tag, encrypted] = value.split(".");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(encrypted, "base64url")),
      decipher.final(),
    ]).toString("utf8"),
  ) as T;
}
async function readJson<T>(settingKey: string, fallback: T): Promise<T> {
  const row = await db.setting.findUnique({ where: { key: settingKey } });
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}
async function writeJson(settingKey: string, value: unknown) {
  await db.setting.upsert({
    where: { key: settingKey },
    update: { value: JSON.stringify(value) },
    create: { key: settingKey, value: JSON.stringify(value) },
  });
}
async function readSecret<T>(settingKey: string): Promise<T | undefined> {
  const row = await db.setting.findUnique({ where: { key: settingKey } });
  if (!row) return undefined;
  try {
    return decrypt<T>(row.value);
  } catch {
    return undefined;
  }
}
async function writeSecret(settingKey: string, value: unknown) {
  await db.setting.upsert({
    where: { key: settingKey },
    update: { value: encrypt(value) },
    create: { key: settingKey, value: encrypt(value) },
  });
}

const labels: Record<(typeof networkIds)[number], string> = {
  mercado_livre: "Mercado Livre",
  shopee: "Shopee",
  amazon: "Amazon",
  aliexpress: "AliExpress",
};

export async function platformOverview(mercadoLivreConnected: boolean) {
  const profile = profileSchema.parse(await readJson("accountProfile", {}));
  const channels = z
    .array(channelSchema)
    .parse(await readJson("distributionChannels", []));
  const messaging = await readSecret<z.infer<typeof messagingSchema>>(
    "messagingCredentials",
  );
  const networks = await Promise.all(
    networkIds.map(async (id) => {
      const saved = await readSecret<z.infer<typeof networkInputSchema>>(
        `affiliateNetwork:${id}`,
      );
      const configured =
        id === "mercado_livre"
          ? mercadoLivreConnected
          : Boolean(saved && Object.values(saved).some(Boolean));
      return {
        id,
        name: labels[id],
        configured,
        affiliateId: saved?.affiliateId ?? "",
        trackingId: saved?.trackingId ?? "",
        storeName: saved?.storeName ?? "",
        hasApiKey: Boolean(saved?.apiKey),
        hasSecret: Boolean(saved?.secret),
      };
    }),
  );
  return {
    profile,
    networks,
    messaging: {
      telegram: {
        botUsername: messaging?.telegram.botUsername ?? "",
        channelId: messaging?.telegram.channelId ?? "",
        configured: Boolean(messaging?.telegram.botToken),
      },
      whatsapp: {
        phoneNumber: messaging?.whatsapp.phoneNumber ?? "",
        phoneNumberId: messaging?.whatsapp.phoneNumberId ?? "",
        businessAccountId: messaging?.whatsapp.businessAccountId ?? "",
        testRecipient: messaging?.whatsapp.testRecipient ?? "",
        configured: Boolean(
          messaging?.whatsapp.accessToken && messaging?.whatsapp.phoneNumberId,
        ),
      },
    },
    channels,
    subscription: {
      plan: "Desenvolvimento",
      status: "active",
      billing: "Nenhuma cobrança configurada",
    },
  };
}

export async function saveProfile(input: unknown) {
  const value = profileSchema.parse(input);
  await writeJson("accountProfile", value);
  return value;
}
export async function saveNetwork(
  id: z.infer<typeof networkIdSchema>,
  input: unknown,
) {
  const next = networkInputSchema.parse(input);
  const current =
    (await readSecret<z.infer<typeof networkInputSchema>>(
      `affiliateNetwork:${id}`,
    )) ?? {};
  const merged = {
    ...current,
    ...Object.fromEntries(
      Object.entries(next).filter(([, value]) => value !== ""),
    ),
  };
  await writeSecret(`affiliateNetwork:${id}`, merged);
  return { configured: Object.values(merged).some(Boolean) };
}
export async function saveMessaging(input: unknown) {
  const next = messagingSchema.parse(input);
  const current = await readSecret<z.infer<typeof messagingSchema>>(
    "messagingCredentials",
  );
  const merged = {
    telegram: {
      ...current?.telegram,
      ...next.telegram,
      botToken: next.telegram.botToken || current?.telegram.botToken,
    },
    whatsapp: {
      ...current?.whatsapp,
      ...next.whatsapp,
      accessToken: next.whatsapp.accessToken || current?.whatsapp.accessToken,
    },
  };
  await writeSecret("messagingCredentials", merged);
  return true;
}
export async function distributionConnections() {
  const channels = z
    .array(channelSchema)
    .parse(await readJson("distributionChannels", []));
  const messaging = await readSecret<z.infer<typeof messagingSchema>>(
    "messagingCredentials",
  );
  return { channels, messaging };
}
export async function testWhatsApp() {
  const { messaging } = await distributionConnections();
  const whatsapp = messaging?.whatsapp;
  if (!whatsapp?.accessToken || !whatsapp.phoneNumberId)
    throw new Error("Informe o Phone Number ID e o token de acesso da Meta.");
  const to = (whatsapp.testRecipient || "").replace(/\D/g, "");
  if (to.length < 10 || to.length > 15)
    throw new Error(
      "Informe o número de teste com DDI e DDD, somente números.",
    );
  const response = await fetch(
    `https://graph.facebook.com/${config.META_GRAPH_API_VERSION}/${encodeURIComponent(whatsapp.phoneNumberId)}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${whatsapp.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: { name: "hello_world", language: { code: "en_US" } },
      }),
      signal: AbortSignal.timeout(20_000),
    },
  );
  const result = (await response.json().catch(() => ({}))) as {
    messages?: Array<{ id: string }>;
    error?: { message?: string; error_user_msg?: string };
  };
  if (!response.ok || !result.messages?.[0]?.id)
    throw new Error(
      result.error?.error_user_msg ||
        result.error?.message ||
        `A Meta respondeu com erro ${response.status}.`,
    );
  await db.auditLog.create({
    data: {
      action: "whatsapp.test_sent",
      entityType: "Messaging",
      metadata: JSON.stringify({
        recipientSuffix: to.slice(-4),
        messageId: result.messages[0].id,
      }),
    },
  });
  return {
    sent: true,
    messageId: result.messages[0].id,
    recipientSuffix: to.slice(-4),
  };
}
export async function createChannel(input: unknown) {
  const value = channelInputSchema.parse(input);
  const channels = z
    .array(channelSchema)
    .parse(await readJson("distributionChannels", []));
  const channel = channelSchema.parse({ ...value, id: crypto.randomUUID() });
  channels.push(channel);
  await writeJson("distributionChannels", channels);
  return channel;
}
export async function removeChannel(id: string) {
  const channels = z
    .array(channelSchema)
    .parse(await readJson("distributionChannels", []));
  await writeJson(
    "distributionChannels",
    channels.filter((channel) => channel.id !== id),
  );
}
export async function syncWhatsAppChannels(
  groups: Array<{ id: string; name: string }>,
) {
  const channels = z
    .array(channelSchema)
    .parse(await readJson("distributionChannels", []));
  let changed = false;
  for (const group of groups) {
    const existing = channels.find(
      (channel) =>
        channel.type === "whatsapp" && channel.externalId === group.id,
    );
    if (existing) {
      if (existing.name !== group.name) {
        existing.name = group.name;
        changed = true;
      }
      continue;
    }
    channels.push(
      channelSchema.parse({
        id: crypto.randomUUID(),
        name: group.name,
        type: "whatsapp",
        externalId: group.id,
        enabled: true,
      }),
    );
    changed = true;
  }
  if (changed) await writeJson("distributionChannels", channels);
  return channels.filter((channel) => channel.type === "whatsapp");
}
