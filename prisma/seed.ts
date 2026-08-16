import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { keywordCatalog } from '../src/server/keyword-catalog.js';

const db = new PrismaClient();
const niches = [
  ['Eletrônicos', ['tv', 'smart', 'fone']], ['Informática', ['notebook', 'ssd', 'monitor']],
  ['Celulares', ['celular', 'smartphone']], ['Casa e cozinha', ['cozinha', 'casa', 'panela']],
  ['Ferramentas', ['ferramenta', 'furadeira']], ['Beleza', ['beleza', 'perfume']], ['Games', ['game', 'console']],
  ['Casa & Decoração', ['casa', 'decoração', 'organização']], ['Esportes', ['esporte', 'fitness', 'corrida']],
] as const;

const focusedNiches = [
  ['Eletrônicos até R$ 200', ['fone bluetooth', 'smart lâmpada', 'power bank', 'cabo usb', 'carregador']],
  ['Corrida e running', ['tênis corrida', 'meia corrida', 'cinto corrida', 'garrafa esportiva', 'relógio corrida']],
  ['Decoração', ['luminária', 'organizador', 'quadro decorativo', 'almofada', 'tapete']],
] as const;

async function main() {
  const configuredEmail = process.env.ADMIN_EMAIL?.trim();
  const configuredPassword = process.env.ADMIN_PASSWORD?.trim();
  if (configuredEmail && configuredPassword) {
    await db.adminUser.upsert({ where: { email: configuredEmail }, update: {}, create: { email: configuredEmail, passwordHash: await bcrypt.hash(configuredPassword, 12) } });
    console.log(`\nAdministrador configurado: ${configuredEmail}\n`);
  } else if (await db.adminUser.count() === 0) {
    const suffix = crypto.randomBytes(4).toString('hex');
    const email = `admin-${suffix}@localhost`;
    const password = crypto.randomBytes(18).toString('base64url');
    await db.adminUser.create({ data: { email, passwordHash: await bcrypt.hash(password, 12) } });
    console.log('\n=== CREDENCIAIS INICIAIS DO LICO PRIMOS ===');
    console.log(`E-mail: ${email}`);
    console.log(`Senha:  ${password}`);
    console.log('Guarde estas credenciais agora; a senha não será exibida novamente.');
    console.log('===========================================\n');
  } else {
    console.log('\nAdministrador existente preservado. Use as credenciais criadas no primeiro setup.\n');
  }
  await db.publication.deleteMany({ where: { offer: { OR: [{ storeId: { in: ['amazon', 'shopee'] } }, { externalId: { contains: 'DEMO' } }] } } });
  await db.priceHistory.deleteMany({ where: { offer: { OR: [{ storeId: { in: ['amazon', 'shopee'] } }, { externalId: { contains: 'DEMO' } }] } } });
  await db.affiliateLink.deleteMany({ where: { offer: { OR: [{ storeId: { in: ['amazon', 'shopee'] } }, { externalId: { contains: 'DEMO' } }] } } });
  await db.offer.deleteMany({ where: { OR: [{ storeId: { in: ['amazon', 'shopee'] } }, { externalId: { contains: 'DEMO' } }] } });
  await db.store.deleteMany({ where: { id: { in: ['amazon', 'shopee'] } } });
  await db.store.upsert({ where: { id: 'mercado_livre' }, update: { name: 'Mercado Livre', note: 'Busca oficial por OAuth. Links afiliados continuam dependentes da ferramenta oficial do programa.' }, create: { id: 'mercado_livre', name: 'Mercado Livre', note: 'Busca oficial por OAuth. Links afiliados continuam dependentes da ferramenta oficial do programa.' } });
  for (const [name, words] of niches) await db.niche.upsert({ where: { name }, update: { minRating: 0, minReviewCount: 0, enabledStores: JSON.stringify(['mercado_livre']) }, create: { name, wantedKeywords: JSON.stringify(words), minDiscount: 10, minRating: 0, minReviewCount: 0, enabledStores: JSON.stringify(['mercado_livre']) } });
  for (const category of keywordCatalog) await db.niche.upsert({
    where: { name: category.name },
    update: { wantedKeywords: JSON.stringify(category.keywords), enabledStores: JSON.stringify(['mercado_livre']), active: true },
    create: { name: category.name, wantedKeywords: JSON.stringify(category.keywords), minDiscount: 10, enabledStores: JSON.stringify(['mercado_livre']) },
  });
  for (const [name, words] of focusedNiches) await db.niche.upsert({
    where: { name },
    update: { wantedKeywords: JSON.stringify(words), maxPrice: 200, minDiscount: 20, minRating: 4, minReviewCount: 10, enabledStores: JSON.stringify(['mercado_livre']) },
    create: { name, wantedKeywords: JSON.stringify(words), maxPrice: 200, minDiscount: 20, minRating: 4, minReviewCount: 10, enabledStores: JSON.stringify(['mercado_livre']) },
  });
  await db.setting.deleteMany({ where: { key: 'demoMode' } });
  for (const [key, value] of [['operationMode', 'dry_run'], ['timezone', 'America/Porto_Velho'], ['dailyLimit', '20']]) await db.setting.upsert({ where: { key }, update: {}, create: { key, value } });
}
main().finally(() => db.$disconnect());
