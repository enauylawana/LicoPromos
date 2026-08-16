export type QuietHoursDecision = { allowed: boolean; nextAllowedAt?: Date };

const minutes = (value: string) => {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error(`Horário inválido: ${value}`);
  const result = Number(match[1]) * 60 + Number(match[2]);
  if (result > 1439) throw new Error(`Horário inválido: ${value}`);
  return result;
};

export function quietHoursDecision(now = new Date(), timezone = 'America/Porto_Velho', start = '23:30', end = '07:00'): QuietHoursDecision {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const current = Number(parts.find((part) => part.type === 'hour')?.value) * 60 + Number(parts.find((part) => part.type === 'minute')?.value);
  const startMinutes = minutes(start);
  const endMinutes = minutes(end);
  const quiet = startMinutes > endMinutes ? current >= startMinutes || current < endMinutes : current >= startMinutes && current < endMinutes;
  if (!quiet) return { allowed: true };
  const waitMinutes = current < endMinutes ? endMinutes - current : 1440 - current + endMinutes;
  return { allowed: false, nextAllowedAt: new Date(now.getTime() + waitMinutes * 60_000) };
}
