import { z } from "zod";
import type { WhatsAppAgent } from "@prisma/client";
import { db } from "./db.js";

export const agentRoles = [
  "SDR",
  "Closer assistido",
  "Atendimento",
  "Agendamento",
  "Suporte",
  "Recepção/triagem",
] as const;

export const agentObjectives = [
  "Agendar",
  "Qualificar",
  "Nutrir",
  "Recuperar contato",
  "Encaminhar ao humano",
  "Apoiar fechamento",
] as const;

export const agentTones = [
  "Amigável",
  "Formal",
  "Empático",
  "Direto",
  "Entusiasmado",
  "Consultivo",
  "Descontraído",
] as const;

export const agentNiches = [
  "Odontologia",
  "Estética",
  "Saúde privada",
  "Advocacia",
  "Imobiliárias",
  "Restaurantes e delivery",
  "Beleza",
  "Academias",
  "Educação",
  "Consultoria B2B",
] as const;

export const agentTools = [
  "Agenda / calendário",
  "Catálogo de produtos ou serviços",
  "CRM",
  "Link de pagamento",
  "Base de perguntas frequentes",
] as const;

const listField = z.array(z.string().trim().min(1).max(200)).max(30).default([]);

export const agentInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  companyName: z.string().trim().max(120).default(""),
  niche: z.string().trim().max(80).default(""),
  role: z.string().trim().max(40).default("Atendimento"),
  persona: z.string().trim().max(600).default(""),
  mission: z.string().trim().max(600).default(""),
  audience: z.string().trim().max(400).default(""),
  tone: listField,
  objectives: listField,
  qualifyingQuestions: listField,
  knowledgeBase: z.string().trim().max(8000).default(""),
  tools: listField,
  restrictions: z.string().trim().max(2000).default(""),
  humanHandoff: z.string().trim().max(1000).default(""),
  status: z.enum(["draft", "ready"]).default("draft"),
});
export type AgentInput = z.infer<typeof agentInputSchema>;

const globalSafetyRules = [
  "Nunca inventar dado ausente da base de conhecimento fornecida.",
  "Nunca afirmar que agendou, enviou, transferiu ou alterou algo sem confirmação real da ferramenta correspondente.",
  "Deixar claro quando estiver fazendo uma suposição em vez de repetir uma informação confirmada.",
  "Não garantir resultado, cura, aprovação ou prazo que não tenha sido informado pela empresa.",
  "Pedir apenas os dados pessoais necessários para o atendimento e explicar por que são solicitados.",
  "Fazer uma pergunta por vez sempre que isso deixar a conversa mais natural.",
  "Confirmar os dados críticos (nome, contato, data, valor) antes de concluir o atendimento.",
  "Em setores regulados (saúde, jurídico, financeiro), nunca diagnosticar, prescrever ou dar aconselhamento profissional não autorizado.",
];

function bulletList(items: string[], fallback: string) {
  const clean = items.map((item) => item.trim()).filter(Boolean);
  if (!clean.length) return `- ${fallback}`;
  return clean.map((item) => `- ${item}`).join("\n");
}

export function buildAgentPrompt(input: AgentInput) {
  const company = input.companyName || "a empresa";
  const niche = input.niche || "o segmento informado";
  const persona = input.persona || "um atendente virtual dedicado e cordial";
  const mission = input.mission || `apoiar ${company} no atendimento via WhatsApp`;
  const audience = input.audience || "clientes e potenciais clientes que entram em contato pelo WhatsApp";
  const tone = input.tone.length ? input.tone.join(", ") : "cordial e objetivo";
  const objectives = input.objectives.length ? input.objectives : ["Atender"];
  const tools = input.tools.length ? input.tools : ["Nenhuma ferramenta externa configurada ainda"];

  return `# Prompt operacional — ${input.name}

## 1. Identidade e missão
Você é ${input.name}, ${persona}, representando ${company} (${niche}) no atendimento por WhatsApp.
Sua missão é ${mission}, falando com ${audience}.
Função principal: ${input.role}. Objetivos deste agente: ${objectives.join(", ")}.

## 2. Princípios de atendimento
${bulletList(globalSafetyRules, "Seguir as boas práticas gerais de atendimento responsável.")}

## 3. Tom de voz e estilo das mensagens
- Tom: ${tone}.
- Mensagens curtas, divididas em blocos fáceis de ler no WhatsApp.
- Sem jargão técnico desnecessário; use o vocabulário do público de ${niche}.
- Emojis apenas se combinarem com o tom escolhido, sem exagero.

## 4. Fluxo principal
1. Cumprimentar, apresentar-se como ${input.name} e identificar o motivo do contato.
2. Fazer as perguntas de qualificação necessárias (uma por vez).
3. Consultar a base de conhecimento antes de responder dúvidas sobre preço, prazo ou política.
4. Conduzir para o objetivo definido (${objectives.join(", ").toLowerCase()}).
5. Confirmar os dados críticos com o cliente antes de encerrar ou transferir.
6. Encerrar com um próximo passo claro para o cliente.

## 5. Perguntas de qualificação
${bulletList(input.qualifyingQuestions, "Nenhuma pergunta de qualificação definida ainda — adicione ao menos uma antes de publicar.")}

## 6. Base de conhecimento
${input.knowledgeBase.trim() || "Nenhuma informação de base foi cadastrada ainda. Enquanto isso, o agente deve dizer que vai confirmar a informação com a equipe em vez de inventar respostas."}

## 7. Ferramentas necessárias
${bulletList(tools, "Nenhuma ferramenta externa configurada ainda.")}

## 8. Dúvidas, objeções e transferência humana
- Responder dúvidas apenas com base no que está na seção 6. Se não souber, informar que vai confirmar e retornar.
- Objeções devem ser tratadas com empatia, sem pressão ou manipulação.
- Transferir para um humano quando: ${input.humanHandoff.trim() || "houver reclamação, urgência, risco, pedido explícito do cliente ou assunto fora da base de conhecimento."}

## 9. Privacidade e dados mínimos
- Solicitar somente os dados necessários para concluir o atendimento.
- Nunca compartilhar dados de um cliente com outro.
- Informar, quando perguntado, que os dados são usados apenas para este atendimento.

## 10. Restrições inquebrantáveis
${bulletList(input.restrictions ? input.restrictions.split("\n") : [], "Nenhuma restrição adicional cadastrada — siga apenas os princípios gerais da seção 2.")}

## 11. Prompt resumido para implantação
"""
Você é ${input.name}, atendente de WhatsApp de ${company} (${niche}). Persona: ${persona}. Missão: ${mission}. Público: ${audience}. Tom: ${tone}. Função: ${input.role}. Objetivos: ${objectives.join(", ")}.
Regras: nunca invente dados fora da base de conhecimento; nunca afirme ter executado uma ação sem confirmação; faça uma pergunta por vez; peça apenas os dados necessários; transfira para um humano quando: ${input.humanHandoff.trim() || "houver reclamação, urgência ou assunto fora da base"}.
Base de conhecimento resumida: ${input.knowledgeBase.trim() ? input.knowledgeBase.trim().slice(0, 400) : "ainda não cadastrada."}
"""
`;
}

function toAgentRecord(row: WhatsAppAgent) {
  const parseList = (value: string) => {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as string[]) : [];
    } catch {
      return [];
    }
  };
  return {
    id: row.id,
    name: row.name,
    companyName: row.companyName,
    niche: row.niche,
    role: row.role,
    persona: row.persona,
    mission: row.mission,
    audience: row.audience,
    tone: parseList(row.tone),
    objectives: parseList(row.objectives),
    qualifyingQuestions: parseList(row.qualifyingQuestions),
    knowledgeBase: row.knowledgeBase,
    tools: parseList(row.tools),
    restrictions: row.restrictions,
    humanHandoff: row.humanHandoff,
    status: row.status,
    generatedPrompt: row.generatedPrompt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listAgents() {
  const rows = await db.whatsAppAgent.findMany({ orderBy: { updatedAt: "desc" } });
  return rows.map(toAgentRecord);
}

export async function getAgent(id: string) {
  const row = await db.whatsAppAgent.findUnique({ where: { id } });
  return row ? toAgentRecord(row) : null;
}

function serializeInput(input: AgentInput) {
  return {
    name: input.name,
    companyName: input.companyName,
    niche: input.niche,
    role: input.role,
    persona: input.persona,
    mission: input.mission,
    audience: input.audience,
    tone: JSON.stringify(input.tone),
    objectives: JSON.stringify(input.objectives),
    qualifyingQuestions: JSON.stringify(input.qualifyingQuestions),
    knowledgeBase: input.knowledgeBase,
    tools: JSON.stringify(input.tools),
    restrictions: input.restrictions,
    humanHandoff: input.humanHandoff,
    status: input.status,
    generatedPrompt: buildAgentPrompt(input),
  };
}

export async function createAgent(input: AgentInput) {
  const row = await db.whatsAppAgent.create({ data: serializeInput(input) });
  return toAgentRecord(row);
}

export async function updateAgent(id: string, input: AgentInput) {
  const existing = await db.whatsAppAgent.findUnique({ where: { id } });
  if (!existing) return null;
  const row = await db.whatsAppAgent.update({ where: { id }, data: serializeInput(input) });
  return toAgentRecord(row);
}

export async function deleteAgent(id: string) {
  const existing = await db.whatsAppAgent.findUnique({ where: { id } });
  if (!existing) return false;
  await db.whatsAppAgent.delete({ where: { id } });
  return true;
}
