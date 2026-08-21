import { useEffect, useState } from "react";
import {
  BarChart3,
  Bot,
  BrainCircuit,
  BriefcaseBusiness,
  Check,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Compass,
  Download,
  FileText,
  Gauge,
  Layers3,
  LoaderCircle,
  Megaphone,
  MessageSquareText,
  Pencil,
  Plus,
  Route,
  Sparkles,
  Target,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!response.ok)
    throw new Error(
      (await response.json().catch(() => ({}))).error ||
        "Não foi possível concluir.",
    );
  return response.status === 204 ? ({} as T) : response.json();
}

export type WhatsAppAgent = {
  id: string;
  name: string;
  companyName: string;
  niche: string;
  role: string;
  persona: string;
  mission: string;
  audience: string;
  tone: string[];
  objectives: string[];
  qualifyingQuestions: string[];
  knowledgeBase: string;
  tools: string[];
  restrictions: string;
  humanHandoff: string;
  status: "draft" | "ready";
  generatedPrompt: string;
  createdAt: string;
  updatedAt: string;
};

type AgentDraft = Omit<WhatsAppAgent, "id" | "generatedPrompt" | "createdAt" | "updatedAt">;

const roleOptions = ["SDR", "Closer assistido", "Atendimento", "Agendamento", "Suporte", "Recepção/triagem"];
const objectiveOptions = ["Agendar", "Qualificar", "Nutrir", "Recuperar contato", "Encaminhar ao humano", "Apoiar fechamento"];
const toneOptions = ["Amigável", "Formal", "Empático", "Direto", "Entusiasmado", "Consultivo", "Descontraído"];
const nicheOptions = [
  "Odontologia", "Estética", "Saúde privada", "Advocacia", "Imobiliárias",
  "Restaurantes e delivery", "Beleza", "Academias", "Educação", "Consultoria B2B",
];
const toolOptions = ["Agenda / calendário", "Catálogo de produtos ou serviços", "CRM", "Link de pagamento", "Base de perguntas frequentes"];

type CatalogAgent = {
  id: string;
  name: string;
  category: "Para começar" | "Especialistas avançados";
  eyebrow: string;
  description: string;
  outcome: string;
  icon: typeof Bot;
  color: string;
  inputs: string[];
  deliverables: string[];
  method: string[];
  suggestedPrompt: string;
  builder?: boolean;
};

const catalogAgents: CatalogAgent[] = [
  {
    id: "guide", name: "Guia Lico", category: "Para começar", eyebrow: "Roteador inteligente",
    description: "Entende seu objetivo, indica o especialista certo e prepara um pedido completo para você começar.",
    outcome: "Rota recomendada + prompt pronto", icon: Compass, color: "blue",
    inputs: ["Objetivo", "Estágio atual", "Nicho", "Restrições", "Entrega esperada"],
    deliverables: ["Agente recomendado", "Justificativa", "Prompt para copiar", "Próximos especialistas"],
    method: ["Entender o problema", "Identificar o ponto de entrada", "Montar a melhor sequência"],
    suggestedPrompt: "Quero ajuda para escolher o melhor especialista. Meu objetivo é [objetivo], estou no estágio [estágio] e atuo no nicho [nicho].",
  },
  {
    id: "business", name: "Arquiteto de Negócios IA", category: "Para começar", eyebrow: "Modelo, oferta e validação",
    description: "Transforma uma ideia ampla em uma oferta testável, com MVP, validação e plano para as primeiras vendas.",
    outcome: "Blueprint de negócio validável", icon: BriefcaseBusiness, color: "violet",
    inputs: ["Nicho e problema", "Solução pretendida", "Recursos e prazo", "Preço desejado"],
    deliverables: ["ICP e proposta de valor", "Oferta e escopo", "MVP", "Plano das primeiras 10 vendas"],
    method: ["Problema e cliente", "Oferta e MVP", "Validação", "Operação antes da escala"],
    suggestedPrompt: "Ajude-me a validar um negócio de IA para [nicho]. O problema é [problema], a solução imaginada é [solução] e tenho [prazo/recursos].",
  },
  {
    id: "builder", name: "Criador de Agentes", category: "Para começar", eyebrow: "Atendentes para WhatsApp",
    description: "Conduz um briefing guiado e gera as instruções operacionais completas de um agente seguro e implantável.",
    outcome: "Prompt operacional para WhatsApp", icon: Bot, color: "cyan", builder: true,
    inputs: ["Identidade e empresa", "Persona e missão", "Tom e objetivos", "Base e ferramentas"],
    deliverables: ["Fluxo de atendimento", "Qualificação", "Regras e handoff", "Prompt para copiar ou baixar"],
    method: ["Briefing em etapas", "Regras de segurança", "Revisão", "Exportação"],
    suggestedPrompt: "Quero criar um agente de WhatsApp para [empresa], no nicho [nicho], com a missão de [missão].",
  },
  {
    id: "niches", name: "Especialista em Nichos", category: "Para começar", eyebrow: "Mercado e posicionamento",
    description: "Compara mercados e conecta nicho, dor, solução, mecanismo e resultado em uma oferta específica.",
    outcome: "Ranking de nichos + oferta nichada", icon: Target, color: "green",
    inputs: ["Experiência", "Clientes atuais", "Ticket", "Canais", "Capacidade e objetivo"],
    deliverables: ["Ranking justificado", "Matriz de dores", "ICP", "Validação em 14 dias"],
    method: ["Avaliar atratividade", "Escolher a dor prioritária", "Especializar a oferta"],
    suggestedPrompt: "Compare os nichos [A, B e C] para minha oferta de [serviço]. Considere meu ticket de [valor] e experiência em [contexto].",
  },
  {
    id: "strategy", name: "Estrategista Lico", category: "Especialistas avançados", eyebrow: "Diagnóstico geral",
    description: "Encontra o gargalo dominante entre aquisição, entrega, gestão e modelo econômico e prioriza decisões.",
    outcome: "Plano estratégico de 14, 30 e 90 dias", icon: BrainCircuit, color: "indigo",
    inputs: ["Oferta e nicho", "Ticket e clientes", "Leads e verba", "Equipe, margem e capacidade"],
    deliverables: ["Diagnóstico", "Gargalo principal", "3 prioridades", "Plano 14/30/90"],
    method: ["Separar sintoma de causa", "Localizar o gargalo", "Priorizar por impacto"],
    suggestedPrompt: "Diagnostique o principal gargalo da minha operação. Hoje vendo [oferta], tenho [clientes/leads/equipe] e meu maior problema parece ser [problema].",
  },
  {
    id: "management", name: "Expert em Gestão", category: "Especialistas avançados", eyebrow: "Pessoas, processos e KPIs",
    description: "Organiza papéis, indicadores, rituais, cultura e delegação para reduzir a dependência do fundador.",
    outcome: "Sistema de gestão e delegação", icon: UsersRound, color: "amber",
    inputs: ["Equipe e líderes", "Processos", "Indicadores", "Rotinas", "Meta e margem"],
    deliverables: ["Organograma", "Responsabilidades", "KPIs por área", "Roadmap de delegação"],
    method: ["Medir dependência", "Distinguir pessoa de processo", "Definir responsável, prazo e ritual"],
    suggestedPrompt: "Ajude-me a reduzir minha dependência operacional. Minha equipe é [estrutura], eu gasto [horas] na operação e os processos atuais são [contexto].",
  },
  {
    id: "sales", name: "Expert em Vendas", category: "Especialistas avançados", eyebrow: "Pipeline e fechamento",
    description: "Mapeia vazamentos do lead à receita e cria roteiros, cadências, metas e rotinas comerciais.",
    outcome: "Operação comercial de 60 dias", icon: BarChart3, color: "emerald",
    inputs: ["Oferta e ICP", "Volume de leads", "Taxas por etapa", "Objeções", "CRM e meta"],
    deliverables: ["Mapa do funil", "3 alavancas", "Roteiros", "Follow-up e metas"],
    method: ["Medir cada etapa", "Localizar vazamento", "Executar alavancas em 14 dias"],
    suggestedPrompt: "Analise meu funil de vendas. Tenho [leads] por mês, [taxas por etapa], vendo [oferta] por [preço] e o gargalo parece estar em [etapa].",
  },
  {
    id: "funnels", name: "Expert em Funis", category: "Especialistas avançados", eyebrow: "Aquisição e conversão",
    description: "Conecta atração, captura, qualificação e conversão em uma oferta produtizada e replicável.",
    outcome: "Funil completo com checklist", icon: Layers3, color: "purple",
    inputs: ["Serviço atual", "Nicho", "Gargalo", "Jornada", "Dados e sistemas"],
    deliverables: ["Oferta produtizada", "Mapa do funil", "Papel da IA", "Checklist de implantação"],
    method: ["Diagnosticar fragmentação", "Desenhar etapas e critérios", "Validar antes de complexificar"],
    suggestedPrompt: "Desenhe um funil completo para [nicho] usando minha oferta [oferta]. Hoje atraio clientes por [canal] e o gargalo é [gargalo].",
  },
  {
    id: "traffic", name: "Expert em Tráfego", category: "Especialistas avançados", eyebrow: "Mídia paga e lucratividade",
    description: "Analisa atração, experiência e conversão para priorizar testes e escalar apenas quando a economia fecha.",
    outcome: "Diagnóstico + plano de testes", icon: Gauge, color: "orange",
    inputs: ["Plataforma e período", "Orçamento", "Métricas", "Receita e margem", "Funil"],
    deliverables: ["Elo mais fraco", "Matriz de decisão", "Testes A/B", "Plano de escala"],
    method: ["Atração", "Experiência pós-clique", "Conversão", "Teste com critério de parada"],
    suggestedPrompt: "Analise minha campanha de [plataforma]. No período [período], investi [valor] e obtive [métricas, vendas e receita].",
  },
  {
    id: "copy", name: "Copywriter de Performance", category: "Especialistas avançados", eyebrow: "Anúncios e mensagens",
    description: "Cria copy de resposta direta com um ângulo e mecanismo por peça, sem inventar provas ou promessas.",
    outcome: "6 ângulos prontos para testar", icon: Megaphone, color: "rose",
    inputs: ["Nicho", "Mecanismo", "Promessa", "Dores e objeções", "Canal e formato"],
    deliverables: ["Headlines e textos", "CTAs", "Direção visual", "Hipóteses de teste"],
    method: ["Coletar briefing", "Escolher um ângulo", "Adaptar à consciência", "Definir métrica"],
    suggestedPrompt: "Crie uma rodada de anúncios para [nicho]. Minha oferta é [oferta], o mecanismo é [mecanismo], a prova real é [prova] e o canal é [canal].",
  },
  {
    id: "proposal", name: "Gerador de Propostas", category: "Especialistas avançados", eyebrow: "Oferta comercial",
    description: "Transforma diagnóstico e escopo em uma proposta comercial clara, com investimento, premissas e próximos passos.",
    outcome: "Proposta pronta para revisão", icon: FileText, color: "slate",
    inputs: ["Remetente e cliente", "Problema e objetivo", "Escopo", "Implantação e mensalidade", "Prazo"],
    deliverables: ["Contexto e solução", "Escopo e cronograma", "Investimento", "Premissas e validade"],
    method: ["Confirmar oferta", "Traduzir recursos em benefícios", "Separar implantação, recorrência e mídia"],
    suggestedPrompt: "Crie uma proposta para [cliente/segmento] resolver [problema] com [agente ou funil]. O escopo é [escopo] e o investimento é [valores].",
  },
];

const blankDraft = (): AgentDraft => ({
  name: "",
  companyName: "",
  niche: "",
  role: "Atendimento",
  persona: "",
  mission: "",
  audience: "",
  tone: [],
  objectives: [],
  qualifyingQuestions: [],
  knowledgeBase: "",
  tools: [],
  restrictions: "",
  humanHandoff: "",
  status: "draft",
});

function toggleItem(list: string[], value: string) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function ChipPicker({
  options,
  selected,
  onToggle,
  allowCustom,
  customValue,
  onCustomChange,
  onCustomAdd,
}: {
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  allowCustom?: boolean;
  customValue?: string;
  onCustomChange?: (value: string) => void;
  onCustomAdd?: () => void;
}) {
  return (
    <div className="weekday-picker chip-picker">
      {options.map((option) => (
        <button
          type="button"
          key={option}
          title={`${selected.includes(option) ? "Remover" : "Adicionar"} ${option}`}
          className={selected.includes(option) ? "selected" : ""}
          onClick={() => onToggle(option)}
        >
          {option}
        </button>
      ))}
      {selected.filter((item) => !options.includes(item)).map((custom) => (
        <button type="button" key={custom} className="selected" onClick={() => onToggle(custom)} title={`Remover ${custom}`}>
          {custom}
        </button>
      ))}
      {allowCustom && (
        <span className="chip-custom">
          <input
            placeholder="Outro..."
            value={customValue}
            onChange={(event) => onCustomChange?.(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onCustomAdd?.();
              }
            }}
          />
          <button type="button" className="secondary" onClick={() => onCustomAdd?.()}>
            <Plus />
          </button>
        </span>
      )}
    </div>
  );
}

function PromptModal({ agent, close }: { agent: WhatsAppAgent; close: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(agent.generatedPrompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };
  const download = () => {
    const blob = new Blob([agent.generatedPrompt], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${agent.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") || "agente-whatsapp"}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <section className="product-modal prompt-modal" role="dialog" aria-modal="true" aria-label={`Prompt de ${agent.name}`}>
        <button title="Fechar" className="modal-close" onClick={close}><X /></button>
        <div className="prompt-view">
          <div className="prompt-view-head">
            <div>
              <span className="niche">Prompt operacional</span>
              <h2>{agent.name}</h2>
            </div>
            <div className="form-actions">
              <button className="secondary" onClick={() => void copy()}>
                {copied ? <Check /> : <Clipboard />} {copied ? "Copiado" : "Copiar"}
              </button>
              <button className="secondary" onClick={download}><Download /> Baixar .md</button>
            </div>
          </div>
          <pre>{agent.generatedPrompt}</pre>
        </div>
      </section>
    </div>
  );
}

function AgentCard({
  agent,
  edit,
  remove,
  view,
  busy,
}: {
  agent: WhatsAppAgent;
  edit: () => void;
  remove: () => void;
  view: () => void;
  busy: boolean;
}) {
  return (
    <article className="module-card agent-card">
      <div className="card-heading">
        <span className="round-icon"><Bot /></span>
        <div>
          <h3>{agent.name}</h3>
          <p>{agent.companyName || "Empresa não informada"} · {agent.niche || "Nicho livre"}</p>
        </div>
        <b className={agent.status === "ready" ? "status-ok" : "status-wait"}>
          {agent.status === "ready" ? "PRONTO" : "RASCUNHO"}
        </b>
      </div>
      <p className="card-note agent-role">{agent.role} · {agent.objectives.length ? agent.objectives.join(", ") : "Sem objetivos definidos"}</p>
      <p className="card-note">Atualizado em {new Date(agent.updatedAt).toLocaleString("pt-BR")}</p>
      <div className="form-actions">
        <button className="secondary" onClick={view}><MessageSquareText /> Ver prompt</button>
        <button className="secondary" onClick={edit}><Pencil /> Editar</button>
        <button className="danger-icon agent-delete" disabled={busy} onClick={remove} title="Excluir agente">
          {busy ? <LoaderCircle className="spin" /> : <Trash2 />}
        </button>
      </div>
    </article>
  );
}

function CatalogModal({ agent, close, openBuilder }: { agent: CatalogAgent; close: () => void; openBuilder: () => void }) {
  const [copied, setCopied] = useState(false);
  const copyPrompt = async () => {
    await navigator.clipboard.writeText(agent.suggestedPrompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };
  const Icon = agent.icon;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section className="product-modal catalog-modal" role="dialog" aria-modal="true" aria-label={agent.name}>
        <button title="Fechar" className="modal-close" onClick={close}><X /></button>
        <header className="catalog-modal-head">
          <span className={`catalog-icon ${agent.color}`}><Icon /></span>
          <div><span className="niche">{agent.eyebrow}</span><h2>{agent.name}</h2><p>{agent.description}</p></div>
        </header>
        <div className="catalog-detail-grid">
          <div><b>O que preciso informar</b><ul>{agent.inputs.map((item) => <li key={item}>{item}</li>)}</ul></div>
          <div><b>O que você recebe</b><ul>{agent.deliverables.map((item) => <li key={item}>{item}</li>)}</ul></div>
        </div>
        <div className="catalog-method"><b>Como funciona</b><div>{agent.method.map((item, index) => <span key={item}><i>{index + 1}</i>{item}</span>)}</div></div>
        <div className="prompt-suggestion">
          <span><Sparkles /> Prompt para começar</span>
          <p>{agent.suggestedPrompt}</p>
          <button className="secondary" onClick={() => void copyPrompt()}>{copied ? <Check /> : <Clipboard />}{copied ? "Copiado" : "Copiar prompt"}</button>
        </div>
        <div className="catalog-modal-actions">
          <p>Orientação estratégica não substitui validação profissional nem garante resultados.</p>
          {agent.builder ? <button className="run" onClick={openBuilder}><Bot /> Abrir construtor</button> : <button className="run" onClick={() => void copyPrompt()}><MessageSquareText /> Preparar conversa</button>}
        </div>
      </section>
    </div>
  );
}

function AgentCatalog({ openBuilder }: { openBuilder: () => void }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CatalogAgent | null>(null);
  const filtered = catalogAgents.filter((agent) => `${agent.name} ${agent.eyebrow} ${agent.description} ${agent.outcome}`.toLowerCase().includes(query.toLowerCase()));
  const categories: CatalogAgent["category"][] = ["Para começar", "Especialistas avançados"];
  return (
    <>
      <section className="agents-hero">
        <div>
          <span className="agents-kicker"><Sparkles /> Estratégia guiada por especialistas</span>
          <h1>Um time de IA para cada etapa do seu negócio.</h1>
          <p>Escolha um especialista ou deixe o Guia Lico montar a melhor sequência — do nicho e da oferta até aquisição, vendas e gestão.</p>
          <div className="agents-hero-actions">
            <button className="run" onClick={() => setSelected(catalogAgents[0])}><Route /> Descobrir por onde começar</button>
            <button className="secondary" onClick={openBuilder}><Bot /> Criar agente de WhatsApp</button>
          </div>
        </div>
        <div className="agents-route" aria-label="Jornada dos agentes">
          <span>01 <b>Estratégia</b></span><ChevronRight />
          <span>02 <b>Oferta</b></span><ChevronRight />
          <span>03 <b>Aquisição</b></span><ChevronRight />
          <span>04 <b>Escala</b></span>
        </div>
      </section>
      <div className="catalog-toolbar">
        <div><h3>Catálogo de especialistas</h3><p>11 agentes com escopos e entregas bem definidos</p></div>
        <label><span>Buscar especialista</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ex.: vendas, tráfego, nicho..." /></label>
      </div>
      {categories.map((category) => {
        const agents = filtered.filter((agent) => agent.category === category);
        if (!agents.length) return null;
        return (
          <section className="catalog-section" key={category}>
            <div className="catalog-section-title"><span>{category === "Para começar" ? "01" : "02"}</span><div><h3>{category}</h3><p>{category === "Para começar" ? "Defina o caminho, valide sua ideia e construa seu primeiro agente." : "Aprofunde estratégia, operação, aquisição, conversão e crescimento."}</p></div></div>
            <div className="catalog-grid">
              {agents.map((agent) => {
                const Icon = agent.icon;
                return (
                  <button className="catalog-card" onClick={() => setSelected(agent)} key={agent.id}>
                    <div className="catalog-card-top"><span className={`catalog-icon ${agent.color}`}><Icon /></span><ChevronRight /></div>
                    <span className="catalog-eyebrow">{agent.eyebrow}</span>
                    <h4>{agent.name}</h4><p>{agent.description}</p>
                    <div className="catalog-outcome"><Check /><span><small>Entrega central</small><b>{agent.outcome}</b></span></div>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
      {!filtered.length && <div className="empty"><Bot /><h3>Nenhum especialista encontrado</h3><p>Tente buscar por outra etapa ou resultado.</p></div>}
      <section className="agents-safety"><BrainCircuit /><div><b>Diagnóstico antes da prescrição</b><p>Os agentes pedem contexto, deixam hipóteses claras, não inventam dados e nunca prometem vendas, lucro ou execução sem confirmação.</p></div></section>
      {selected && <CatalogModal agent={selected} close={() => setSelected(null)} openBuilder={() => { setSelected(null); openBuilder(); }} />}
    </>
  );
}

export function LicoAgentsPage() {
  const [tab, setTab] = useState<"catalog" | "list" | "builder">("catalog");
  const [agents, setAgents] = useState<WhatsAppAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [viewing, setViewing] = useState<WhatsAppAgent | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AgentDraft>(blankDraft());
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [customTone, setCustomTone] = useState("");
  const [customTool, setCustomTool] = useState("");
  const [newQuestion, setNewQuestion] = useState("");
  const [customNiche, setCustomNiche] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setAgents(await api<WhatsAppAgent[]>("/lico-agents"));
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const steps = [
    "Identidade",
    "Persona e missão",
    "Tom e objetivos",
    "Qualificação e base",
    "Ferramentas e regras",
    "Revisão",
  ];

  const startCreate = () => {
    setEditingId(null);
    setDraft(blankDraft());
    setStep(0);
    setCustomNiche(false);
    setTab("builder");
  };
  const startEdit = (agent: WhatsAppAgent) => {
    setEditingId(agent.id);
    setDraft({
      name: agent.name,
      companyName: agent.companyName,
      niche: agent.niche,
      role: agent.role,
      persona: agent.persona,
      mission: agent.mission,
      audience: agent.audience,
      tone: agent.tone,
      objectives: agent.objectives,
      qualifyingQuestions: agent.qualifyingQuestions,
      knowledgeBase: agent.knowledgeBase,
      tools: agent.tools,
      restrictions: agent.restrictions,
      humanHandoff: agent.humanHandoff,
      status: agent.status,
    });
    setCustomNiche(!!agent.niche && !nicheOptions.includes(agent.niche));
    setStep(0);
    setTab("builder");
  };

  const removeAgent = async (agent: WhatsAppAgent) => {
    if (!window.confirm(`Excluir definitivamente o agente “${agent.name}”?`)) return;
    setDeletingId(agent.id);
    try {
      await api(`/lico-agents/${agent.id}`, { method: "DELETE" });
      setNotice(`Agente “${agent.name}” excluído.`);
      await load();
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setDeletingId(null);
    }
  };

  const addQuestion = () => {
    const value = newQuestion.trim();
    if (!value) return;
    setDraft({ ...draft, qualifyingQuestions: [...draft.qualifyingQuestions, value] });
    setNewQuestion("");
  };

  const save = async (status: "draft" | "ready") => {
    if (!draft.name.trim()) {
      setNotice("Informe o nome do agente antes de salvar.");
      setStep(0);
      return;
    }
    setSaving(true);
    try {
      const payload = { ...draft, status };
      const saved = await api<WhatsAppAgent>(editingId ? `/lico-agents/${editingId}` : "/lico-agents", {
        method: editingId ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      await load();
      setNotice(`Agente “${saved.name}” salvo com o prompt operacional gerado.`);
      setViewing(saved);
      setTab("list");
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="hub-tabs">
        <button className={tab === "catalog" ? "active" : ""} onClick={() => setTab("catalog")}>Especialistas</button>
        <button className={tab === "list" ? "active" : ""} onClick={() => setTab("list")}>Meus agentes</button>
        <button className={tab === "builder" ? "active" : ""} onClick={() => (tab === "builder" ? undefined : startCreate())}>
          {editingId && tab !== "builder" ? "Continuar edição" : "Criar agente"}
        </button>
      </div>
      {notice && (
        <div className="notice">
          <Sparkles />
          {notice}
          <button title="Fechar mensagem" onClick={() => setNotice("")}><X /></button>
        </div>
      )}
      {tab === "catalog" && <AgentCatalog openBuilder={startCreate} />}
      {tab === "list" && (
        <>
          <div className="module-title">
            <h3>Agentes de WhatsApp</h3>
            <p>Monte o prompt operacional de um atendente de WhatsApp em poucos passos e reutilize sempre que quiser</p>
          </div>
          <button className="run" onClick={startCreate}><Plus /> Novo agente</button>
          {loading ? (
            <div className="empty compact"><LoaderCircle className="spin" /></div>
          ) : agents.length ? (
            <section className="agent-grid">
              {agents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  busy={deletingId === agent.id}
                  view={() => setViewing(agent)}
                  edit={() => startEdit(agent)}
                  remove={() => void removeAgent(agent)}
                />
              ))}
            </section>
          ) : (
            <div className="empty">
              <Bot />
              <h3>Nenhum agente criado ainda</h3>
              <p>Clique em “Novo agente” para montar seu primeiro atendente de WhatsApp.</p>
            </div>
          )}
        </>
      )}
      {tab === "builder" && (
        <section className="module-card agent-wizard">
          <div className="wizard-steps">
            {steps.map((label, index) => (
              <button
                type="button"
                key={label}
                className={index === step ? "active" : index < step ? "done" : ""}
                onClick={() => setStep(index)}
              >
                <span>{index < step ? <Check /> : index + 1}</span>
                {label}
              </button>
            ))}
          </div>

          {step === 0 && (
            <div className="form-grid wizard-panel">
              <label>Nome do agente
                <input placeholder="Ex.: Clara, a recepcionista virtual" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </label>
              <label>Nome da empresa
                <input placeholder="Ex.: Clínica Sorriso Pleno" value={draft.companyName} onChange={(e) => setDraft({ ...draft, companyName: e.target.value })} />
              </label>
              <label>Nicho
                {customNiche ? (
                  <input placeholder="Descreva o nicho" value={draft.niche} onChange={(e) => setDraft({ ...draft, niche: e.target.value })} />
                ) : (
                  <select value={draft.niche} onChange={(e) => (e.target.value === "__custom" ? setCustomNiche(true) : setDraft({ ...draft, niche: e.target.value }))}>
                    <option value="">Selecione um nicho</option>
                    {nicheOptions.map((option) => <option key={option}>{option}</option>)}
                    <option value="__custom">Outro nicho...</option>
                  </select>
                )}
              </label>
              <label>Função principal
                <select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })}>
                  {roleOptions.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
            </div>
          )}

          {step === 1 && (
            <div className="form-grid wizard-panel">
              <label className="wizard-full">Persona (profissão, experiência e personalidade)
                <textarea rows={3} placeholder="Ex.: recepcionista experiente, atenciosa e objetiva, que já trabalhou 8 anos em clínicas odontológicas" value={draft.persona} onChange={(e) => setDraft({ ...draft, persona: e.target.value })} />
              </label>
              <label className="wizard-full">Missão e resultado esperado
                <textarea rows={3} placeholder="Ex.: acolher o paciente, tirar dúvidas administrativas e confirmar o agendamento de avaliação" value={draft.mission} onChange={(e) => setDraft({ ...draft, mission: e.target.value })} />
              </label>
              <label className="wizard-full">Público que o agente atende
                <textarea rows={2} placeholder="Ex.: pacientes novos e atuais que entram em contato pelo WhatsApp da clínica" value={draft.audience} onChange={(e) => setDraft({ ...draft, audience: e.target.value })} />
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="wizard-panel">
              <b>Tom de voz</b>
              <ChipPicker
                options={toneOptions}
                selected={draft.tone}
                onToggle={(value) => setDraft({ ...draft, tone: toggleItem(draft.tone, value) })}
                allowCustom
                customValue={customTone}
                onCustomChange={setCustomTone}
                onCustomAdd={() => {
                  if (!customTone.trim()) return;
                  setDraft({ ...draft, tone: [...draft.tone, customTone.trim()] });
                  setCustomTone("");
                }}
              />
              <b>Objetivos deste agente</b>
              <ChipPicker
                options={objectiveOptions}
                selected={draft.objectives}
                onToggle={(value) => setDraft({ ...draft, objectives: toggleItem(draft.objectives, value) })}
              />
            </div>
          )}

          {step === 3 && (
            <div className="wizard-panel">
              <b>Perguntas de qualificação</b>
              <p className="card-note">Uma pergunta por vez ajuda o agente a entender o que o cliente precisa antes de responder.</p>
              <div className="search-rules">
                {draft.qualifyingQuestions.map((question, index) => (
                  <div className="search-rule qualifying-row" key={`${question}-${index}`}>
                    <span>{index + 1}</span>
                    <input
                      value={question}
                      onChange={(e) => setDraft({
                        ...draft,
                        qualifyingQuestions: draft.qualifyingQuestions.map((item, itemIndex) => itemIndex === index ? e.target.value : item),
                      })}
                    />
                    <button className="danger-icon" title="Remover pergunta" onClick={() => setDraft({ ...draft, qualifyingQuestions: draft.qualifyingQuestions.filter((_, itemIndex) => itemIndex !== index) })}>
                      <Trash2 />
                    </button>
                  </div>
                ))}
                <div className="link-entry">
                  <input placeholder="Ex.: Qual procedimento você tem interesse em avaliar?" value={newQuestion} onChange={(e) => setNewQuestion(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addQuestion(); } }} />
                  <button className="secondary" onClick={addQuestion}><Plus /> Adicionar</button>
                </div>
              </div>
              <label className="wizard-block">Base de conhecimento (horários, preços, políticas, perguntas frequentes)
                <textarea rows={8} placeholder="Cole aqui as informações que o agente pode usar para responder: horário de funcionamento, endereço, formas de pagamento, políticas de cancelamento, principais dúvidas..." value={draft.knowledgeBase} onChange={(e) => setDraft({ ...draft, knowledgeBase: e.target.value })} />
              </label>
            </div>
          )}

          {step === 4 && (
            <div className="wizard-panel">
              <b>Ferramentas que o agente vai usar</b>
              <ChipPicker
                options={toolOptions}
                selected={draft.tools}
                onToggle={(value) => setDraft({ ...draft, tools: toggleItem(draft.tools, value) })}
                allowCustom
                customValue={customTool}
                onCustomChange={setCustomTool}
                onCustomAdd={() => {
                  if (!customTool.trim()) return;
                  setDraft({ ...draft, tools: [...draft.tools, customTool.trim()] });
                  setCustomTool("");
                }}
              />
              <label className="wizard-block">Restrições inquebrantáveis (uma por linha)
                <textarea rows={4} placeholder={"Ex.: nunca prometer prazo de resultado\nnunca falar de preço de concorrente"} value={draft.restrictions} onChange={(e) => setDraft({ ...draft, restrictions: e.target.value })} />
              </label>
              <label className="wizard-block">Quando transferir para um humano
                <textarea rows={3} placeholder="Ex.: reclamações, urgências, pedidos de cancelamento ou qualquer assunto fora da base de conhecimento" value={draft.humanHandoff} onChange={(e) => setDraft({ ...draft, humanHandoff: e.target.value })} />
              </label>
            </div>
          )}

          {step === 5 && (
            <div className="wizard-panel wizard-review">
              <b>Resumo do agente</b>
              <dl className="review-list">
                <div><dt>Nome</dt><dd>{draft.name || "—"}</dd></div>
                <div><dt>Empresa</dt><dd>{draft.companyName || "—"}</dd></div>
                <div><dt>Nicho</dt><dd>{draft.niche || "—"}</dd></div>
                <div><dt>Função</dt><dd>{draft.role}</dd></div>
                <div><dt>Tom de voz</dt><dd>{draft.tone.join(", ") || "—"}</dd></div>
                <div><dt>Objetivos</dt><dd>{draft.objectives.join(", ") || "—"}</dd></div>
                <div><dt>Perguntas de qualificação</dt><dd>{draft.qualifyingQuestions.length}</dd></div>
                <div><dt>Ferramentas</dt><dd>{draft.tools.join(", ") || "—"}</dd></div>
              </dl>
              <p className="card-note">Ao salvar, o prompt operacional completo é gerado automaticamente com identidade, tom, fluxo, perguntas, base de conhecimento, ferramentas, transferência humana, privacidade e restrições — pronto para copiar ou baixar.</p>
              <div className="form-actions">
                <button className="secondary" disabled={saving} onClick={() => void save("draft")}>
                  {saving ? <LoaderCircle className="spin" /> : <Pencil />} Salvar como rascunho
                </button>
                <button className="run" disabled={saving} onClick={() => void save("ready")}>
                  {saving ? <LoaderCircle className="spin" /> : <Sparkles />} Gerar prompt e finalizar
                </button>
              </div>
            </div>
          )}

          <div className="wizard-nav">
            <button className="secondary" disabled={step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))}>
              <ChevronLeft /> Voltar
            </button>
            {step < steps.length - 1 && (
              <button className="run" onClick={() => setStep((current) => Math.min(steps.length - 1, current + 1))}>
                Avançar <ChevronRight />
              </button>
            )}
          </div>
        </section>
      )}
      {viewing && <PromptModal agent={viewing} close={() => setViewing(null)} />}
    </>
  );
}
