import fs from "node:fs";
import path from "node:path";
import QRCode from "qrcode";
import puppeteer from "puppeteer";
import whatsappWeb from "whatsapp-web.js";
import type { GroupChat } from "whatsapp-web.js";

const { Client, LocalAuth, MessageMedia } = whatsappWeb;
type WebStatus =
  | "idle"
  | "starting"
  | "qr"
  | "authenticated"
  | "ready"
  | "disconnected"
  | "error";
type Group = { id: string; name: string; memberCount?: number };
let client: InstanceType<typeof Client> | null = null;
let status: WebStatus = "idle";
let qrDataUrl = "";
let errorMessage = "";
let connectedNumber = "";
let groups: Group[] = [];

function isStaleBrowserError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /detached Frame|Session closed|Target closed|Execution context was destroyed/i.test(message);
}

async function waitUntilReady(timeoutMs = 60_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (status === "ready" && client) return;
    if (status === "error" || status === "qr" || status === "disconnected") break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(errorMessage || "O WhatsApp não ficou pronto após reiniciar a sessão.");
}

async function restartStaleSession() {
  const staleClient = client;
  client = null;
  status = "idle";
  groups = [];
  errorMessage = "";
  await staleClient?.destroy().catch(() => undefined);
  await startWhatsAppWeb();
  await waitUntilReady();
}

async function refreshGroups() {
  if (!client || status !== "ready") return;
  try {
    const chats = await client.getChats();
    groups = chats
      .filter((chat) => chat.isGroup)
      .map((chat) => {
        const group = chat as GroupChat;
        return { id: chat.id._serialized, name: chat.name, memberCount: group.participants?.length };
      });
  } catch {
    if (!client.pupPage)
      throw new Error("A página interna do WhatsApp Web não está disponível.");
    groups = await client.pupPage.evaluate(() => {
      type RawChat = {
        id: { server: string; _serialized: string };
        name?: string;
        formattedTitle?: string;
        groupMetadata?: { participants?: unknown[] };
      };
      const wa = globalThis as unknown as {
        require: (module: string) => {
          Chat: { getModelsArray: () => RawChat[] };
        };
      };
      return wa
        .require("WAWebCollections")
        .Chat.getModelsArray()
        .filter(
          (chat) => chat.id.server === "g.us" || Boolean(chat.groupMetadata),
        )
        .map((chat) => ({
          id: chat.id._serialized,
          name: chat.name || chat.formattedTitle || "Grupo sem nome",
          memberCount: chat.groupMetadata?.participants?.length,
        }));
    });
  }
  groups.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}
export async function startWhatsAppWeb() {
  if (client && ["starting", "qr", "authenticated", "ready"].includes(status))
    return whatsappWebStatus();
  if (client) await client.destroy().catch(() => undefined);
  status = "starting";
  qrDataUrl = "";
  errorMessage = "";
  client = new Client({
    authStrategy: new LocalAuth({
      clientId: "radar-de-ofertas",
      dataPath: path.resolve(".runtime/whatsapp-web"),
    }),
    puppeteer: {
      headless: true,
      executablePath: puppeteer.executablePath(),
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
  });
  client.on("qr", (qr) => {
    void QRCode.toDataURL(qr, { width: 360, margin: 1 }).then((data) => {
      qrDataUrl = data;
      status = "qr";
    });
  });
  client.on("authenticated", () => {
    status = "authenticated";
    qrDataUrl = "";
  });
  client.on("ready", () => {
    status = "ready";
    qrDataUrl = "";
    connectedNumber = client?.info?.wid?.user ?? "";
    void refreshGroups();
  });
  client.on("disconnected", (reason) => {
    status = "disconnected";
    errorMessage = String(reason);
    qrDataUrl = "";
  });
  client.on("auth_failure", (message) => {
    status = "error";
    errorMessage = message;
    qrDataUrl = "";
  });
  void client.initialize().catch((error: unknown) => {
    status = "error";
    errorMessage =
      error instanceof Error
        ? error.message
        : "Falha ao iniciar o WhatsApp Web.";
  });
  return whatsappWebStatus();
}
export async function restoreWhatsAppWebSession() {
  if (
    !fs.existsSync(
      path.resolve(".runtime/whatsapp-web/session-radar-de-ofertas"),
    )
  )
    return whatsappWebStatus();
  return startWhatsAppWeb();
}
export function whatsappWebStatus() {
  return {
    status,
    qrDataUrl,
    error: errorMessage,
    connectedNumber,
    groupsCount: groups.length,
  };
}
export async function listWhatsAppGroups() {
  if (status === "ready") await refreshGroups();
  return groups;
}
export async function sendWhatsAppWebTest(groupId: string) {
  if (!client || status !== "ready")
    throw new Error("Conecte o WhatsApp pelo QR Code antes do teste.");
  if (!groups.some((group) => group.id === groupId)) await refreshGroups();
  if (!groups.some((group) => group.id === groupId))
    throw new Error("Grupo não encontrado na sessão conectada.");
  const result = await client.sendMessage(
    groupId,
    "✅ Teste do Lico Primos concluído. Nenhuma automação foi ativada.",
  );
  const runtimeResult = result as unknown as { id?: { _serialized?: string } };
  return {
    sent: true,
    messageId: runtimeResult?.id?._serialized ?? `accepted-${Date.now()}`,
  };
}
export async function renameWhatsAppGroup(groupId: string, title: string) {
  if (!client || status !== "ready")
    throw new Error("Conecte o WhatsApp antes de renomear o grupo.");
  const group = (await client.getChatById(groupId)) as GroupChat;
  if (!group.isGroup) throw new Error("O destino selecionado não é um grupo.");
  const renamed = await group.setSubject(title);
  if (!renamed) throw new Error("O WhatsApp não confirmou a alteração do nome.");
  await refreshGroups();
  return { renamed: true, id: groupId, name: title };
}
export async function sendWhatsAppWebOffer(
  groupId: string,
  message: string,
  imageUrl?: string | null,
) {
  if ((!client || status !== "ready") && fs.existsSync(
    path.resolve(".runtime/whatsapp-web/session-radar-de-ofertas"),
  )) {
    await startWhatsAppWeb();
    await waitUntilReady(30_000);
  }
  try {
    return await sendWhatsAppWebOfferOnce(groupId, message, imageUrl);
  } catch (error) {
    if (!isStaleBrowserError(error)) throw error;
    await restartStaleSession();
    return sendWhatsAppWebOfferOnce(groupId, message, imageUrl);
  }
}

async function sendWhatsAppWebOfferOnce(
  groupId: string,
  message: string,
  imageUrl?: string | null,
) {
  if (!client || status !== "ready")
    throw new Error(
      "WhatsApp Web desconectado. Reconecte pelo QR Code em Integrações.",
    );
  if (!groups.some((group) => group.id === groupId)) await refreshGroups();
  if (!groups.some((group) => group.id === groupId))
    throw new Error(
      "O grupo selecionado não foi encontrado no WhatsApp conectado.",
    );
  if (imageUrl) {
    try {
      const media = await MessageMedia.fromUrl(imageUrl, { unsafeMime: true });
      const mediaResult = await client.sendMessage(groupId, media, {
        caption: message,
      });
      const runtimeResult = mediaResult as unknown as {
        id?: { _serialized?: string };
      };
      return {
        sent: true,
        messageId: runtimeResult?.id?._serialized ?? `accepted-${Date.now()}`,
        withImage: true,
      };
    } catch (error) {
      if (isStaleBrowserError(error)) throw error;
      // Algumas imagens do CDN do anúncio expiram ou recusam o download.
      // Nesses casos a oferta ainda deve chegar com o link clicável.
      const textResult = await client.sendMessage(groupId, message, {
        linkPreview: true,
      });
      const runtimeResult = textResult as unknown as {
        id?: { _serialized?: string };
      };
      return {
        sent: true,
        messageId: runtimeResult?.id?._serialized ?? `accepted-${Date.now()}`,
        withImage: false,
        mediaFallback: true,
      };
    }
  }
  const result = await client.sendMessage(groupId, message, {
    linkPreview: true,
  });
  const runtimeResult = result as unknown as { id?: { _serialized?: string } };
  return {
    sent: true,
    messageId: runtimeResult?.id?._serialized ?? `accepted-${Date.now()}`,
    withImage: false,
  };
}
export async function createWhatsAppOfferGroup(
  title: string,
  phoneNumbers: string[],
) {
  if (!client || status !== "ready")
    throw new Error("Conecte o WhatsApp pelo QR Code antes de criar o grupo.");
  const participants = [
    ...new Set(
      phoneNumbers
        .map((number) => number.replace(/\D/g, ""))
        .filter((number) => number.length >= 10 && number.length <= 15),
    ),
  ].map((number) => `${number}@c.us`);
  if (!participants.length)
    throw new Error("Informe ao menos um participante com DDI e DDD.");
  const result = await client.createGroup(title, [], {
    memberAddMode: true,
    isRestrict: true,
    isAnnounce: true,
  });
  if (typeof result === "string") throw new Error(result);
  const groupId = result.gid._serialized;
  const group = (await client.getChatById(groupId)) as GroupChat;
  const messagesLocked = await group.setMessagesAdminsOnly(true);
  const infoLocked = await group.setInfoAdminsOnly(true);
  const membersLocked = await group.setAddMembersAdminsOnly(true);
  if (!messagesLocked)
    throw new Error(
      "O grupo foi criado, mas o WhatsApp não confirmou a restrição de mensagens. Abra o grupo e ative “Somente administradores” antes de usá-lo.",
    );
  const addedParticipants = await group.addParticipants(participants, {
    autoSendInviteV4: true,
  });
  await refreshGroups();
  return {
    group: { id: groupId, name: result.title },
    settings: {
      messagesAdminsOnly: messagesLocked,
      infoAdminsOnly: infoLocked,
      addMembersAdminsOnly: membersLocked,
    },
    participants: addedParticipants,
  };
}
export async function disconnectWhatsAppWeb() {
  if (client) {
    await client.logout().catch(() => undefined);
    await client.destroy().catch(() => undefined);
  }
  client = null;
  status = "idle";
  qrDataUrl = "";
  errorMessage = "";
  connectedNumber = "";
  groups = [];
}
export async function stopWhatsAppWebSession() {
  if (client) await client.destroy().catch(() => undefined);
  client = null;
  status = "idle";
  qrDataUrl = "";
  groups = [];
}
