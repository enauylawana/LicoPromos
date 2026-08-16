import { db } from "./db.js";
import { listWhatsAppGroups, whatsappWebStatus } from "./whatsapp-web.js";

type Snapshot = { capturedAt: string; groups: Array<{ id: string; name: string; memberCount: number }> };
const KEY = "whatsapp_group_member_snapshots";

async function readSnapshots(): Promise<Snapshot[]> {
  const row = await db.setting.findUnique({ where: { key: KEY } });
  if (!row) return [];
  try { return JSON.parse(row.value) as Snapshot[]; } catch { return []; }
}

export async function captureWhatsAppGroupMetrics() {
  if (whatsappWebStatus().status !== "ready") return { captured: false, reason: "WhatsApp desconectado" };
  const groups = (await listWhatsAppGroups())
    .filter((group) => typeof group.memberCount === "number")
    .map((group) => ({ id: group.id, name: group.name, memberCount: group.memberCount ?? 0 }));
  if (!groups.length) return { captured: false, reason: "Contagem de participantes indisponível" };
  const snapshots = await readSnapshots();
  const now = new Date();
  const next = [{ capturedAt: now.toISOString(), groups }, ...snapshots].slice(0, 90);
  await db.setting.upsert({ where: { key: KEY }, update: { value: JSON.stringify(next) }, create: { key: KEY, value: JSON.stringify(next) } });
  return { captured: true, groups: groups.length };
}

export async function whatsappGroupGrowthReport() {
  const snapshots = await readSnapshots();
  const latest = snapshots[0];
  const previous = snapshots.find((snapshot) => Date.now() - new Date(snapshot.capturedAt).getTime() >= 24 * 60 * 60 * 1000) ?? snapshots[1];
  if (!latest) return { available: false, capturedAt: null, totalMembers: 0, change: 0, groups: [] };
  const before = new Map((previous?.groups ?? []).map((group) => [group.id, group.memberCount]));
  const groups = latest.groups.map((group) => ({ ...group, change: group.memberCount - (before.get(group.id) ?? group.memberCount) }));
  return { available: true, capturedAt: latest.capturedAt, totalMembers: groups.reduce((sum, group) => sum + group.memberCount, 0), change: groups.reduce((sum, group) => sum + group.change, 0), groups };
}
