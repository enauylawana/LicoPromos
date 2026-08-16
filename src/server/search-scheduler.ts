import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { db } from './db.js';
import { config } from './config.js';
import { runSearch, type SearchFilters } from './services.js';

export type SearchPlanRule = {
  id: string;
  category: string;
  query: string;
  quantity: number;
};

export type SearchExecution = {
  status: 'waiting' | 'running' | 'success' | 'empty' | 'failed';
  startedAt?: string;
  finishedAt?: string;
  foundCount?: number;
  error?: string;
};

export type SearchSchedule = {
  id: string;
  name: string;
  enabled: boolean;
  bestSellers: boolean;
  time: string;
  days: number[];
  productCount: number;
  rules: SearchPlanRule[];
  filters: Required<SearchFilters>;
  execution?: SearchExecution;
};

const DEFAULT_FILTERS: Required<SearchFilters> = {
  minCommission: 0,
  minRating: 0,
  minDiscount: 0,
  minPrice: 0,
  maxPrice: 1000000,
  extraCommissionOnly: false,
  freeShippingOnly: false,
};
const DEFAULT_SCHEDULE = {
  name: 'Busca geral', enabled: false, bestSellers: false, time: '07:00', days: [0, 1, 2, 3, 4, 5, 6], productCount: 100,
  rules: [] as SearchPlanRule[], filters: DEFAULT_FILTERS,
};

function normalizeSchedule(entry: Partial<SearchSchedule>): SearchSchedule {
  const rules = Array.isArray(entry.rules) ? entry.rules.map((rule) => ({
    id: rule.id || randomUUID(),
    category: String(rule.category || 'Geral').slice(0, 80),
    query: String(rule.query || '').trim().slice(0, 120),
    quantity: Math.max(1, Math.min(200, Math.trunc(rule.quantity || 1))),
  })) : [];
  const requestedTotal = rules.length ? rules.reduce((sum, rule) => sum + rule.quantity, 0) : entry.productCount ?? 100;
  return {
    ...DEFAULT_SCHEDULE,
    ...entry,
    id: entry.id || randomUUID(),
    name: String(entry.name || DEFAULT_SCHEDULE.name).trim().slice(0, 80),
    days: [...new Set(entry.days ?? DEFAULT_SCHEDULE.days)].filter((day) => day >= 0 && day <= 6).sort(),
    productCount: Math.max(1, Math.min(200, Math.trunc(requestedTotal))),
    rules,
    filters: {
      minCommission: entry.filters?.minCommission ?? DEFAULT_FILTERS.minCommission,
      minRating: entry.filters?.minRating ?? DEFAULT_FILTERS.minRating,
      minDiscount: entry.filters?.minDiscount ?? DEFAULT_FILTERS.minDiscount,
      minPrice: entry.filters?.minPrice ?? DEFAULT_FILTERS.minPrice,
      maxPrice: entry.filters?.maxPrice ?? DEFAULT_FILTERS.maxPrice,
      extraCommissionOnly: entry.filters?.extraCommissionOnly ?? DEFAULT_FILTERS.extraCommissionOnly,
      freeShippingOnly: entry.filters?.freeShippingOnly ?? DEFAULT_FILTERS.freeShippingOnly,
    },
  };
}

async function readExecution(id: string): Promise<SearchExecution> {
  const setting = await db.setting.findUnique({ where: { key: `automatic_search_status_${id}` } });
  if (!setting) return { status: 'waiting' };
  try { return JSON.parse(setting.value) as SearchExecution; } catch { return { status: 'waiting' }; }
}

async function writeExecution(id: string, execution: SearchExecution) {
  await db.setting.upsert({
    where: { key: `automatic_search_status_${id}` },
    update: { value: JSON.stringify(execution) },
    create: { key: `automatic_search_status_${id}`, value: JSON.stringify(execution) },
  });
}

export async function getSearchSchedules(): Promise<SearchSchedule[]> {
  const setting = await db.setting.findUnique({ where: { key: 'automatic_search_schedule' } });
  if (!setting) return [];
  try {
    const saved = JSON.parse(setting.value) as Partial<SearchSchedule> | { schedules?: Partial<SearchSchedule>[] };
    const entries = 'schedules' in saved && Array.isArray(saved.schedules) ? saved.schedules : [{ ...saved, id: 'schedule-imported' }];
    return Promise.all(entries.map(async (entry) => {
      const schedule = normalizeSchedule(entry);
      return { ...schedule, execution: await readExecution(schedule.id) };
    }));
  } catch { return []; }
}

async function persist(schedules: SearchSchedule[]) {
  const clean = schedules.map(({ execution: _execution, ...schedule }) => schedule);
  await db.setting.upsert({
    where: { key: 'automatic_search_schedule' },
    update: { value: JSON.stringify({ schedules: clean }) },
    create: { key: 'automatic_search_schedule', value: JSON.stringify({ schedules: clean }) },
  });
}

export async function saveSearchSchedule(input: Omit<SearchSchedule, 'id' | 'execution'>) {
  const value = normalizeSchedule({ ...input, id: randomUUID() });
  const schedules = await getSearchSchedules();
  schedules.push(value);
  await persist(schedules);
  await writeExecution(value.id, { status: 'waiting' });
  return value;
}

export async function updateSearchSchedule(id: string, input: Omit<SearchSchedule, 'id' | 'execution'>) {
  const schedules = await getSearchSchedules();
  const index = schedules.findIndex((schedule) => schedule.id === id);
  if (index < 0) return undefined;
  schedules[index] = normalizeSchedule({ ...input, id });
  await persist(schedules);
  return schedules[index];
}

export async function removeSearchSchedule(id: string) {
  const schedules = await getSearchSchedules();
  const remaining = schedules.filter((schedule) => schedule.id !== id);
  await persist(remaining);
  await db.setting.deleteMany({ where: { key: `automatic_search_status_${id}` } });
  return schedules.length !== remaining.length;
}

function localClock() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    time: `${part('hour')}:${part('minute')}`,
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(part('weekday')),
  };
}

export async function executeSearchSchedule(schedule: SearchSchedule) {
  const startedAt = new Date().toISOString();
  await writeExecution(schedule.id, { status: 'running', startedAt, foundCount: 0 });
  let foundCount = 0;
  try {
    const rules = schedule.rules.length ? schedule.rules : [{ id: 'general', category: 'Geral', query: '', quantity: schedule.productCount }];
    for (const rule of rules) {
      const result = await runSearch('automatic', rule.query, rule.quantity, schedule.filters, schedule.bestSellers ? 'best_sellers' : 'general');
      foundCount += result.foundCount;
    }
    const execution: SearchExecution = {
      status: foundCount > 0 ? 'success' : 'empty', startedAt,
      finishedAt: new Date().toISOString(), foundCount,
      error: foundCount > 0 ? undefined : 'A Central de Afiliados não retornou produtos para esta busca.',
    };
    await writeExecution(schedule.id, execution);
    return execution;
  } catch (error) {
    const execution: SearchExecution = {
      status: 'failed', startedAt, finishedAt: new Date().toISOString(), foundCount,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    };
    await writeExecution(schedule.id, execution);
    throw error;
  }
}

export async function runSearchScheduleNow(id: string) {
  const schedule = (await getSearchSchedules()).find((item) => item.id === id);
  if (!schedule) return undefined;
  return executeSearchSchedule(schedule);
}

export async function runDueAutomaticSearch() {
  const schedules = await getSearchSchedules();
  const now = localClock();
  for (const schedule of schedules) {
    if (!schedule.enabled || now.time !== schedule.time || !schedule.days.includes(now.weekday)) continue;
    const runKey = `${now.date}T${now.time}`;
    const claimKey = `automatic_search_claim_${schedule.id}_${runKey}`;
    try {
      await db.setting.create({ data: { key: claimKey, value: new Date().toISOString() } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue;
      throw error;
    }
    await db.setting.upsert({
      where: { key: `automatic_search_last_run_${schedule.id}` }, update: { value: runKey },
      create: { key: `automatic_search_last_run_${schedule.id}`, value: runKey },
    });
    await executeSearchSchedule(schedule);
  }
}
