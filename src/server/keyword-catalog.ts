export type KeywordCategory = {
  id: string;
  name: string;
  keywords: string[];
};

export const keywordCatalog: KeywordCategory[] = [
  { id: 'technology', name: 'Tecnologia, Gamer & Eletrônicos', keywords: [
    'smartphone custo beneficio', 'fone bluetooth cancelamento ruido', 'teclado mecanico switch red',
    'mouse gamer rgb leve', 'monitor ultrawide 144hz', 'headset gamer surround', 'ring light profissional',
    'microfone condensador usb', 'lampada inteligente wifi', 'alexa echo dot', 'fire tv stick',
    'smartwatch amoled', 'power bank 20000mah carregamento rapido', 'carregador inducao', 'ssd nvme 1tb',
    'placa de video custo beneficio', 'roteador wi-fi 6 gigabit',
  ] },
  { id: 'home', name: 'Casa, Cozinha Moderna & Eletroportáteis', keywords: [
    'air fryer 12l forno', 'panela eletrica pressao digital', 'aspirador robo mapeamento',
    'liquidificador alta potencia copo inox', 'cafeteira eletrica programavel', 'purificador de agua com compressor',
    'kit panelas ceramica antiaderente', 'organizador modular geladeira', 'suporte articulado tv',
    'ferro de passar a vapor vertical', 'ventilador coluna silencioso', 'umidificador de ar ultrassonico',
    'torneira eletrica cozinha', 'fritadeira sem oleo 4l',
  ] },
  { id: 'beauty', name: 'Beleza, Cuidados Pessoais & Estética', keywords: [
    'secador cabelo profissional ionico', 'modelador de cachos automatico', 'prancha alisadora titanium',
    'maquina cortar cabelo profissional cordless', 'epilador eletrico', 'escova rotativa secadora',
    'kit skincare acido hialuronico', 'vitamina c rosto', 'perfume importado masculino mais vendido',
    'perfume importado feminino lancamento', 'kit cronograma capilar profissional', 'massageador facial eletrico',
  ] },
  { id: 'sports', name: 'Esportes, Fitness & Ar Livre', keywords: [
    'kit halteres ajustaveis', 'barra fixa porta', 'colchonete yoga espesso', 'conjunto fitness feminino ginastica',
    'tenis corrida amortecimento', 'mochila impermeavel camping', 'barraca camping 4 pessoas',
    'colchao inflavel casal', 'bicicleta ergometrica magnetica', 'estacao de musculacao compacta',
    'smartband esporte', 'garrafa termica aco inox 1l',
  ] },
  { id: 'fashion', name: 'Moda, Calçados & Acessórios', keywords: [
    'tenis casual masculino conforto', 'tenis feminino ortopedico', 'mochila executiva notebook usb',
    'bolsa feminina couro sintetica', 'carteira masculina couro rfid', 'oculos sol polarizado',
    'relogio masculino prova d agua', 'mala de viagem rodinhas 360',
  ] },
  { id: 'tools', name: 'Ferramentas, Construção & Utilidades', keywords: [
    'parafusadeira furadeira bateria litio', 'kit ferramentas completo maleta', 'esmerilhadeira angular',
    'medidor laser distancia', 'camera seguranca wifi externa giratoria', 'fechadura digital biometrica',
    'mangueira elastica retratil', 'aparador de grama eletrico',
  ] },
  { id: 'pets', name: 'Pets', keywords: [
    'bebedouro fonte gato inox', 'comedouro automatico racao', 'tapete higienico lavavel super absorvente',
    'cama pet ortopedica grande', 'brinquedo interativo pet dispensador', 'caixa transporte pet aprovada',
  ] },
  { id: 'automotive', name: 'Automotivo & Motos', keywords: [
    'camera de re retrovisor', 'multimidia android auto carplay', 'aspirador automotivo potente 12v',
    'carregador veicular saida usb c', 'suporte celular magnetico saida ar',
    'capa automotiva impermeavel protecao uv', 'rastreador veicular gps discreto',
  ] },
  { id: 'blue-ocean', name: 'Oceano Azul & Hobbies Específicos', keywords: [
    'ferreomodelismo locomotiva escala ho', 'telescopio astronomia amadora', 'kit cultivo bonsai iniciante',
    'microfone podcast iniciante usb', 'suporte ergonomico para pes', 'cadeira escritorio mesh ergonomica',
    'oximetro de dedo certificado', 'medidor de glicose kit', 'lanterna tatica recarregavel',
    'canivete multiuso edc', 'kit emergencia sobrevivencia',
  ] },
];

const purchaseModifiers = [
  (term: string) => `melhor ${term}`,
  (term: string) => `${term} em promocao`,
  (term: string) => `${term} frete gratis`,
  (term: string) => `${term} original mercado livre`,
  (term: string) => `${term} mais vendido`,
];

const synonyms: Record<string, string[]> = {
  tenis: ['tenis de corrida', 'sneaker'], geladeira: ['refrigerador'], celular: ['smartphone'],
  fone: ['headphone', 'earbuds'], televisao: ['tv', 'smart tv'], furadeira: ['parafusadeira'],
  cachorro: ['cao', 'pet'], automovel: ['carro', 'veiculo'],
};

export function seasonalTerms(date = new Date(), horizonDays = 60) {
  const year = date.getFullYear();
  const events = [
    { month: 1, day: 10, terms: ['volta as aulas', 'organizacao', 'fitness'] },
    { month: 5, day: 10, terms: ['dia das maes'] },
    { month: 6, day: 12, terms: ['dia dos namorados', 'inverno', 'festa junina'] },
    { month: 8, day: 9, terms: ['dia dos pais'] },
    { month: 10, day: 12, terms: ['dia das criancas'] },
    { month: 11, day: 27, terms: ['black friday', 'preparacao para verao'] },
    { month: 12, day: 25, terms: ['natal', 'presente', 'verao'] },
  ];
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const end = start + Math.max(0, horizonDays) * 86_400_000;
  const terms: string[] = [];
  for (const event of events) {
    for (const candidateYear of [year, year + 1]) {
      const eventTime = new Date(candidateYear, event.month - 1, event.day).getTime();
      if (eventTime >= start && eventTime <= end) terms.push(...event.terms);
    }
  }
  return [...new Set(terms)];
}

export function expandKeyword(term: string, date = new Date(), limit = 12) {
  const clean = term.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const variations = [clean, ...purchaseModifiers.map((modifier) => modifier(clean))];
  for (const [word, replacements] of Object.entries(synonyms)) {
    if (!clean.toLocaleLowerCase('pt-BR').includes(word)) continue;
    variations.push(...replacements.map((replacement) => clean.replace(new RegExp(word, 'i'), replacement)));
  }
  variations.push(...seasonalTerms(date).map((season) => `${clean} ${season}`));
  return [...new Set(variations)].slice(0, limit);
}

export function catalogKeywords() {
  return keywordCatalog.flatMap((category) => category.keywords);
}

export type KeywordHistory = { term: string; searches: number; lastResultCount: number; lastSearchedAt: string };

export function chooseSearchKeyword(candidates: string[], history: KeywordHistory[], date = new Date()) {
  const unique = [...new Set(candidates.map((item) => item.trim()).filter(Boolean))];
  if (!unique.length) return 'ofertas';
  const historyByTerm = new Map(history.map((item) => [item.term.toLocaleLowerCase('pt-BR'), item]));
  return [...unique].sort((left, right) => {
    const a = historyByTerm.get(left.toLocaleLowerCase('pt-BR'));
    const b = historyByTerm.get(right.toLocaleLowerCase('pt-BR'));
    const aScore = (a?.lastResultCount ?? 1) * 4 - (a?.searches ?? 0) - (a ? 0 : 20);
    const bScore = (b?.lastResultCount ?? 1) * 4 - (b?.searches ?? 0) - (b ? 0 : 20);
    if (aScore !== bScore) return aScore - bScore;
    const daySeed = Math.floor(date.getTime() / 86_400_000);
    return ((unique.indexOf(left) + daySeed) % unique.length) - ((unique.indexOf(right) + daySeed) % unique.length);
  })[0];
}
