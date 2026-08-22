import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Bell,
  Bot,
  Boxes,
  Check,
  ChevronRight,
  Command,
  Copy,
  Download,
  GitBranch,
  Headphones,
  Home,
  Layers3,
  Eye,
  EyeOff,
  LayoutDashboard,
  Link2,
  LogOut,
  MessageCircle,
  Moon,
  MoreHorizontal,
  Move,
  PackageSearch,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Volume2,
  VolumeX,
  WandSparkles,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Brand } from "./Brand";

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Não foi possível concluir.");
  }
  return response.status === 204 ? ({} as T) : response.json();
}

type Route =
  | "/"
  | "/login/dark"
  | "/home"
  | "/agents"
  | "/agents/novo"
  | "/agents/conversa"
  | "/automacao"
  | "/automacao/construtor";
type Drawer = "support" | "integrations" | "settings" | null;

const agents = [
  [
    "Radar de ofertas",
    "OPORTUNIDADES",
    "Encontra sinais de preço, demanda e margem antes que virem ruído.",
    PackageSearch,
    "blue",
  ],
  [
    "Expert em Gestão",
    "ESTRATÉGIA",
    "Organiza prioridades e transforma contexto em decisões executáveis.",
    LayoutDashboard,
    "cyan",
  ],
  [
    "Expert em Vendas",
    "RECEITA",
    "Refina abordagem, objeções e próximos passos comerciais.",
    Activity,
    "mint",
  ],
  [
    "Expert em Funil",
    "CONVERSÃO",
    "Diagnostica gargalos e desenha jornadas mais eficientes.",
    GitBranch,
    "violet",
  ],
  [
    "Copywriter de ofertas",
    "COMUNICAÇÃO",
    "Cria ângulos claros e textos orientados à ação.",
    WandSparkles,
    "rose",
  ],
  [
    "Gerador de propostas",
    "NEGÓCIOS",
    "Estrutura propostas objetivas com valor, escopo e próximos passos.",
    Copy,
    "amber",
  ],
] as const;

const steps = [
  "Verificação",
  "Identidade",
  "Nicho",
  "Função",
  "Tom",
  "Objetivo",
  "Perguntas",
  "Projeção",
  "Entrega",
];

function go(path: Route) {
  const navigate = () => {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };
  const transitionDocument = document as Document & {
    startViewTransition?: (callback: () => void) => void;
  };
  if (transitionDocument.startViewTransition)
    transitionDocument.startViewTransition(navigate);
  else navigate();
}

function useTheme() {
  const [dark, setDark] = useState(
    () => localStorage.getItem("lico-theme") !== "light",
  );
  useEffect(() => {
    document.documentElement.dataset.ccTheme = dark ? "dark" : "light";
    localStorage.setItem("lico-theme", dark ? "dark" : "light");
  }, [dark]);
  return [dark, setDark] as const;
}

function IconButton({
  label,
  children,
  onClick,
  pressed,
}: {
  label: string;
  children: React.ReactNode;
  onClick?: () => void;
  pressed?: boolean;
}) {
  return (
    <button
      className="cc-icon-button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Orbit({ automation = false }: { automation?: boolean }) {
  return (
    <div
      className={`cc-orbit ${automation ? "is-violet" : ""}`}
      aria-hidden="true"
    >
      <i />
      <i />
      <i />
      <span>
        <Command />
      </span>
      <b>LIVE</b>
    </div>
  );
}

function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: React.ReactNode;
  close: () => void;
}) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [close]);
  return createPortal(
    <div className="cc-scrim" onMouseDown={close}>
      <section
        className="cc-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button className="cc-close" onClick={close} aria-label="Fechar">
          <X />
        </button>
        {children}
      </section>
    </div>,
    document.body,
  );
}

function DrawerPanel({
  kind,
  close,
}: {
  kind: Exclude<Drawer, null>;
  close: () => void;
}) {
  const titles = {
    support: "Central de suporte",
    integrations: "Integrações",
    settings: "Configurações",
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [close]);
  return createPortal(
    <div className="cc-drawer-scrim" onMouseDown={close}>
      <aside
        className="cc-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={titles[kind]}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header>
          <div>
            <span className="cc-kicker">WORKSPACE</span>
            <h2>{titles[kind]}</h2>
          </div>
          <IconButton label="Fechar" onClick={close}>
            <X />
          </IconButton>
        </header>
        {kind === "support" && (
          <>
            <div className="cc-message-card unread">
              <b>Revisão da campanha</b>
              <span>Equipe Lico · há 12 min</span>
              <p>Seu diagnóstico está pronto para revisão.</p>
            </div>
            <div className="cc-message-card">
              <b>Boas-vindas</b>
              <span>Suporte · ontem</span>
              <p>Conte com a gente para organizar sua operação.</p>
            </div>
            <label>
              Assunto
              <input placeholder="Como podemos ajudar?" />
            </label>
            <label>
              Mensagem
              <textarea rows={4} placeholder="Descreva o contexto..." />
            </label>
            <button className="cc-primary">
              Enviar solicitação <Send />
            </button>
          </>
        )}
        {kind === "integrations" && (
          <div className="cc-integration-list">
            {[
              ["Google Drive", true],
              ["Slack", true],
              ["Notion", false],
            ].map(([name, on]) => (
              <div key={String(name)}>
                <span className={on ? "on" : ""}>
                  <Link2 />
                </span>
                <div>
                  <b>{name}</b>
                  <small>
                    {on
                      ? "Conectado · sincronizado agora"
                      : "Disponível para conectar"}
                  </small>
                </div>
                <button>{on ? "Gerenciar" : "Explorar"}</button>
              </div>
            ))}
          </div>
        )}
        {kind === "settings" && (
          <div className="cc-settings-list">
            {["Modo seguro", "Alertas de atividade", "Som de interação"].map(
              (x, i) => (
                <label key={x}>
                  <span>
                    <b>{x}</b>
                    <small>
                      {i === 0
                        ? "Revisão humana antes de executar"
                        : "Preferência demonstrativa local"}
                    </small>
                  </span>
                  <input type="checkbox" defaultChecked={i !== 2} />
                </label>
              ),
            )}
            <button className="cc-primary">
              Salvar preferências <Check />
            </button>
          </div>
        )}
      </aside>
    </div>,
    document.body,
  );
}

function Shell({
  route,
  children,
  automation = false,
}: {
  route: Route;
  children: React.ReactNode;
  automation?: boolean;
}) {
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [open, setOpen] = useState(false);
  const nav = automation
    ? ([
        ["Visão geral", "/automacao", LayoutDashboard],
        ["Construtor", "/automacao/construtor", GitBranch],
        ["Execuções", "/automacao", Play],
        ["Integrações", "/automacao", Link2],
        ["Relatórios", "/automacao", Activity],
      ] as const)
    : ([
        ["Visão geral", "/agents", LayoutDashboard],
        ["Conversas", "/agents/conversa", MessageCircle],
        ["Meus agents", "/agents", Bot],
        ["Descoberta", "/agents", Search],
        ["Relatórios", "/agents", Activity],
      ] as const);
  return (
    <div className={`cc-shell ${open ? "rail-open" : ""}`}>
      <aside
        className="cc-rail"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <div className="cc-rail-brand">
          <Brand compact inverse onClick={() => go("/home")} />
        </div>
        <nav>
          {nav.map(([label, path, Icon]) => (
            <button
              key={label}
              className={route === path ? "active" : ""}
              aria-label={label}
              title={label}
              onClick={() => go(path as Route)}
            >
              <Icon />
              <span>{label}</span>
              {label === "Conversas" && <i className="cc-unread" />}
            </button>
          ))}
        </nav>
        <div className="cc-rail-bottom">
          {[
            ["Suporte", Headphones, "support"],
            ["Integrações", Boxes, "integrations"],
            ["Configurações", Settings2, "settings"],
          ].map(([label, Icon, kind]) => (
            <button
              key={String(label)}
              aria-label={String(label)}
              title={String(label)}
              onClick={() => setDrawer(kind as Drawer)}
            >
              <Icon />
              <span>{label}</span>
            </button>
          ))}
          <button
            aria-label="Menu principal"
            title="Menu principal"
            onClick={() => go("/home")}
          >
            <Home />
            <span>Menu principal</span>
          </button>
        </div>
      </aside>
      <main className="cc-main">
        <header className="cc-topbar">
          <div>
            <span className="cc-kicker">LICO PRIMOS · COMMAND CENTER</span>
            <b>{automation ? "Automação" : "Agents"}</b>
          </div>
          <div className="cc-status">
            <i /> Sistemas operacionais
          </div>
          <button className="cc-menu-home" onClick={() => go("/home")}>
            <Home /> Menu principal
          </button>
        </header>
        {children}
      </main>
      {drawer && <DrawerPanel kind={drawer} close={() => setDrawer(null)} />}
    </div>
  );
}

function LoginPage() {
  const [dark, setDark] = useTheme();
  const [errors, setErrors] = useState(false);
  const [support, setSupport] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [entering, setEntering] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [touch, setTouch] = useState<{
    x: number;
    y: number;
    id: number;
  } | null>(null);
  useEffect(() => {
    void api("/auth/me").then(() => go("/home")).catch(() => undefined);
  }, []);
  const submit = async () => {
    if (!email || !password) {
      setErrors(true);
      return;
    }
    setEntering(true);
    setLoginError("");
    try {
      await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      go("/home");
    } catch (error) {
      setLoginError((error as Error).message);
      setErrors(true);
    } finally {
      setEntering(false);
    }
  };
  return (
    <main className="cc-login">
      <button className="cc-theme-floating" onClick={() => setDark(!dark)}>
        {dark ? <Sun /> : <Moon />}
        {dark ? "Modo claro" : "Modo escuro"}
      </button>
      <section
        className="cc-login-form"
        onPointerDown={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setTouch({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
            id: Date.now(),
          });
        }}
      >
        <div className="cc-login-color-field">
          <i />
          <i />
          <i />
        </div>
        <div className="cc-login-form-inner">
          {touch && (
            <span
              key={touch.id}
              className="cc-login-touch"
              style={{ left: touch.x, top: touch.y }}
            />
          )}
          <h1>
            Boas decisões
            <br />
            <em>começam por aqui.</em>
          </h1>
          <p className="cc-adaptive-copy">
            Entre para revisar sinais, conversar com seus agents e acompanhar
            sua operação.
          </p>
          <div className="cc-login-access">
            <label>
              E-mail
              <input
                className={errors && !email ? "invalid" : ""}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setErrors(false);
                }}
                placeholder="voce@empresa.com"
              />
            </label>
            <label>
              Senha
              <div className="cc-password-field">
                <input
                  className={errors && !password ? "invalid" : ""}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setErrors(false);
                  }}
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                />
                <button
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff /> : <Eye />}
                </button>
              </div>
            </label>
            {errors && (
              <span className="cc-field-error">
                {loginError || "Preencha os dois campos para continuar."}
              </span>
            )}
            <div className="cc-login-actions">
              <button
                className={`cc-primary ${entering ? "is-entering" : ""}`}
                disabled={entering}
                onClick={submit}
              >
                {entering ? (
                  <>
                    <span className="cc-enter-check">
                      <Check />
                    </span>{" "}
                    Preparando
                  </>
                ) : (
                  <>
                    Entrar com segurança <ArrowRight />
                  </>
                )}
              </button>
              <button
                className="cc-google"
                aria-label="Entrar com Google"
                title="Entrar com Google"
                onClick={() => {
                  window.location.href = "/api/auth/google";
                }}
              >
                G
              </button>
            </div>
          </div>
          <div className="cc-login-foot">
            <button className="cc-text-button" onClick={() => setSupport(true)}>
              Precisa de ajuda?
            </button>
          </div>
        </div>
      </section>
      <section className="cc-login-art cc-login-art--radar">
        <div className="cc-login-signature">
          <span className="cc-signature-mark">
            <i />
            <i />
            <i />
            <i />
          </span>
          <div>
            <b>Lico Primo<span>S</span></b>
          </div>
        </div>
        <div className="cc-login-grid" />
        <div className="cc-login-radar-scene">
          <img
            src="/command-assets/login-opportunity-radar-3d.png"
            alt="Radar tridimensional analisando produtos, sinais de mercado e validação de oportunidades"
          />
          <div className="cc-login-scan" />
          <span className="cc-radar-badge signal">
            <i /> sinal encontrado
          </span>
          <span className="cc-radar-badge review">
            <ShieldCheck /> revisão segura
          </span>
          <span className="cc-radar-badge context">
            <Sparkles /> contexto refinado
          </span>
          <div className="cc-radar-particles">
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
        </div>
        <div className="cc-login-quote">
          <span className="cc-kicker">SINAIS · CONTEXTO · MOVIMENTO</span>
          <h2>
            Da oportunidade dispersa
            <br />
            <em>à decisão que faz sentido.</em>
          </h2>
          <p>
            O LicoPrimos encontra sinais, organiza contexto e mantém você no
            controle.
          </p>
        </div>
      </section>
      {support && (
        <Modal title="Suporte" close={() => setSupport(false)}>
          <span className="cc-kicker">SUPORTE</span>
          <h2>Como podemos ajudar?</h2>
          <label>
            Assunto
            <input placeholder="Acesso ao painel" />
          </label>
          <label>
            Mensagem
            <textarea rows={4} />
          </label>
          <button className="cc-primary">Enviar mensagem</button>
        </Modal>
      )}
    </main>
  );
}

function HomePage() {
  const [dark, setDark] = useTheme();
  const [sound, setSound] = useState(
    () => localStorage.getItem("lico-sound") !== "off",
  );
  const [exit, setExit] = useState(false);
  const logout = async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    go("/");
  };
  useEffect(
    () => localStorage.setItem("lico-sound", sound ? "on" : "off"),
    [sound],
  );
  return (
    <main className="cc-home">
      <div className="cc-home-atmosphere">
        <i />
        <i />
        <i />
        <i />
      </div>
      <header>
        <Brand inverse />
        <div>
          <button className="cc-home-control" onClick={() => setDark(!dark)}>
            {dark ? <Sun /> : <Moon />}
            {dark ? "Modo claro" : "Modo escuro"}
          </button>
          <button
            className="cc-home-control active"
            aria-pressed={sound}
            onClick={() => setSound(!sound)}
          >
            {sound ? <Volume2 /> : <VolumeX />} Som
          </button>
          <button className="cc-home-control" onClick={() => setExit(true)}>
            <LogOut /> Sair
          </button>
          <span className="cc-safe-chip">
            <i /> protótipo visual · modo seguro
          </span>
        </div>
      </header>
      <section className="cc-home-hero">
        <span className="cc-kicker">LICO PRIMOS / COMMAND CENTER</span>
        <h1>
          Um só painel.
          <br />
          <em>Dois caminhos claros.</em>
        </h1>
        <p>Escolha como deseja transformar sinais em decisões hoje.</p>
        <div className="cc-home-readiness">
          <span>
            <i /> SISTEMA PRONTO
          </span>
          <span>AMBIENTES CONECTADOS</span>
          <span>REVISÃO HUMANA ATIVA</span>
        </div>
        <div className="cc-home-tags">
          <span>Observe sinais</span>
          <span>Refine decisões</span>
          <span>Movimente operações</span>
        </div>
      </section>
      <section className="cc-environments">
        <button className="affiliates" onClick={() => window.location.assign("/afiliados")}>
          <div className="cc-env-visual affiliates">
            <img
              src="/command-assets/login-opportunity-radar-3d.png"
              alt="Radar de oportunidades analisando produtos e ofertas"
            />
            <span className="cc-env-signal">
              <i /> operação de afiliados
            </span>
            <div className="cc-image-glint" />
            <div className="cc-scene-path">
              <i />
              <i />
              <i />
            </div>
          </div>
          <div className="cc-env-copy">
            <span className="cc-env-icon affiliates">
              <PackageSearch />
            </span>
            <span className="cc-kicker">OFERTAS · LINKS · DISTRIBUIÇÃO</span>
            <h2>Lico Afiliados</h2>
            <p>
              Busque produtos, gere links de afiliado e distribua ofertas para seus grupos.
            </p>
            <b>
              Abrir operação <ArrowRight />
            </b>
          </div>
        </button>
        <button onClick={() => go("/agents")}>
          <div className="cc-env-visual agents">
            <img
              src="/command-assets/ai-components-3d.png"
              alt="Componentes tridimensionais de inteligência artificial conectados"
            />
            <span className="cc-env-signal">
              <i /> inteligência em contexto
            </span>
            <div className="cc-image-glint" />
            <div className="cc-scene-path">
              <i />
              <i />
              <i />
            </div>
          </div>
          <div className="cc-env-copy">
            <span className="cc-env-icon">
              <Bot />
            </span>
            <span className="cc-kicker">INTELIGÊNCIA APLICADA</span>
            <h2>Lico Agents</h2>
            <p>
              Crie, organize e acompanhe agentes inteligentes para sua operação.
            </p>
            <b>
              Explorar agents <ArrowRight />
            </b>
          </div>
        </button>
        <button className="automation" onClick={() => go("/automacao")}>
          <div className="cc-env-visual automation">
            <img
              src="/command-assets/automation-network-3d.png"
              alt="Rede tridimensional de componentes de automação conectados"
            />
            <span className="cc-env-signal violet">
              <i /> fluxo em movimento
            </span>
            <div className="cc-image-glint violet" />
            <div className="cc-flow-particles">
              <i />
              <i />
              <i />
              <i />
            </div>
          </div>
          <div className="cc-env-copy">
            <span className="cc-env-icon violet">
              <GitBranch />
            </span>
            <span className="cc-kicker">ORQUESTRAÇÃO INTELIGENTE</span>
            <h2>Lico Automação</h2>
            <p>
              Desenhe fluxos, acompanhe execuções e mantenha seus gatilhos em
              ordem.
            </p>
            <b>
              Abrir automações <ArrowRight />
            </b>
          </div>
        </button>
      </section>
      <footer>
        <span>
          <i /> Ambiente seguro · nenhuma ação sem revisão
        </span>
        <span>Command Center v2.4</span>
      </footer>
      {exit && (
        <Modal title="Encerrar esta sessão?" close={() => setExit(false)}>
          <span className="cc-modal-icon">
            <LogOut />
          </span>
          <span className="cc-kicker">SAIR DO PAINEL</span>
          <h2>Encerrar esta sessão?</h2>
          <p>
            Você voltará para a tela de acesso. Nenhuma alteração demonstrativa
            será publicada.
          </p>
          <div className="cc-modal-actions">
            <button onClick={() => setExit(false)}>Continuar no painel</button>
            <button className="cc-primary" onClick={() => void logout()}>
              <LogOut /> Sair agora
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}

function AgentsPage({ route }: { route: Route }) {
  const [filter, setFilter] = useState("Todos os agents");
  return (
    <Shell route={route}>
      <div className="cc-page">
        <div className="cc-breadcrumb">
          Command Center <ChevronRight /> Agents <ChevronRight />{" "}
          <b>Visão geral</b>
        </div>
        <section className="cc-agents-hero">
          <div>
            <span className="cc-kicker">AMBIENTE 01 · INTELIGÊNCIA</span>
            <h1>
              Transforme sinais em decisões <em>com contexto.</em>
            </h1>
            <p>
              Escolha um agent para começar uma conversa ou crie uma nova
              inteligência para sua operação.
            </p>
            <div>
              <button className="cc-primary" onClick={() => go("/agents/novo")}>
                <Plus /> Criar novo agent
              </button>
              <button className="cc-secondary">
                <Play /> Ver como funciona
              </button>
            </div>
            <div className="cc-signal-line">
              <span>
                <i /> sinal detectado
              </span>
              <ArrowRight />
              <span>
                <i /> contexto refinado
              </span>
              <ArrowRight />
              <b>decisão assistida</b>
            </div>
          </div>
          <Orbit />
        </section>
        <section className="cc-section-head">
          <div>
            <span className="cc-kicker">BIBLIOTECA DE ESPECIALISTAS</span>
            <h2>Encontre a inteligência certa</h2>
            <p>
              Cada agent tem uma função clara, um método e um resultado
              esperado.
            </p>
          </div>
          <button className="cc-secondary">
            <SlidersHorizontal /> Personalizar biblioteca
          </button>
        </section>
        <div className="cc-filters">
          {[
            "Todos os agents",
            "Para começar",
            "Agentes avançados",
            "Favoritos",
          ].map((x) => (
            <button
              className={filter === x ? "active" : ""}
              onClick={() => setFilter(x)}
              key={x}
            >
              {x}
            </button>
          ))}
        </div>
        <section className="cc-agent-grid">
          {agents.map(([name, category, description, Icon, tone], index) => (
            <article
              key={name}
              style={{ "--delay": `${index * 50}ms` } as React.CSSProperties}
            >
              <div className={`cc-agent-icon ${tone}`}>
                <Icon />
              </div>
              <button className="cc-card-more" aria-label="Mais opções">
                <MoreHorizontal />
              </button>
              <span className="cc-kicker">{category}</span>
              <h3>{name}</h3>
              <p>{description}</p>
              <button onClick={() => go("/agents/conversa")}>
                Conversar <ArrowRight />
              </button>
            </article>
          ))}
        </section>
        <div className="cc-safety">
          <ShieldCheck />
          <div>
            <b>Diagnóstico antes da prescrição</b>
            <p>
              Os agents pedem contexto, deixam hipóteses claras e não executam
              nada sem confirmação.
            </p>
          </div>
          <span>MODO SEGURO ATIVO</span>
        </div>
      </div>
    </Shell>
  );
}

function ConversationPage({ route }: { route: Route }) {
  const [messages, setMessages] = useState([
    "Quero encontrar oportunidades com boa margem sem aumentar o risco.",
    "Posso ajudar. Para começar, vou equilibrar três sinais: margem estimada, confiança da oferta e aderência ao seu público. Qual categoria é prioritária?",
  ]);
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const send = () => {
    if (!text.trim()) return;
    setMessages((m) => [...m, text]);
    setText("");
    setTyping(true);
    setTimeout(() => {
      setMessages((m) => [
        ...m,
        "Ótimo. Organizei o contexto e preparei três critérios para a próxima análise. Quer que eu use um cenário conservador?",
      ]);
      setTyping(false);
    }, 900);
  };
  return (
    <Shell route={route}>
      <div className="cc-page cc-chat-page">
        <div className="cc-breadcrumb">
          Agents <ChevronRight /> Conversas <ChevronRight />{" "}
          <b>Radar de ofertas</b>
        </div>
        <section className="cc-chat">
          <header>
            <button className="cc-back" onClick={() => go("/agents")}>
              <ArrowLeft />
            </button>
            <span className="cc-agent-icon blue">
              <PackageSearch />
            </span>
            <div>
              <h2>Radar de ofertas</h2>
              <span>
                <i /> Especialista online · contexto protegido
              </span>
            </div>
            <button
              className="cc-secondary"
              onClick={() => {
                const blob = new Blob([messages.join("\n\n")]);
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = "conversa-lico.txt";
                a.click();
              }}
            >
              <Download /> Exportar
            </button>
          </header>
          <div className="cc-chat-body">
            <div className="cc-chat-date">HOJE · 14:32</div>
            {messages.map((m, i) => (
              <div
                className={`cc-bubble ${i % 2 ? "agent" : "user"}`}
                key={`${m}-${i}`}
              >
                <span>{i % 2 ? <Bot /> : "AS"}</span>
                <div>
                  <b>
                    {i % 2 ? "Radar de ofertas" : "Você"}
                    <small>14:{32 + i}</small>
                  </b>
                  <p>{m}</p>
                </div>
              </div>
            ))}
            {typing && (
              <div className="cc-bubble agent">
                <span>
                  <Bot />
                </span>
                <div className="cc-typing">
                  <i />
                  <i />
                  <i />
                </div>
              </div>
            )}
          </div>
          <footer>
            <div className="cc-suggestions">
              <button onClick={() => setText("Use um cenário conservador")}>
                Cenário conservador
              </button>
              <button onClick={() => setText("Mostre os critérios")}>
                Mostrar critérios
              </button>
            </div>
            <div className="cc-composer">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Conte o contexto ou faça uma pergunta..."
              />
              <button onClick={send} aria-label="Enviar mensagem">
                <Send />
              </button>
            </div>
            <small>Enter para enviar · Shift + Enter para nova linha</small>
          </footer>
        </section>
      </div>
    </Shell>
  );
}

function WizardPage({ route }: { route: Route }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("Analista de oportunidades");
  const [niche, setNiche] = useState("E-commerce e afiliados");
  const [tone, setTone] = useState("Claro, direto e consultivo");
  const [saved, setSaved] = useState(true);
  useEffect(() => setSaved(false), [step, name, niche, tone]);
  return (
    <Shell route={route}>
      <div className="cc-page">
        <div className="cc-wizard-head">
          <button className="cc-back" onClick={() => go("/agents")}>
            <ArrowLeft />
          </button>
          <div>
            <span className="cc-kicker">
              NOVO AGENT · ETAPA {step + 1} DE 9
            </span>
            <h1>{steps[step]}</h1>
            <p>
              Defina a identidade operacional e veja o resumo ganhar forma em
              tempo real.
            </p>
          </div>
          <span className={saved ? "saved" : "unsaved"}>
            {saved ? <Check /> : <Activity />}
            {saved ? "Rascunho salvo" : "Alterações não salvas"}
          </span>
        </div>
        <div className="cc-progress">
          {steps.map((x, i) => (
            <button
              className={i === step ? "active" : i < step ? "done" : ""}
              onClick={() => setStep(i)}
              key={x}
            >
              <i>{i < step ? <Check /> : i + 1}</i>
              <span>{x}</span>
            </button>
          ))}
        </div>
        <div className="cc-wizard-grid">
          <section className="cc-form-card">
            <span className="cc-kicker">IDENTIDADE DO ESPECIALISTA</span>
            <h2>Como este agent deve se apresentar?</h2>
            <p>Use um nome funcional e fácil de reconhecer no dia a dia.</p>
            <label>
              Nome do agent
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              Nicho principal
              <input value={niche} onChange={(e) => setNiche(e.target.value)} />
            </label>
            <label>
              Tom de voz
              <select value={tone} onChange={(e) => setTone(e.target.value)}>
                <option>Claro, direto e consultivo</option>
                <option>Analítico e detalhado</option>
                <option>Próximo e inspirador</option>
              </select>
            </label>
            <div className="cc-callout">
              <Sparkles />
              <span>
                <b>Dica de configuração</b>Um nome orientado à função ajuda sua
                equipe a escolher o agent certo.
              </span>
            </div>
          </section>
          <aside className="cc-live-summary">
            <div>
              <span className="cc-kicker">RESUMO VIVO</span>
              <b>
                <i /> Atualizado agora
              </b>
            </div>
            <span className="cc-agent-icon blue">
              <Bot />
            </span>
            <h2>{name || "Seu novo agent"}</h2>
            <p>{niche}</p>
            {[
              ["REPRESENTA", "Lico Primos"],
              ["FUNÇÃO", "Analisar oportunidades"],
              ["TOM", tone],
              ["OBJETIVO", "Apoiar decisões seguras"],
            ].map(([a, b]) => (
              <div className="cc-summary-row" key={a}>
                <small>{a}</small>
                <b>{b}</b>
              </div>
            ))}
          </aside>
        </div>
        <section className="cc-destination">
          <div>
            <span>
              <GitBranch />
            </span>
            <div>
              <span className="cc-kicker">ONDE ISSO VAI PARAR</span>
              <h3>Agents › Meus agents › {name}</h3>
              <p>O rascunho fica local até você revisar a etapa de entrega.</p>
            </div>
          </div>
          <button className="cc-secondary">
            <Layers3 /> Ver histórico de rascunhos
          </button>
        </section>
        <div className="cc-wizard-nav">
          <button
            className="cc-secondary"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            <ArrowLeft /> Anterior
          </button>
          <button
            className="cc-primary"
            onClick={() => {
              setSaved(true);
              setStep((s) => Math.min(8, s + 1));
            }}
          >
            Salvar e continuar <ArrowRight />
          </button>
        </div>
      </div>
    </Shell>
  );
}

function AutomationPage({ route }: { route: Route }) {
  const [filter, setFilter] = useState("Todos");
  return (
    <Shell route={route} automation>
      <div className="cc-page">
        <div className="cc-breadcrumb">
          Command Center <ChevronRight /> Automação <ChevronRight />{" "}
          <b>Visão geral</b>
        </div>
        <section className="cc-auto-hero">
          <div>
            <span className="cc-kicker">AMBIENTE 02 · ORQUESTRAÇÃO</span>
            <h1>
              Menos ruído —<br />
              <em>mais movimento.</em>
            </h1>
            <p>
              Desenhe fluxos claros, revise cada decisão e execute com segurança
              operacional.
            </p>
            <div>
              <button
                className="cc-primary"
                onClick={() => go("/automacao/construtor")}
              >
                <GitBranch /> Abrir o construtor
              </button>
              <span>
                <ShieldCheck /> Modo seguro ativo
              </span>
            </div>
          </div>
          <Orbit automation />
        </section>
        <section className="cc-metrics">
          {[
            ["12", "Automações"],
            ["08", "Ativas agora"],
            ["94%", "Concluídas"],
            ["18h", "Tempo poupado"],
          ].map(([n, l], i) => (
            <article key={l}>
              <span className={`metric-${i}`}>
                <Activity />
              </span>
              <strong>{n}</strong>
              <small>{l}</small>
              <i>{i === 2 ? "+4,2%" : "esta semana"}</i>
            </article>
          ))}
        </section>
        <div className="cc-dashboard-grid">
          <section className="cc-workflows">
            <header>
              <div>
                <span className="cc-kicker">FLUXOS RECENTES</span>
                <h2>Movimento da operação</h2>
              </div>
              <div>
                {["Todos", "Ativa", "Em revisão", "Pausada"].map((x) => (
                  <button
                    className={x === filter ? "active" : ""}
                    onClick={() => setFilter(x)}
                    key={x}
                  >
                    {x}
                  </button>
                ))}
              </div>
            </header>
            {[
              [
                "Radar diário de ofertas",
                "Ativa",
                "Executada há 8 min",
                "3 oportunidades",
              ],
              [
                "Resumo para revisão",
                "Em revisão",
                "Atualizada há 1h",
                "Aguardando você",
              ],
              [
                "Distribuição aprovada",
                "Pausada",
                "Ontem às 18:40",
                "12 entregas",
              ],
            ].map(([a, b, c, d], i) => (
              <article key={a}>
                <span className={`flow-icon f${i}`}>
                  <GitBranch />
                </span>
                <div>
                  <b>{a}</b>
                  <small>{c}</small>
                </div>
                <span className={`cc-flow-status s${i}`}>
                  <i />
                  {b}
                </span>
                <strong>{d}</strong>
                <button aria-label="Abrir fluxo">
                  <ChevronRight />
                </button>
              </article>
            ))}
          </section>
          <aside className="cc-quick-actions">
            <span className="cc-kicker">AÇÕES RÁPIDAS</span>
            <h2>Continue de onde parou</h2>
            <button onClick={() => go("/automacao/construtor")}>
              <Plus />
              <span>
                <b>Novo fluxo</b>
                <small>Comece no canvas visual</small>
              </span>
              <ChevronRight />
            </button>
            <button>
              <Play />
              <span>
                <b>Execução rápida</b>
                <small>Use um fluxo aprovado</small>
              </span>
              <ChevronRight />
            </button>
            <button>
              <Bell />
              <span>
                <b>Revisar alertas</b>
                <small>2 itens precisam de contexto</small>
              </span>
              <ChevronRight />
            </button>
          </aside>
        </div>
      </div>
    </Shell>
  );
}

function BuilderPage({ route }: { route: Route }) {
  const [zoom, setZoom] = useState(100);
  const [selected, setSelected] = useState(1);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const timer = useRef<number>();
  const run = () => {
    setRunning(true);
    setDone(0);
    let n = 0;
    timer.current = window.setInterval(() => {
      n++;
      setDone(n);
      if (n >= 3) {
        clearInterval(timer.current);
        setRunning(false);
      }
    }, 700);
  };
  useEffect(() => () => clearInterval(timer.current), []);
  const blocks = [
    ["GATILHO", "Quando uma oferta for encontrada", PackageSearch],
    ["INTELIGÊNCIA", "Classificar oportunidade", Bot],
    ["AÇÃO", "Preparar resumo para revisão", Copy],
  ] as const;
  return (
    <Shell route={route} automation>
      <div className="cc-builder">
        <header>
          <div>
            <button className="cc-back" onClick={() => go("/automacao")}>
              <ArrowLeft />
            </button>
            <div>
              <span className="cc-kicker">CONSTRUTOR DE AUTOMAÇÃO</span>
              <h2>Radar diário de ofertas</h2>
            </div>
            <span className="cc-draft-dot">
              <i /> Rascunho alterado
            </span>
          </div>
          <div>
            <button className="cc-secondary">
              <Pause /> Salvar rascunho
            </button>
            <button className="cc-primary" onClick={run} disabled={running}>
              <Play /> {running ? "Executando..." : "Executar teste"}
            </button>
          </div>
        </header>
        <div className="cc-builder-body">
          <aside className="cc-block-library">
            <span className="cc-kicker">BLOCOS</span>
            <h3>Monte seu fluxo</h3>
            <label>
              <Search />
              <input placeholder="Buscar bloco" />
            </label>
            {["Gatilhos", "Inteligência", "Ações"].map((x, i) => (
              <button key={x}>
                <span className={`lib-${i}`}>
                  {i === 0 ? <Activity /> : i === 1 ? <Bot /> : <Send />}
                </span>
                <div>
                  <b>{x}</b>
                  <small>
                    {i === 0
                      ? "Inicie o fluxo"
                      : i === 1
                        ? "Refine uma decisão"
                        : "Crie um resultado"}
                  </small>
                </div>
                <Plus />
              </button>
            ))}
          </aside>
          <section className="cc-canvas">
            <div
              className="cc-canvas-grid"
              style={{ transform: `scale(${zoom / 100})` }}
            >
              <div className="cc-canvas-label">
                <Move /> Arraste para navegar
              </div>
              {blocks.map(([type, label, Icon], i) => (
                <div key={label}>
                  <article
                    className={`cc-flow-block ${selected === i ? "selected" : ""} ${done > i ? "completed" : running && done === i ? "running" : ""}`}
                    onClick={() => setSelected(i)}
                  >
                    <span className={`block-${i}`}>
                      <Icon />
                    </span>
                    <div>
                      <small>{type}</small>
                      <b>{label}</b>
                      <em>
                        {done > i
                          ? "Concluído com sucesso"
                          : i === 0
                            ? "Catálogo monitorado"
                            : i === 1
                              ? "Score e contexto"
                              : "Revisão humana"}
                      </em>
                    </div>
                    <MoreHorizontal />
                  </article>
                  {i < 2 && (
                    <div
                      className={`cc-connector ${done > i ? "completed" : ""}`}
                    >
                      <i />
                      <Plus />
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="cc-canvas-controls">
              <button onClick={() => setZoom((z) => Math.max(60, z - 10))}>
                <ZoomOut />
              </button>
              <span>{zoom}%</span>
              <button onClick={() => setZoom((z) => Math.min(140, z + 10))}>
                <ZoomIn />
              </button>
              <button onClick={() => setZoom(100)}>
                <RotateCcw />
              </button>
            </div>
          </section>
          <aside className="cc-inspector">
            <header>
              <div>
                <span className="cc-kicker">INSPECTOR</span>
                <h3>{blocks[selected][0]}</h3>
              </div>
              <IconButton label="Fechar seleção" onClick={() => setSelected(0)}>
                <X />
              </IconButton>
            </header>
            <span
              className={`cc-agent-icon ${selected === 1 ? "violet" : "blue"}`}
            >
              {selected === 0 ? (
                <PackageSearch />
              ) : selected === 1 ? (
                <Bot />
              ) : (
                <Copy />
              )}
            </span>
            <h2>{blocks[selected][1]}</h2>
            <p>
              Configure os parâmetros deste bloco e revise a saída antes da
              execução.
            </p>
            <label>
              {selected === 0
                ? "Origem"
                : selected === 1
                  ? "Critério principal"
                  : "Formato"}
              <select>
                <option>
                  {selected === 0
                    ? "Catálogo de ofertas"
                    : selected === 1
                      ? "Score de oportunidade"
                      : "Resumo executivo"}
                </option>
              </select>
            </label>
            <label>
              Comportamento em caso de erro
              <select>
                <option>Pausar e solicitar revisão</option>
              </select>
            </label>
            <div className="cc-inspector-note">
              <ShieldCheck />
              <span>
                <b>Execução protegida</b>Este bloco não publica nem envia nada
                automaticamente.
              </span>
            </div>
            <button className="cc-primary full">
              Aplicar alterações <Check />
            </button>
          </aside>
        </div>
      </div>
    </Shell>
  );
}

export function CommandCenter() {
  const [route, setRoute] = useState<Route>(
    () => window.location.pathname as Route,
  );
  useEffect(() => {
    const pop = () => setRoute(window.location.pathname as Route);
    addEventListener("popstate", pop);
    return () => removeEventListener("popstate", pop);
  }, []);
  const page = useMemo(() => {
    if (route === "/" || route === "/login/dark") return <LoginPage />;
    if (route === "/home") return <HomePage />;
    if (route === "/agents") return <AgentsPage route={route} />;
    if (route === "/agents/conversa") return <ConversationPage route={route} />;
    if (route === "/agents/novo") return <WizardPage route={route} />;
    if (route === "/automacao") return <AutomationPage route={route} />;
    return <BuilderPage route={route} />;
  }, [route]);
  return page;
}
