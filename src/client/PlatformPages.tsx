import { useCallback, useEffect, useState } from "react";
import {
  BadgeDollarSign,
  BarChart3,
  Bot,
  CalendarClock,
  Check,
  CircleHelp,
  CreditCard,
  ExternalLink,
  Link2,
  LoaderCircle,
  MessageCircle,
  Plus,
  Save,
  Send,
  ShieldCheck,
  Store,
  Trash2,
  UserRound,
  X,
} from "lucide-react";

export type Platform = {
  profile: {
    firstName: string;
    lastName: string;
    countryCode: string;
    areaCode: string;
    phone: string;
    taxId: string;
    acceptedTerms: boolean;
    marketingConsent: boolean;
  };
  networks: Array<{
    id: string;
    name: string;
    configured: boolean;
    affiliateId: string;
    trackingId: string;
    storeName: string;
    hasApiKey: boolean;
    hasSecret: boolean;
  }>;
  messaging: {
    telegram: { botUsername: string; channelId: string; configured: boolean };
    whatsapp: {
      phoneNumber: string;
      phoneNumberId: string;
      businessAccountId: string;
      testRecipient: string;
      configured: boolean;
    };
  };
  channels: Array<{
    id: string;
    name: string;
    type: "telegram" | "whatsapp";
    externalId: string;
    enabled: boolean;
  }>;
  subscription: { plan: string; status: string; billing: string };
};
type Distribution = {
  id: string;
  status: string;
  message: string;
  scheduledAt?: string;
  publishedAt?: string;
  lastError?: string;
  offer: {
    id: string;
    title: string;
    imageUrl?: string;
    affiliateUrl?: string;
  };
  channel: { id: string; name: string; type: string } | null;
};
type DistributionCampaign = {
  id: string;
  name: string;
  status: "scheduled" | "running" | "paused" | "completed" | "completed_with_errors" | "cancelled";
  offerCount: number;
  intervalMinutes: number;
  scheduledAt: string;
  createdAt: string;
  totalMessages: number;
  sent: number;
  failed: number;
  pending: number;
  cancelled: number;
  channels: Array<{ id: string; name: string; type: string }>;
  nextJob?: Distribution | null;
  jobs: Distribution[];
};
type DistributableOffer = {
  id: string;
  title: string;
  imageUrl?: string;
  originalUrl: string;
  affiliateUrl?: string;
  currentPrice: number;
  previousPrice?: number;
  discountPercent?: number;
  rating?: number;
  reviewCount?: number;
  commissionPercent?: number;
  extraCommissionPercent?: number;
  estimatedCommission?: number;
  shipping?: string;
  freeShipping?: boolean;
  score: number;
  status: string;
  store?: { name: string };
  niche?: { name: string };
};
type DistributableOfferDetail = DistributableOffer & {
  galleryImages?: string[];
  seller?: string;
  stock?: number;
};

const formatBrl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

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
const Field = ({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) => (
  <label>
    {label}
    <input {...props} />
  </label>
);
const PageTitle = ({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) => (
  <div className="module-title">
    <h3>{title}</h3>
    <p>{subtitle}</p>
  </div>
);

export function ProfilePage({
  platform,
  reload,
  notice,
}: {
  platform: Platform;
  reload: () => Promise<void>;
  notice: (s: string) => void;
}) {
  const [form, setForm] = useState(platform.profile);
  useEffect(() => setForm(platform.profile), [platform]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api("/profile", { method: "PATCH", body: JSON.stringify(form) });
      notice("Dados da conta salvos.");
      await reload();
    } catch (err) {
      notice((err as Error).message);
    }
  };
  return (
    <>
      <PageTitle
        title="Minha conta"
        subtitle="Dados do responsável e consentimentos da plataforma"
      />
      <form className="module-card form-grid" onSubmit={save}>
        <Field
          label="Nome"
          value={form.firstName}
          onChange={(e) => setForm({ ...form, firstName: e.target.value })}
        />
        <Field
          label="Sobrenome"
          value={form.lastName}
          onChange={(e) => setForm({ ...form, lastName: e.target.value })}
        />
        <Field
          label="Código do país"
          value={form.countryCode}
          onChange={(e) => setForm({ ...form, countryCode: e.target.value })}
        />
        <Field
          label="DDD"
          value={form.areaCode}
          onChange={(e) => setForm({ ...form, areaCode: e.target.value })}
        />
        <Field
          label="Telefone / WhatsApp"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
        <Field
          label="CPF ou CNPJ"
          value={form.taxId}
          onChange={(e) => setForm({ ...form, taxId: e.target.value })}
        />
        <label className="check-row">
          <input
            type="checkbox"
            checked={form.acceptedTerms}
            onChange={(e) =>
              setForm({ ...form, acceptedTerms: e.target.checked })
            }
          />{" "}
          Aceito os termos de uso e a política de privacidade.
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={form.marketingConsent}
            onChange={(e) =>
              setForm({ ...form, marketingConsent: e.target.checked })
            }
          />{" "}
          Aceito receber avisos importantes da plataforma.
        </label>
        <button className="primary">
          <Save /> Salvar dados
        </button>
      </form>
    </>
  );
}

export function NetworksPage({
  platform,
  reload,
  notice,
}: {
  platform: Platform;
  reload: () => Promise<void>;
  notice: (s: string) => void;
}) {
  return (
    <>
      <PageTitle
        title="Contas de afiliado"
        subtitle="Configure cada rede no seu tempo; credenciais sensíveis ficam criptografadas"
      />
      <section className="network-grid">
        {platform.networks.map((network) => (
          <NetworkCard
            key={network.id}
            network={network}
            reload={reload}
            notice={notice}
          />
        ))}
      </section>
    </>
  );
}
function NetworkCard({
  network,
  reload,
  notice,
}: {
  network: Platform["networks"][number];
  reload: () => Promise<void>;
  notice: (s: string) => void;
}) {
  const [form, setForm] = useState({
    affiliateId: network.affiliateId,
    trackingId: network.trackingId,
    storeName: network.storeName,
    apiKey: "",
    secret: "",
  });
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api(`/affiliate-networks/${network.id}`, {
        method: "PATCH",
        body: JSON.stringify(form),
      });
      notice(`${network.name}: configuração salva com segurança.`);
      await reload();
    } catch (err) {
      notice((err as Error).message);
    }
  };
  return (
    <form className="module-card network-card" onSubmit={save}>
      <div className="card-heading">
        <span className="brand-icon">
          <img src={`/brands/${network.id}.svg`} alt="" />
        </span>
        <div>
          <h3>{network.name}</h3>
          <p>
            {network.configured
              ? "Configuração disponível"
              : "Aguardando configuração"}
          </p>
        </div>
        <b className={network.configured ? "status-ok" : "status-wait"}>
          {network.configured ? "ATIVA" : "CONFIGURAR"}
        </b>
      </div>
      <Field
        label="ID de afiliado"
        placeholder="Informe quando estiver disponível"
        value={form.affiliateId}
        onChange={(e) => setForm({ ...form, affiliateId: e.target.value })}
      />
      <Field
        label="ID de rastreamento / tag"
        value={form.trackingId}
        onChange={(e) => setForm({ ...form, trackingId: e.target.value })}
      />
      <Field
        label="Nome da loja"
        value={form.storeName}
        onChange={(e) => setForm({ ...form, storeName: e.target.value })}
      />
      {network.id !== "mercado_livre" && (
        <>
          <Field
            label={`Chave da API${network.hasApiKey ? " (já cadastrada)" : ""}`}
            type="password"
            value={form.apiKey}
            onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
          />
          <Field
            label={`Segredo${network.hasSecret ? " (já cadastrado)" : ""}`}
            type="password"
            value={form.secret}
            onChange={(e) => setForm({ ...form, secret: e.target.value })}
          />
        </>
      )}
      <button className="secondary">
        <Save /> Salvar configuração
      </button>
      {network.id === "mercado_livre" && (
        <p className="card-note">
          A autorização oficial OAuth é gerenciada na tela Integrações.
        </p>
      )}
    </form>
  );
}

type WhatsAppWebState = {
  status:
    | "idle"
    | "starting"
    | "qr"
    | "authenticated"
    | "ready"
    | "disconnected"
    | "error";
  qrDataUrl: string;
  error: string;
  connectedNumber: string;
  groupsCount: number;
};
type WhatsAppGroup = { id: string; name: string };
function WhatsAppWebConnect({
  notice,
  reload,
}: {
  notice: (s: string) => void;
  reload: () => Promise<void>;
}) {
  const [state, setState] = useState<WhatsAppWebState>({
    status: "idle",
    qrDataUrl: "",
    error: "",
    connectedNumber: "",
    groupsCount: 0,
  });
  const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
  const [groupId, setGroupId] = useState("");
  const [newGroupName, setNewGroupName] = useState("Lico Primos");
  const [participants, setParticipants] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const next = await api<WhatsAppWebState>("/whatsapp-web/status");
      setState(next);
      if (next.status === "ready") {
        const list = await api<WhatsAppGroup[]>("/whatsapp-web/groups");
        setGroups(list);
        setGroupId((current) => current || list[0]?.id || "");
      }
    } catch {
      /* próxima tentativa atualiza */
    }
  }, []);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 2000);
    return () => window.clearInterval(timer);
  }, [load]);
  const connect = async () => {
    setBusy(true);
    try {
      await api("/whatsapp-web/connect", { method: "POST" });
      notice("Preparando o QR Code do WhatsApp…");
      await load();
    } catch (err) {
      notice((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const test = async () => {
    if (!groupId) return;
    setBusy(true);
    try {
      await api("/whatsapp-web/test", {
        method: "POST",
        body: JSON.stringify({ groupId }),
      });
      notice("Mensagem de teste enviada ao grupo selecionado.");
    } catch (err) {
      notice((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const createGroup = async () => {
    const numbers = participants
      .split(/[\n,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (!newGroupName.trim() || !numbers.length) {
      notice("Informe o nome e ao menos um participante com DDI e DDD.");
      return;
    }
    if (
      !window.confirm(
        `Criar o grupo “${newGroupName.trim()}” com somente administradores autorizados a enviar mensagens?`,
      )
    )
      return;
    setBusy(true);
    try {
      const result = await api<{ group: { id: string; name: string } }>(
        "/whatsapp-web/groups",
        {
          method: "POST",
          body: JSON.stringify({
            name: newGroupName.trim(),
            participants: numbers,
          }),
        },
      );
      await load();
      await reload();
      setGroupId(result.group.id);
      setParticipants("");
      notice(
        `Grupo “${result.group.name}” criado. Somente administradores podem enviar mensagens, editar dados ou adicionar membros.`,
      );
    } catch (err) {
      notice((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const disconnect = async () => {
    if (!window.confirm("Desconectar este WhatsApp do Lico Primos?"))
      return;
    setBusy(true);
    try {
      await api("/whatsapp-web/disconnect", { method: "POST" });
      setGroups([]);
      setGroupId("");
      await load();
      notice("WhatsApp desconectado.");
    } catch (err) {
      notice((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="module-card whatsapp-web-card">
      <div className="setup-lead">
        <MessageCircle />
        <div>
          <h3>Conectar por QR Code</h3>
          <p>
            Funciona como um dispositivo conectado ao WhatsApp Web. Modo
            experimental e não oficial.
          </p>
        </div>
        <b className={state.status === "ready" ? "status-ok" : "status-wait"}>
          {state.status === "ready" ? "CONECTADO" : state.status.toUpperCase()}
        </b>
      </div>
      {state.status === "idle" ||
      state.status === "disconnected" ||
      state.status === "error" ? (
        <button
          className="primary"
          disabled={busy}
          onClick={() => void connect()}
        >
          <Plus /> Conectar novo número
        </button>
      ) : null}
      {state.status === "starting" && (
        <div className="qr-wait">
          <LoaderCircle className="spin" />
          <p>Gerando QR Code…</p>
        </div>
      )}
      {state.status === "qr" && state.qrDataUrl && (
        <div className="qr-connect">
          <p>
            No celular:{" "}
            <b>
              WhatsApp Business → Configurações → Dispositivos conectados →
              Conectar dispositivo
            </b>
          </p>
          <img src={state.qrDataUrl} alt="QR Code para conectar o WhatsApp" />
          <small>
            O QR expira rapidamente. Se isso acontecer, clique novamente em
            conectar.
          </small>
        </div>
      )}
      {state.status === "authenticated" && (
        <div className="qr-wait">
          <LoaderCircle className="spin" />
          <p>QR lido. Carregando seus grupos…</p>
        </div>
      )}
      {state.status === "ready" && (
        <div className="web-connected">
          <p>
            WhatsApp conectado: <b>{state.connectedNumber}</b> · {groups.length}{" "}
            grupo(s)
          </p>
          <div className="connected-groups">
            <b>Grupos conectados</b>
            {groups.map((group) => (
              <span key={group.id}>
                <MessageCircle /> {group.name}
              </span>
            ))}
          </div>
          <div className="create-offer-group">
            <div>
              <h4>Criar grupo de ofertas</h4>
              <p>
                O Lico Primos configura automaticamente: somente admins enviam
                mensagens, editam o grupo e adicionam participantes.
              </p>
            </div>
            <Field
              label="Nome do grupo"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
            />
            <label>
              Participantes com DDI e DDD
              <textarea
                rows={4}
                placeholder={"5569999999999\n5569988888888"}
                value={participants}
                onChange={(e) => setParticipants(e.target.value)}
              />
              <small>
                Um número por linha. Você será o administrador do grupo.
              </small>
            </label>
            <label className="locked-setting">
              <input type="checkbox" checked readOnly /> Somente administradores
              podem enviar mensagens
            </label>
            <button
              className="secondary"
              disabled={busy || !newGroupName.trim() || !participants.trim()}
              onClick={() => void createGroup()}
            >
              <Plus /> Criar grupo protegido
            </button>
          </div>
          <label>
            Grupo para teste
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
            >
              <option value="">Selecione um grupo</option>
              {groups.map((group) => (
                <option value={group.id} key={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
          <div className="form-actions">
            <button
              className="primary"
              disabled={busy || !groupId}
              onClick={() => void test()}
            >
              <Send /> Enviar teste
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void disconnect()}
            >
              Desconectar
            </button>
          </div>
        </div>
      )}
      {state.error && <p className="error">{state.error}</p>}
      <p className="card-note">
        Evite disparos em massa. A sessão pode cair quando o WhatsApp Web mudar
        e o WhatsApp pode limitar contas que apresentem comportamento
        automatizado.
      </p>
    </section>
  );
}

export function MessagingPage({
  kind,
  platform,
  reload,
  notice,
}: {
  kind: "telegram" | "whatsapp";
  platform: Platform;
  reload: () => Promise<void>;
  notice: (s: string) => void;
}) {
  const [telegram, setTelegram] = useState({
    ...platform.messaging.telegram,
    botToken: "",
  });
  const [whatsapp, setWhatsapp] = useState({
    ...platform.messaging.whatsapp,
    accessToken: "",
  });
  useEffect(() => {
    setTelegram({ ...platform.messaging.telegram, botToken: "" });
    setWhatsapp({ ...platform.messaging.whatsapp, accessToken: "" });
  }, [platform]);
  const saveCredentials = async () => {
    await api("/messaging", {
      method: "PATCH",
      body: JSON.stringify({
        telegram: {
          botUsername: telegram.botUsername,
          channelId: telegram.channelId,
          botToken: telegram.botToken,
        },
        whatsapp: {
          phoneNumber: whatsapp.phoneNumber,
          phoneNumberId: whatsapp.phoneNumberId,
          businessAccountId: whatsapp.businessAccountId,
          testRecipient: whatsapp.testRecipient,
          accessToken: whatsapp.accessToken,
        },
      }),
    });
    await reload();
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveCredentials();
      notice(
        `${kind === "telegram" ? "Telegram" : "WhatsApp"} salvo. Nenhuma mensagem foi enviada.`,
      );
    } catch (err) {
      notice((err as Error).message);
    }
  };
  const test = async () => {
    try {
      await saveCredentials();
      const result = await api<{ recipientSuffix: string }>(
        "/messaging/whatsapp/test",
        { method: "POST" },
      );
      notice(
        `Teste enviado pela API oficial para o número final ${result.recipientSuffix}.`,
      );
    } catch (err) {
      notice((err as Error).message);
    }
  };
  return (
    <>
      <PageTitle
        title={kind === "telegram" ? "Telegram" : "WhatsApp"}
        subtitle={
          kind === "telegram"
            ? "Prepare o bot e o canal oficial para uma ativação posterior"
            : "Conecte pela API oficial WhatsApp Business da Meta"
        }
      />
      {kind === "whatsapp" && (
        <WhatsAppWebConnect notice={notice} reload={reload} />
      )}
      <form
        className={`module-card compact-form ${kind === "whatsapp" ? "official-whatsapp-form" : ""}`}
        onSubmit={save}
      >
        {kind === "telegram" ? (
          <>
            <div className="setup-lead">
              <Send />
              <div>
                <h3>Conexão por bot</h3>
                <p>Crie o bot no BotFather e informe os dados abaixo.</p>
              </div>
            </div>
            <Field
              label="Usuário do bot"
              value={telegram.botUsername}
              onChange={(e) =>
                setTelegram({ ...telegram, botUsername: e.target.value })
              }
            />
            <Field
              label="ID do canal ou grupo"
              value={telegram.channelId}
              onChange={(e) =>
                setTelegram({ ...telegram, channelId: e.target.value })
              }
            />
            <Field
              label={`Token do bot${telegram.configured ? " (já cadastrado)" : ""}`}
              type="password"
              value={telegram.botToken}
              onChange={(e) =>
                setTelegram({ ...telegram, botToken: e.target.value })
              }
            />
          </>
        ) : (
          <>
            <div className="setup-lead">
              <MessageCircle />
              <div>
                <h3>WhatsApp Business</h3>
                <p>
                  Use os dados de Meta Developers → WhatsApp → Configuração da
                  API.
                </p>
              </div>
            </div>
            <Field
              label="Número conectado"
              value={whatsapp.phoneNumber}
              onChange={(e) =>
                setWhatsapp({ ...whatsapp, phoneNumber: e.target.value })
              }
            />
            <Field
              label="Phone Number ID"
              value={whatsapp.phoneNumberId}
              onChange={(e) =>
                setWhatsapp({ ...whatsapp, phoneNumberId: e.target.value })
              }
            />
            <Field
              label="WhatsApp Business Account ID"
              value={whatsapp.businessAccountId}
              onChange={(e) =>
                setWhatsapp({ ...whatsapp, businessAccountId: e.target.value })
              }
            />
            <Field
              label={`Token de acesso${whatsapp.configured ? " (já cadastrado)" : ""}`}
              type="password"
              value={whatsapp.accessToken}
              onChange={(e) =>
                setWhatsapp({ ...whatsapp, accessToken: e.target.value })
              }
            />
            <Field
              label="Número que receberá o teste (DDI + DDD + número)"
              placeholder="5569999999999"
              value={whatsapp.testRecipient}
              onChange={(e) =>
                setWhatsapp({ ...whatsapp, testRecipient: e.target.value })
              }
            />
            <p className="card-note">
              O teste envia o modelo oficial “hello_world”. A Cloud API atende
              contatos individuais e não publica em grupos comuns.
            </p>
          </>
        )}
        <div className="form-actions">
          <button className="primary">
            <ShieldCheck /> Salvar sem enviar
          </button>
          {kind === "whatsapp" && (
            <button
              title="Salvar e enviar uma mensagem de teste"
              type="button"
              className="secondary"
              onClick={() => void test()}
            >
              <Send /> Salvar e testar
            </button>
          )}
        </div>
      </form>
    </>
  );
}

export function ChannelsPage({
  platform,
  reload,
  notice,
}: {
  platform: Platform;
  reload: () => Promise<void>;
  notice: (s: string) => void;
}) {
  const [form, setForm] = useState({
    name: "",
    type: "telegram" as "telegram" | "whatsapp",
    externalId: "",
    enabled: true,
  });
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api("/channels", { method: "POST", body: JSON.stringify(form) });
      setForm({ ...form, name: "", externalId: "" });
      notice("Grupo/canal adicionado.");
      await reload();
    } catch (err) {
      notice((err as Error).message);
    }
  };
  const remove = async (id: string) => {
    if (!window.confirm("Remover este grupo/canal?")) return;
    await api(`/channels/${id}`, { method: "DELETE" });
    notice("Grupo/canal removido.");
    await reload();
  };
  return (
    <>
      <PageTitle
        title="Grupos e canais"
        subtitle="Organize destinos de Telegram e WhatsApp sem realizar disparos"
      />
      <form className="module-card inline-form" onSubmit={add}>
        <Field
          label="Nome do grupo"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <label>
          Plataforma
          <select
            value={form.type}
            onChange={(e) =>
              setForm({
                ...form,
                type: e.target.value as "telegram" | "whatsapp",
              })
            }
          >
            <option value="telegram">Telegram</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
        </label>
        <Field
          label="ID externo (opcional)"
          value={form.externalId}
          onChange={(e) => setForm({ ...form, externalId: e.target.value })}
        />
        <button className="primary">
          <Plus /> Adicionar
        </button>
      </form>
      <section className="channel-grid">
        {platform.channels.map((channel) => (
          <article className="module-card" key={channel.id}>
            <div className="card-heading">
              <span className="round-icon">
                {channel.type === "telegram" ? <Send /> : <MessageCircle />}
              </span>
              <div>
                <h3>{channel.name}</h3>
                <p>{channel.type} · destino de distribuição</p>
              </div>
              <button
                className="danger-icon"
                onClick={() => void remove(channel.id)}
              >
                <Trash2 />
              </button>
            </div>
          </article>
        ))}
        {!platform.channels.length && (
          <div className="empty compact">
            <Bot />
            <h3>Nenhum destino cadastrado</h3>
            <p>Adicione seu primeiro grupo ou canal acima.</p>
          </div>
        )}
      </section>
    </>
  );
}

export function DistributionPage({
  platform,
  offers,
  notice,
  reloadOffers,
}: {
  platform: Platform;
  offers: DistributableOffer[];
  notice: (s: string) => void;
  reloadOffers?: () => Promise<void>;
}) {
  const [campaigns, setCampaigns] = useState<DistributionCampaign[]>([]);
  const [livePlatform, setLivePlatform] = useState(platform);
  const [selectedOffers, setSelectedOffers] = useState<string[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [campaignName, setCampaignName] = useState("Ofertas Lico Primos");
  const [mode, setMode] = useState<"now" | "schedule">("now");
  const [confirming, setConfirming] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [intervalMinutes, setIntervalMinutes] = useState(5);
  const [intervalMode, setIntervalMode] = useState<"fixed" | "safe_random">("safe_random");
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [detail, setDetail] = useState<DistributableOfferDetail | null>(null);
  const [detailImage, setDetailImage] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const load = async () => setCampaigns(await api("/distribution-campaigns"));
  useEffect(() => {
    setSelectedOffers([]);
    void load();
  }, []);
  useEffect(() => { setLivePlatform(platform); }, [platform]);
  useEffect(() => {
    const refresh = async () => {
      try { setLivePlatform(await api<Platform>("/platform")); await load(); } catch { /* próxima atualização tenta novamente */ }
    };
    const timer = window.setInterval(() => void refresh(), 2500);
    return () => window.clearInterval(timer);
  }, []);
  const toggle = (list: string[], set: (v: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);
  const create = async () => {
    setConfirming(false);
    setBusy(true);
    try {
      const result = await api<{
        created: number;
        skippedWithoutAffiliateLink: number;
      }>("/distributions", {
        method: "POST",
        body: JSON.stringify({
          offerIds: selectedOffers,
          channelIds: selectedChannels,
          name: campaignName.trim() || "Ofertas Lico Primos",
          scheduledAt: mode === "schedule" && scheduledAt ? new Date(scheduledAt).toISOString() : null,
          intervalMinutes,
          intervalMode,
        }),
      });
      notice(
        `${mode === "now" ? "Distribuição iniciada" : "Distribuição agendada"}: ${result.created} mensagens ${intervalMode === "safe_random" ? "com intervalo seguro aleatório de 3 a 7 minutos" : `a cada ${intervalMinutes} minuto(s)`}${result.skippedWithoutAffiliateLink ? `; ${result.skippedWithoutAffiliateLink} sem link oficial foram ignoradas` : ""}.`,
      );
      setSelectedOffers([]);
      setSelectedChannels([]);
      setScheduledAt("");
      await load();
    } catch (err) {
      notice((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const controlCampaign = async (id: string, action: "pause" | "resume" | "cancel") => {
    setBusy(true);
    try {
      await api(`/distribution-campaigns/${id}`, { method: "PATCH", body: JSON.stringify({ action }) });
      notice(action === "pause" ? "Campanha pausada." : action === "resume" ? "Campanha retomada." : "Envios pendentes cancelados.");
      await load();
    } catch (err) {
      notice((err as Error).message);
      await load();
    } finally {
      setBusy(false);
    }
  };
  const deleteCampaign = async (campaign: DistributionCampaign) => {
    if (!window.confirm(`Excluir definitivamente a campanha “${campaign.name}”?`)) return;
    setBusy(true);
    try {
      await api(`/distribution-campaigns/${campaign.id}`, { method: "DELETE" });
      notice("Campanha excluída.");
      await load();
    } catch (err) {
      notice((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const columns = [
    { title: "Em andamento", statuses: ["running", "paused"] },
    { title: "Próximas campanhas", statuses: ["scheduled"] },
    { title: "Finalizadas", statuses: ["completed", "completed_with_errors", "cancelled"] },
  ];
  const statusLabel: Record<string, string> = { scheduled: "Agendada", running: "Em andamento", paused: "Pausada", completed: "Concluída", completed_with_errors: "Concluída com falhas", cancelled: "Cancelada" };
  // A Central de Distribuição sempre mostra todos os produtos com link confirmado.
  // O histórico de campanhas não deve esconder resultados de novas buscas.
  const eligible = offers.filter((offer) => Boolean(offer.affiliateUrl));
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(eligible.length / pageSize));
  const visibleOffers = eligible.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);
  const selectable = visibleOffers;
  const allSelected =
    Boolean(selectable.length) &&
    selectable.every((o) => selectedOffers.includes(o.id));
  const totalMessages = selectedOffers.length * selectedChannels.length;
  const startsAt = mode === "schedule" && scheduledAt ? new Date(scheduledAt) : new Date();
  const endsAt = new Date(startsAt.getTime() + Math.max(0, selectedOffers.length - 1) * intervalMinutes * 60_000);
  const deleteOffer = async (offer: DistributableOffer) => {
    if (!window.confirm(`Excluir “${offer.title}” do Centro de Distribuição?`)) return;
    setDeletingId(offer.id);
    try {
      const result = await api<{ deleted: number }>("/offers", {
        method: "DELETE",
        body: JSON.stringify({ ids: [offer.id] }),
      });
      setSelectedOffers((current) => current.filter((id) => id !== offer.id));
      await reloadOffers?.();
      notice(`${result.deleted} produto excluído do Centro de Distribuição.`);
    } catch (error) {
      notice((error as Error).message);
    } finally {
      setDeletingId(null);
    }
  };
  const deleteSelectedOffers = async () => {
    if (!selectedOffers.length) return;
    if (!window.confirm(`Excluir os ${selectedOffers.length} produtos selecionados do Centro de Distribuição?`)) return;
    setDeletingSelected(true);
    try {
      let deleted = 0;
      for (let index = 0; index < selectedOffers.length; index += 100) {
        const result = await api<{ deleted: number }>("/offers", {
          method: "DELETE",
          body: JSON.stringify({ ids: selectedOffers.slice(index, index + 100) }),
        });
        deleted += result.deleted;
      }
      setSelectedOffers([]);
      await reloadOffers?.();
      notice(`${deleted} produto(s) excluído(s) do Centro de Distribuição.`);
    } catch (error) {
      notice((error as Error).message);
    } finally {
      setDeletingSelected(false);
    }
  };
  const openProduct = async (offer: DistributableOffer) => {
    try {
      const product = await api<DistributableOfferDetail>(`/offers/${offer.id}/detail`);
      setDetail(product);
      setDetailImage(product.galleryImages?.[0] ?? product.imageUrl);
    } catch (error) {
      notice((error as Error).message);
    }
  };
  return (
    <>
      <PageTitle
        title="Distribuição"
        subtitle="Escolha produtos, destinos e o intervalo entre cada publicação"
      />
      <section className="distribution-builder module-card">
        <div>
          <h3>1. Produtos para distribuir</h3>
          <p>Os links oficiais de afiliado já confirmados estão prontos.</p>
          {Boolean(selectable.length) && (
            <div className="distribution-selection-bar">
              <label className="select-all-choice">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => {
                    const pageIds = selectable.map((offer) => offer.id);
                    setSelectedOffers((current) =>
                      allSelected
                        ? current.filter((id) => !pageIds.includes(id))
                        : [...new Set([...current, ...pageIds])],
                    );
                  }}
                />{" "}
                Selecionar esta página ({selectable.length})
              </label>
              <button
                type="button"
                className="secondary select-every-product"
                onClick={() => setSelectedOffers(selectedOffers.length === eligible.length ? [] : eligible.map((offer) => offer.id))}
              >
                {selectedOffers.length === eligible.length ? "Desmarcar todos" : `Selecionar todos (${eligible.length})`}
              </button>
              <strong className="selected-total">{selectedOffers.length} selecionado(s)</strong>
              {Boolean(selectedOffers.length) && (
                <button
                  type="button"
                  className="secondary danger bulk-product-delete"
                  disabled={deletingSelected}
                  onClick={() => void deleteSelectedOffers()}
                >
                  {deletingSelected ? <LoaderCircle className="spin" /> : <Trash2 />} Excluir selecionados
                </button>
              )}
            </div>
          )}
          <div className="distribution-product-grid">
            {visibleOffers.map((offer) => (
              <article
                key={offer.id}
                className={`distribution-product-card ${selectedOffers.includes(offer.id) ? "selected" : ""}`}
              >
                <label className="distribution-card-check" title="Selecionar produto">
                  <input
                    type="checkbox"
                    checked={selectedOffers.includes(offer.id)}
                    onChange={() =>
                      toggle(selectedOffers, setSelectedOffers, offer.id)
                    }
                  />
                </label>
                <div className="distribution-card-image">
                  {offer.imageUrl ? <img src={offer.imageUrl} alt={offer.title} /> : <Store />}
                  <span>{offer.store?.name ?? "Mercado Livre"}</span>
                  <b>{Math.round(offer.score)}<small>relevância</small></b>
                </div>
                <div className="distribution-card-body">
                  <small className="distribution-card-niche">{offer.niche?.name ?? "Geral"} · produto real</small>
                  <h4>{offer.title}</h4>
                  <div className="distribution-card-rating">
                    {offer.rating != null
                      ? <>★ {offer.rating.toFixed(1)} <span>({(offer.reviewCount ?? 0).toLocaleString("pt-BR")} avaliações)</span></>
                      : <span>☆ Produto ainda sem avaliações</span>}
                  </div>
                  <div className="distribution-card-commission">
                    {offer.commissionPercent != null
                      ? <><b>Ganhos: {offer.commissionPercent.toLocaleString("pt-BR")}%</b>{offer.estimatedCommission != null && <span> até {formatBrl(offer.estimatedCommission)} por venda</span>}</>
                      : offer.extraCommissionPercent != null
                        ? <b>Ganhos Extras: {offer.extraCommissionPercent.toLocaleString("pt-BR")}%</b>
                        : <span>Ganhos sendo consultados</span>}
                  </div>
                  <div className="distribution-card-price">
                    <div>{offer.previousPrice != null && <del>{formatBrl(offer.previousPrice)}</del>}<strong>{formatBrl(offer.currentPrice)}</strong></div>
                    {offer.discountPercent != null && offer.discountPercent > 0 && <b>-{Math.round(offer.discountPercent)}%</b>}
                  </div>
                  <p>✓ {offer.freeShipping ? "Frete grátis" : offer.shipping ?? "Consulte o frete"}</p>
                  <div className="distribution-card-actions">
                    <button type="button" onClick={() => void openProduct(offer)} title="Visualizar dentro do Lico Primos"><ExternalLink /> Ver produto</button>
                    <span className="status-ok">LINK OK</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="danger-icon product-delete"
                  title="Excluir produto"
                  aria-label={`Excluir ${offer.title}`}
                  disabled={deletingId === offer.id}
                  onClick={() => void deleteOffer(offer)}
                >
                  {deletingId === offer.id ? <LoaderCircle className="spin" /> : <Trash2 />}
                </button>
              </article>
            ))}
            {!eligible.length && (
              <div className="distribution-empty">
                <Store />
                <b>Nenhum produto disponível</b>
                <p>Use “Nova busca” para adicionar produtos com link de afiliado.</p>
              </div>
            )}
          </div>
          {eligible.length > pageSize && (
            <div className="distribution-pagination" aria-label="Paginação dos produtos">
              <button type="button" disabled={page === 1} onClick={() => setPage((current) => current - 1)}>
                Anterior
              </button>
              <span>Página {page} de {pageCount} · 10 produtos por página</span>
              <button type="button" disabled={page === pageCount} onClick={() => setPage((current) => current + 1)}>
                Próxima
              </button>
            </div>
          )}
        </div>
        <div>
          <h3>2. Destinos</h3>
          <p>Cada produto será enviado com imagem, mensagem e link.</p>
          <div className="choice-list">
            {livePlatform.channels.map((channel) => (
              <label
                className={`destination-choice ${selectedChannels.includes(channel.id) ? "selected" : ""}`}
                key={channel.id}
              >
                <input
                  type="checkbox"
                  checked={selectedChannels.includes(channel.id)}
                  onChange={() =>
                    toggle(selectedChannels, setSelectedChannels, channel.id)
                  }
                />
                <span>
                  {channel.name}
                  <small>{channel.type}</small>
                </span>
              </label>
            ))}
            {!livePlatform.channels.length && (
              <p className="muted">
                Cadastre um grupo ou canal em Integrações.
              </p>
            )}
          </div>
          <label>
            Nome da campanha
            <input value={campaignName} maxLength={100} onChange={(event) => setCampaignName(event.target.value)} />
          </label>
          <label>
            3. Intervalo entre produtos
            <select
              value={intervalMode === "safe_random" ? "safe_random" : String(intervalMinutes)}
              onChange={(e) => {
                if (e.target.value === "safe_random") setIntervalMode("safe_random");
                else { setIntervalMode("fixed"); setIntervalMinutes(Number(e.target.value)); }
              }}
            >
              <option value="safe_random">Seguro e natural: entre 3 e 7 minutos</option>
              <option value={1}>A cada 1 minuto</option>
              <option value={2}>A cada 2 minutos</option>
              <option value={5}>A cada 5 minutos</option>
              <option value={10}>A cada 10 minutos</option>
              <option value={30}>A cada 30 minutos</option>
              <option value={60}>A cada 1 hora</option>
            </select>
          </label>
          <div className="distribution-mode">
            <button className={mode === "now" ? "active" : ""} onClick={() => setMode("now")}><Send /> Iniciar agora</button>
            <button className={mode === "schedule" ? "active" : ""} onClick={() => setMode("schedule")}><CalendarClock /> Agendar</button>
          </div>
          {mode === "schedule" && <label>
            4. Data e hora de início
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </label>}
          <button
            className="primary"
            disabled={
              busy || !selectedOffers.length || !selectedChannels.length || (mode === "schedule" && !scheduledAt)
            }
            onClick={() => setConfirming(true)}
          >
            {busy ? <LoaderCircle className="spin" /> : mode === "now" ? <Send /> : <CalendarClock />}{" "}
            {mode === "now" ? "Iniciar distribuição" : "Agendar distribuição"}
          </button>
          <p className="whatsapp-note">
            No Telegram, a imagem será enviada com a mensagem. Grupos comuns do
            WhatsApp não são suportados pela API oficial da Meta.
          </p>
        </div>
      </section>
      {detail && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setDetail(null)}>
          <section className="product-modal" role="dialog" aria-modal="true" aria-label={detail.title}>
            <button className="modal-close" title="Fechar visualização" onClick={() => setDetail(null)}><X /></button>
            <div className="product-gallery">
              <div className="product-main-image">
                {detailImage ? <img src={detailImage} alt={detail.title} /> : <Store />}
              </div>
              <div className="product-thumbs">
                {(detail.galleryImages?.length ? detail.galleryImages : [detail.imageUrl].filter(Boolean) as string[]).map((image, index) => (
                  <button key={`${image}-${index}`} className={detailImage === image ? "active" : ""} title={`Ver imagem ${index + 1}`} onClick={() => setDetailImage(image)}>
                    <img src={image} alt={`${detail.title} ${index + 1}`} />
                  </button>
                ))}
              </div>
            </div>
            <div className="product-info">
              <span className="niche">Mercado Livre · produto real</span>
              <h2>{detail.title}</h2>
              <div className="modal-price">
                {detail.previousPrice != null && <del>{formatBrl(detail.previousPrice)}</del>}
                <strong>{formatBrl(detail.currentPrice)}</strong>
              </div>
              <p>{detail.rating != null ? `★ ${detail.rating.toFixed(1)} · ${(detail.reviewCount ?? 0).toLocaleString("pt-BR")} avaliações` : "Produto ainda sem avaliações"}</p>
              <p>{detail.shipping ?? (detail.freeShipping ? "Frete grátis" : "Consulte o frete")}</p>
              {detail.seller && <p>Vendido por: {detail.seller}</p>}
              <p>{detail.commissionPercent != null ? `Comissão: ${detail.commissionPercent}%` : detail.extraCommissionPercent != null ? `Ganhos extras: ${detail.extraCommissionPercent}%` : "Comissão sendo consultada"}</p>
              <small>Visualização interna do anúncio. Preço e disponibilidade podem mudar no Mercado Livre.</small>
            </div>
          </section>
        </div>
      )}
      {confirming && (
        <div className="campaign-confirm-backdrop">
          <section className="campaign-confirm module-card">
            <h2>Confirmar {mode === "now" ? "início" : "agendamento"}</h2>
            <p>Revise a operação antes de colocar as mensagens na fila.</p>
            <dl>
              <div><dt>Campanha</dt><dd>{campaignName || "Ofertas Lico Primos"}</dd></div>
              <div><dt>Produtos</dt><dd>{selectedOffers.length}</dd></div>
              <div><dt>Destinos</dt><dd>{selectedChannels.length}</dd></div>
              <div><dt>Total de mensagens</dt><dd>{totalMessages}</dd></div>
              <div><dt>Início</dt><dd>{startsAt.toLocaleString("pt-BR")}</dd></div>
              <div><dt>Término estimado</dt><dd>{endsAt.toLocaleString("pt-BR")}</dd></div>
              <div><dt>WhatsApp</dt><dd>{livePlatform.channels.length ? "Destino pronto" : "Sem destino"}</dd></div>
            </dl>
            <div className="form-actions">
              <button className="secondary" onClick={() => setConfirming(false)}>Voltar</button>
              <button className="primary" disabled={busy} onClick={() => void create()}>{busy ? <LoaderCircle className="spin" /> : <Check />} Confirmar</button>
            </div>
          </section>
        </div>
      )}
      <section className="kanban">
        {columns.map((column) => (
          <div className="kanban-column" key={column.title}>
            <header>
              <h3>{column.title}</h3>
              <span>{campaigns.filter((campaign) => column.statuses.includes(campaign.status)).length}</span>
            </header>
            <div>
              {campaigns
                .filter((campaign) => column.statuses.includes(campaign.status))
                .slice(0, column.title === "Finalizadas" && !showAllHistory ? 4 : undefined)
                .map((campaign) => (
                  <article className="kanban-card campaign-card" key={campaign.id}>
                    <div className="kanban-product">
                      <Store />
                      <div>
                        <b>{campaign.name}</b>
                        <span>{campaign.offerCount} produtos · {campaign.channels.map((channel) => channel.name).join(", ") || "Destino removido"}</span>
                      </div>
                    </div>
                    <div className="campaign-progress"><span style={{ width: `${campaign.totalMessages ? (campaign.sent / campaign.totalMessages) * 100 : 0}%` }} /></div>
                    <p className="campaign-counts"><b>{campaign.sent}/{campaign.totalMessages}</b> enviadas · {campaign.pending} pendentes{campaign.cancelled ? ` · ${campaign.cancelled} canceladas` : ""}{campaign.failed ? ` · ${campaign.failed} falhas` : ""}</p>
                    <details className="message-preview">
                      <summary>Ver produtos e mensagens</summary>
                      <div className="campaign-jobs">{campaign.jobs.slice(0, 20).map((job) => <p key={job.id}><b>{job.offer.title}</b><span>{job.status}{job.lastError ? ` · ${job.lastError}` : ""}</span></p>)}</div>
                    </details>
                    <div className="kanban-meta">
                      <span>{statusLabel[campaign.status] ?? campaign.status}</span>
                      <time>{new Date(campaign.scheduledAt).toLocaleString("pt-BR")}</time>
                    </div>
                    <div className="campaign-actions">
                      {campaign.status === "running" && <button className="secondary" disabled={busy} onClick={() => void controlCampaign(campaign.id, "pause")}>II Pausar</button>}
                      {campaign.status === "paused" && <button className="secondary" disabled={busy} onClick={() => void controlCampaign(campaign.id, "resume")}><Send /> Continuar</button>}
                      {campaign.status === "cancelled" && campaign.cancelled > 0 && <button className="secondary" disabled={busy} onClick={() => void controlCampaign(campaign.id, "resume")}><Send /> Retomar não enviados</button>}
                      {["scheduled", "running", "paused"].includes(campaign.status) && <button className="secondary danger" disabled={busy} onClick={() => void controlCampaign(campaign.id, "cancel")}>Cancelar pendentes</button>}
                      {["cancelled", "completed", "completed_with_errors"].includes(campaign.status) && <button className="secondary danger" disabled={busy} onClick={() => void deleteCampaign(campaign)}><Trash2 /> Excluir campanha</button>}
                    </div>
                  </article>
                ))}
              {column.title === "Finalizadas" &&
                campaigns.filter((campaign) => column.statuses.includes(campaign.status)).length > 4 && (
                  <button
                    className="history-toggle"
                    onClick={() => setShowAllHistory((current) => !current)}
                  >
                    {showAllHistory ? "Mostrar menos" : "Ver histórico completo"}
                  </button>
                )}
            </div>
          </div>
        ))}
      </section>
    </>
  );
}

const plans = [
  {
    name: "Essencial",
    price: "R$ 0",
    desc: "Para organizar a operação local",
    features: ["Mercado Livre", "Revisão manual", "1 grupo/canal"],
  },
  {
    name: "Crescimento",
    price: "A definir",
    desc: "Para múltiplas redes e destinos",
    features: ["Todas as redes", "Até 5 grupos", "Agendamentos"],
  },
  {
    name: "Operação",
    price: "A definir",
    desc: "Para equipes e maior volume",
    features: ["Mais destinos", "Relatórios avançados", "Controles de equipe"],
  },
];
export function PlansPage({ platform }: { platform: Platform }) {
  return (
    <>
      <PageTitle
        title="Planos"
        subtitle="Estrutura comercial preparada; pagamentos ainda não estão habilitados"
      />
      <div className="current-plan">
        <CreditCard />
        <div>
          <b>Plano atual: {platform.subscription.plan}</b>
          <span>{platform.subscription.billing}</span>
        </div>
        <strong>ATIVO</strong>
      </div>
      <section className="plan-grid">
        {plans.map((plan, i) => (
          <article
            className={`module-card plan-card ${i === 1 ? "featured" : ""}`}
            key={plan.name}
          >
            <BadgeDollarSign />
            <h3>{plan.name}</h3>
            <strong>{plan.price}</strong>
            <p>{plan.desc}</p>
            <ul>
              {plan.features.map((f) => (
                <li key={f}>
                  <Check /> {f}
                </li>
              ))}
            </ul>
            <button className="secondary" disabled>
              Disponível futuramente
            </button>
          </article>
        ))}
      </section>
    </>
  );
}
export function ReportsPage() {
  const [summary, setSummary] = useState<{
    offers: number; confirmedLinks: number; averageDiscount: number; priceDrops: number;
    publications: { sent: number; failed: number; pending: number };
    searches: { total: number; successful: number };
  } | null>(null);
  const [members, setMembers] = useState<{ available: boolean; totalMembers: number; change: number } | null>(null);
  useEffect(() => {
    void Promise.all([
      api<typeof summary>("/reports/summary").then(setSummary),
      api<typeof members>("/reports/member-growth").then(setMembers),
    ]).catch(() => undefined);
  }, []);
  return (
    <>
      <PageTitle
        title="Relatórios"
        subtitle="Visão consolidada das operações reais do sistema"
      />
      <section className="report-grid">
        <article className="module-card">
          <BarChart3 />
          <b>{summary?.offers ?? "—"} ofertas encontradas</b>
          <p>Desconto médio: {summary?.averageDiscount ?? 0}% · {summary?.priceDrops ?? 0} quedas de preço acima de 15%.</p>
        </article>
        <article className="module-card">
          <Link2 />
          <b>{summary?.confirmedLinks ?? "—"} links confirmados</b>
          <p>Somente links oficiais meli.la são liberados para distribuição.</p>
        </article>
        <article className="module-card">
          <Send />
          <b>{summary?.publications.sent ?? "—"} mensagens enviadas</b>
          <p>{summary?.publications.pending ?? 0} pendentes · {summary?.publications.failed ?? 0} com falha para revisar.</p>
        </article>
        <article className="module-card"><ShieldCheck /><b>Operação responsável</b><p>Limite diário por grupo, teto global e intervalo natural de 3 a 7 minutos.</p></article>
        <article className="module-card"><BadgeDollarSign /><b>Rastreamento interno</b><p>Campanha, destino e produto são registrados sem modificar o link oficial.</p></article>
        <article className="module-card"><Store /><b>{summary?.searches.successful ?? 0}/{summary?.searches.total ?? 0} buscas concluídas</b><p>Histórico recente de execuções da Central de Afiliados.</p></article>
        <article className="module-card"><UserRound /><b>{members?.available ? `${members.totalMembers} membros` : "Métrica aguardando conexão"}</b><p>{members?.available ? `${members.change >= 0 ? "+" : ""}${members.change} desde o snapshot anterior.` : "A contagem é registrada quando o WhatsApp fornece participantes dos grupos."}</p></article>
      </section>
    </>
  );
}
export function HelpPage() {
  return (
    <>
      <PageTitle
        title="Ajuda e próximos passos"
        subtitle="Checklist para evoluir cada integração com segurança"
      />
      <section className="module-card help-list">
        <p>
          <UserRound /> Complete os dados da conta.
        </p>
        <p>
          <Store /> Configure uma rede de afiliados por vez.
        </p>
        <p>
          <Send /> Cadastre Telegram apenas com bot oficial.
        </p>
        <p>
          <MessageCircle /> Para WhatsApp, use a API oficial da Meta e respeite
          as políticas de envio.
        </p>
        <p>
          <CircleHelp /> Continue usando o modo seguro até cada conexão ser
          testada.
        </p>
      </section>
    </>
  );
}
