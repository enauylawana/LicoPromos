import { useEffect, useRef, useState } from "react";
import {
  Activity,
  BarChart3,
  ChevronRight,
  Clipboard,
  CreditCard,
  ExternalLink,
  Eye,
  History,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Menu,
  Moon,
  PackageSearch,
  Play,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Store,
  Sun,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import {
  ChannelsPage,
  DistributionPage,
  HelpPage,
  MessagingPage,
  NetworksPage,
  PlansPage,
  ProfilePage,
  ReportsPage,
  type Platform,
} from "./PlatformPages";

type Offer = {
  id: string;
  title: string;
  imageUrl?: string;
  currentPrice: number;
  previousPrice?: number;
  discountPercent?: number;
  rating?: number;
  reviewCount?: number;
  commissionPercent?: number;
  extraCommissionPercent?: number;
  estimatedCommission?: number;
  shipping?: string;
  score: number;
  status: string;
  originalUrl: string;
  affiliateUrl?: string;
  store: { name: string };
  niche?: { name: string };
};
type OfferDetail = Offer & {
  galleryImages: string[];
  seller?: string;
  stock?: number;
  catalogProductId?: string;
  priceHistory: Array<{ price: number; collectedAt: string }>;
  affiliateLinks: Array<{ id: string; url: string; source: string; createdAt: string }>;
  publications: Array<{ id: string; destination: string; status: string; attempts: number; lastError?: string; createdAt: string; publishedAt?: string }>;
};
type Dashboard = {
  stats: {
    total: number;
    pending: number;
    approved: number;
    published: number;
  };
  offers: Offer[];
  publications: Array<{
    id: string;
    message: string;
    status: string;
    offerId: string;
  }>;
  runs: Array<{
    id: string;
    status: string;
    trigger: string;
    foundCount: number;
    startedAt: string;
  }>;
  niches: Array<{
    id: string;
    name: string;
    active: boolean;
    wantedKeywords: string;
    minDiscount: number;
    minRating: number;
  }>;
  searchHistory: Array<{
    term: string;
    searches: number;
    lastResultCount: number;
    broad: boolean;
    lastSearchedAt: string;
  }>;
  stores: Array<{ id: string; name: string; enabled: boolean; note?: string }>;
  integrations: Array<{
    id: string;
    name: string;
    enabled: boolean;
    reason?: string;
  }>;
  mode: string;
};
const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    v,
  );

function SearchProgress({
  mode = "search",
  bestSellers = false,
  wide = false,
  cancel,
}: {
  mode?: "search" | "link";
  bestSellers?: boolean;
  wide?: boolean;
  cancel?: () => void;
}) {
  const stages = mode === "link"
    ? ["Abrindo o anúncio", "Validando preço e disponibilidade", "Gerando o link pela barra de afiliados"]
    : wide
      ? ["Varrendo as páginas do catálogo", "Validando cada página de produto", "Gerando e salvando os links"]
      : ["Pesquisando no Mercado Livre", bestSellers ? "Selecionando os produtos mais vendidos" : "Percorrendo os resultados", "Validando ofertas e links"];
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setStage((current) => Math.min(current + 1, stages.length - 1)), 3500);
    return () => window.clearInterval(timer);
  }, [stages.length]);
  return (
    <div className="search-progress-backdrop" role="alert" aria-live="assertive">
      <section className="search-progress-card">
        <div className="search-progress-brand">
          <img src="/lico-primos.jpeg" alt="" />
          <span className="search-progress-ring" />
        </div>
        <h2>Aguarde, estamos preparando seus produtos</h2>
        <p>Algumas consultas podem demorar um pouco. Não feche esta página.</p>
        <div className="search-progress-steps">
          {stages.map((label, index) => (
            <div className={index < stage ? "done" : index === stage ? "active" : ""} key={label}>
              <span>{index < stage ? "✓" : index + 1}</span>
              <b>{label}</b>
              {index === stage && <LoaderCircle className="spin" />}
            </div>
          ))}
        </div>
        {cancel && <button className="cancel-progress" onClick={cancel}><X /> Cancelar busca</button>}
      </section>
    </div>
  );
}

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

function Login({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      onLogin();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <main className="login-shell">
      <section className="login-card">
        <img className="login-brand-logo" src="/lico-primos.jpeg" alt="Lico Primos" />
        <h1>
          Boas ofertas.
          <br />
          <em>Decisões seguras.</em>
        </h1>
        <p className="muted">
          Entre no painel para revisar as oportunidades encontradas.
        </p>
        <button
          className="google-login"
          type="button"
          onClick={() =>
            setError(
              "Entrada pelo Google preparada; falta cadastrar as credenciais OAuth do Google.",
            )
          }
        >
          <b>G</b> Entrar com Google
        </button>
        <div className="login-divider">
          <span>ou use sua conta local</span>
        </div>
        <form onSubmit={submit}>
          <label>
            E-mail
            <input
              type="email"
              autoComplete="username"
              placeholder="Seu e-mail de administrador"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Senha
            <input
              type="password"
              autoComplete="current-password"
              placeholder="Sua senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="primary" disabled={loading}>
            {loading ? <LoaderCircle className="spin" /> : <ShieldCheck />}{" "}
            Entrar com segurança
          </button>
        </form>
        <div className="login-links">
          <span>Telegram</span>
          <span>WhatsApp</span>
          <span>Ajuda</span>
        </div>
        <p className="login-note">Use as credenciais exibidas pelo comando de configuração inicial.</p>
      </section>
      <aside className="login-art">
        <div className="glow"></div>
        <blockquote>
          “Automação responsável começa com uma boa revisão humana.”
        </blockquote>
        <span>Modo dry run sempre ativo</span>
      </aside>
    </main>
  );
}

export function App() {
  const [logged, setLogged] = useState<boolean | null>(null);
  const [data, setData] = useState<Dashboard | null>(null);
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [tab, setTab] = useState("Visão geral");
  const [dark, setDark] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cancellingSearch, setCancellingSearch] = useState(false);
  const searchAbortRef = useRef<AbortController | null>(null);
  const [query, setQuery] = useState("");
  const [searchLimit] = useState(20);
  const [bestSellers, setBestSellers] = useState(false);
  const [wideSearch, setWideSearch] = useState(false);
  const [notice, setNotice] = useState("");
  const [menu, setMenu] = useState(false);
  const loadPlatform = async () => setPlatform(await api("/platform"));
  const load = async () => {
    try {
      await api("/auth/me");
      setLogged(true);
      const [dashboard, platformData] = await Promise.all([
        api<Dashboard>("/dashboard"),
        api<Platform>("/platform"),
      ]);
      setData(dashboard);
      setPlatform(platformData);
    } catch {
      setLogged(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);
  useEffect(() => {
    const addTitles = () =>
      document
        .querySelectorAll<HTMLButtonElement>("button:not([title])")
        .forEach((button) => {
          button.title =
            button.getAttribute("aria-label") ||
            button.textContent?.trim() ||
            "Executar ação";
        });
    addTitles();
    const observer = new MutationObserver(addTitles);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  const searchNow = async (term = query, requestedLimit = searchLimit, strategy = bestSellers ? "best_sellers" : "general", filters?: { minRating: number; minDiscount: number; minCommission: number; freeShippingOnly: boolean }, mode: "quick" | "wide" = "quick") => {
    searchAbortRef.current?.abort();
    const requestController = new AbortController();
    searchAbortRef.current = requestController;
    setBusy(true);
    setBestSellers(strategy === "best_sellers");
    setWideSearch(mode === "wide");
    setQuery(term);
    try {
      const r = await api<{ foundCount: number }>("/search", {
        method: "POST",
        signal: requestController.signal,
        body: JSON.stringify({
          query: term.trim() || undefined,
          limit: requestedLimit,
          strategy,
          mode,
          filters,
        }),
      });
      setNotice(
        `${r.foundCount} de até ${requestedLimit} produtos reais do Mercado Livre foram encontrados.`,
      );
      setData(await api("/dashboard"));
      setTab("Distribuição");
    } catch (e) {
      if ((e as Error).name !== "AbortError") setNotice((e as Error).message);
    } finally {
      if (searchAbortRef.current === requestController) {
        searchAbortRef.current = null;
        setBusy(false);
      }
    }
  };
  const cancelSearch = async () => {
    setCancellingSearch(true);
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    setBusy(false);
    try {
      const result = await api<{ cancelled: boolean }>("/search/cancel", { method: "POST" });
      setNotice(result.cancelled ? "Busca cancelada." : "A busca já estava encerrada. A tela foi liberada.");
      setData(await api("/dashboard"));
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setCancellingSearch(false);
    }
  };
  const logout = async () => {
    await api("/auth/logout", { method: "POST" });
    setLogged(false);
  };
  if (logged === null)
    return (
      <div className="center">
        <LoaderCircle className="spin" />
      </div>
    );
  if (!logged) return <Login onLogin={load} />;
  const nav = [
    "Visão geral",
    "Distribuição",
    "Descoberta",
    "Integrações",
    "Minha conta",
    "Planos",
    "Relatórios",
    "Ajuda",
  ];
  const navIcons = [
    LayoutDashboard,
    Send,
    History,
    Store,
    UserRound,
    CreditCard,
    BarChart3,
    ShieldCheck,
  ];
  return (
    <div className="app-shell">
      {busy && <SearchProgress bestSellers={bestSellers} wide={wideSearch} cancel={() => void cancelSearch()} />}
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <div className="logo">
          <img src="/lico-primos.jpeg" alt="Lico Primos" />
        </div>
        <nav>
          {nav.map((item, i) => {
            const Icon = navIcons[i];
            return (
              <button
                title={`Abrir ${item}`}
                className={tab === item ? "active" : ""}
                onClick={() => {
                  setTab(item);
                  setMenu(false);
                }}
                key={item}
              >
                <Icon />
                {item}
                <ChevronRight />
              </button>
            );
          })}
        </nav>
        <div className="safe-box">
          <ShieldCheck />
          <div>
            <b>Modo seguro</b>
            <span>Nenhuma mensagem real será enviada.</span>
          </div>
        </div>
        <button title="Sair do sistema" className="logout" onClick={logout}>
          <LogOut /> Sair
        </button>
      </aside>
      <main className="content">
        <header>
          <button
            title="Abrir menu"
            className="mobile-menu"
            onClick={() => setMenu(!menu)}
          >
            <Menu />
          </button>
          <div>
            <p className="eyebrow">PAINEL ADMINISTRATIVO</p>
            <h2>{tab}</h2>
          </div>
          <div className="header-actions">
            <button
              title={dark ? "Usar tema claro" : "Usar tema escuro"}
              type="button"
              className="icon-button"
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun /> : <Moon />}
            </button>
            <button
              title="Abrir a Central de Busca"
              type="button"
              className="run"
              onClick={() => setTab("Descoberta")}
            >
              <Search /> Nova busca
            </button>
            {(busy || data?.runs.some((run) => run.status === "running")) && (
              <button
                title="Cancelar a busca e parar a geração dos links"
                type="button"
                className="cancel-search"
                disabled={cancellingSearch}
                onClick={() => void cancelSearch()}
              >
                {cancellingSearch ? <LoaderCircle className="spin" /> : <X />} Cancelar busca
              </button>
            )}
          </div>
        </header>
        {notice && (
          <div className="notice">
            <Activity />
            {notice}
            <button title="Fechar mensagem" onClick={() => setNotice("")}>
              <X />
            </button>
          </div>
        )}
        {tab === "Visão geral" && (
          <>
            <section className="hero">
              <div>
                <span className="pill">
                  <span></span> Sistema operacional · Dry run
                </span>
                <h1>
                  Olá! O Lico Primos está
                  <br />
                  <em>pronto para encontrar.</em>
                </h1>
                <p>
                  Revise as melhores oportunidades de hoje. Nada é publicado sem
                  sua ação.
                </p>
              </div>
              <div className="radar">
                <div className="ring r1"></div>
                <div className="ring r2"></div>
                <div className="sweep"></div>
                <img className="hero-brand" src="/lico-primos.jpeg" alt="Lico Primos" />
              </div>
            </section>
            <Stats data={data} />
            <section className="quick-links" aria-label="Atalhos operacionais">
              <button onClick={() => setTab("Descoberta")}>
                <span className="quick-link-icon blue"><PackageSearch /></span>
                <span><b>Garimpar ofertas</b><small>Varra o catálogo e valide novos produtos</small></span>
                <ChevronRight />
              </button>
              <button onClick={() => setTab("Distribuição")}>
                <span className="quick-link-icon violet"><Send /></span>
                <span><b>Preparar disparo</b><small>Selecione ofertas, canais e horários</small></span>
                <ChevronRight />
              </button>
              <button onClick={() => setTab("Relatórios")}>
                <span className="quick-link-icon green"><BarChart3 /></span>
                <span><b>Acompanhar resultados</b><small>Veja acervo, tendências e crescimento</small></span>
                <ChevronRight />
              </button>
            </section>
            <Runs runs={data?.runs ?? []} />
          </>
        )}
        {tab === "Distribuição" && platform && (
          <DistributionPage
            platform={platform}
            offers={data?.offers ?? []}
            notice={setNotice}
            reloadOffers={async () => setData(await api("/dashboard"))}
          />
        )}
        {tab === "Descoberta" && (
          <Discovery
            data={data}
            reload={async () => setData(await api("/dashboard"))}
            search={searchNow}
            notice={setNotice}
            clearConnectionError={() => setNotice((current) =>
              current.startsWith("Não foi possível acessar a Central de Afiliados") ? "" : current
            )}
          />
        )}
        {tab === "Integrações" && platform && (
          <ConnectionsHub
            data={data}
            platform={platform}
            reload={loadPlatform}
            notice={setNotice}
          />
        )}
        {tab === "Minha conta" && platform && (
          <ProfilePage
            platform={platform}
            reload={loadPlatform}
            notice={setNotice}
          />
        )}
        {tab === "Planos" && platform && <PlansPage platform={platform} />}
        {tab === "Relatórios" && <ReportsPage />}
        {tab === "Ajuda" && <HelpPage />}
      </main>
    </div>
  );
}

function Stats({ data }: { data: Dashboard | null }) {
  const list = [
    ["Encontradas", data?.stats.total ?? 0, "ofertas reais"],
    ["Aguardando revisão", data?.stats.pending ?? 0, "precisam de você"],
    ["Aprovadas", data?.stats.approved ?? 0, "na fila manual"],
    ["Publicadas", data?.stats.published ?? 0, "marcadas manualmente"],
  ];
  return (
    <section className="stats">
      {list.map((s, i) => (
        <article key={s[0]}>
          <div className={`stat-icon c${i}`}>
            <Activity />
          </div>
          <span>{s[0]}</span>
          <strong>{s[1]}</strong>
          <small>{s[2]}</small>
        </article>
      ))}
    </section>
  );
}
function SectionTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="section-title">
      <div>
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}
// Mantido como componente reutilizável para a próxima evolução da seleção em lote.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function SelectionToolbar({
  offers,
  selected,
  setSelected,
  remove,
  busy,
}: {
  offers: Offer[];
  selected: string[];
  setSelected: (ids: string[]) => void;
  remove: () => Promise<void>;
  busy: boolean;
}) {
  const allSelected =
    Boolean(offers.length) &&
    offers.every((offer) => selected.includes(offer.id));
  return (
    <div className="selection-toolbar">
      <label>
        <input
          type="checkbox"
          checked={allSelected}
          onChange={() =>
            setSelected(allSelected ? [] : offers.map((offer) => offer.id))
          }
        />{" "}
        Selecionar todos
      </label>
      <span>{selected.length} selecionado(s)</span>
      <button
        title="Excluir produtos selecionados"
        className="delete-selected"
        disabled={!selected.length || busy}
        onClick={() => void remove()}
      >
        <Trash2 /> Excluir
      </button>
    </div>
  );
}
function ProductImage({ src, alt }: { src?: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  return failed || !src ? (
    <div className="image-fallback">
      <PackageSearch />
      <span>Imagem indisponível</span>
    </div>
  ) : (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
// Mantido para compatibilidade com a visualização legada de ofertas.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function OfferGrid({
  offers,
  setStatus,
  publications,
  selected = [],
  toggle,
}: {
  offers: Offer[];
  setStatus: (id: string, s: string) => void;
  publications?: Dashboard["publications"];
  selected?: string[];
  toggle?: (id: string) => void;
}) {
  const [detail, setDetail] = useState<OfferDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const open = async (id: string) => {
    setLoading(true);
    try {
      setDetail(await api(`/offers/${id}/detail`));
    } finally {
      setLoading(false);
    }
  };
  if (!offers.length)
    return (
      <div className="empty">
        <PackageSearch />
        <h3>Nenhum produto encontrado</h3>
        <p>Clique em “Nova busca” para encontrar produtos na Central de Afiliados.</p>
      </div>
    );
  return (
    <>
      <section className="offer-grid">
        {offers.map((o) => (
          <article
            className={`offer ${selected.includes(o.id) ? "offer-selected" : ""}`}
            key={o.id}
          >
            {toggle && (
              <label className="offer-checkbox" title="Selecionar produto">
                <input
                  type="checkbox"
                  checked={selected.includes(o.id)}
                  onChange={() => toggle(o.id)}
                />
              </label>
            )}
            <button
              title="Visualizar produto"
              className="offer-image image-button"
              onClick={() => void open(o.id)}
            >
              <ProductImage src={o.imageUrl} alt={o.title} />
              <span className="store-tag">{o.store.name}</span>
              <span className="score">
                {Math.round(o.score)}
                <small>relevância</small>
              </span>
            </button>
            <div className="offer-body">
              <div className="niche">
                {o.niche?.name ?? "Geral"} · produto real
              </div>
              <h3>{o.title}</h3>
              <div className="rating">
                {o.rating != null ? (
                  <>
                    ★ {o.rating.toFixed(1)}{" "}
                    {(o.reviewCount ?? 0) > 0 && <span>
                      ({o.reviewCount!.toLocaleString("pt-BR")} avaliações)
                    </span>}
                  </>
                ) : (
                  <span>☆ Produto ainda sem avaliações</span>
                )}
              </div>
              <div className={`commission ${o.commissionPercent == null && o.extraCommissionPercent == null ? "pending" : ""}`}>
                {o.commissionPercent != null ? (
                  <>
                    <b>Ganhos: {o.commissionPercent.toLocaleString("pt-BR")}%</b>
                    {o.estimatedCommission != null && (
                      <span> até {brl(o.estimatedCommission)} por venda</span>
                    )}
                  </>
                ) : o.extraCommissionPercent != null ? (
                  <b>Ganhos Extras: {o.extraCommissionPercent.toLocaleString("pt-BR")}%</b>
                ) : (
                  <span>Ganhos sendo consultados na Central de Afiliados</span>
                )}
              </div>
              <div className="price-row">
                <div>
                  {o.previousPrice && <del>{brl(o.previousPrice)}</del>}
                  <strong>{brl(o.currentPrice)}</strong>
                </div>
                {o.discountPercent && <b>-{Math.round(o.discountPercent)}%</b>}
              </div>
              <p className="shipping">✓ {o.shipping ?? "Consulte o frete"}</p>
              <div className="offer-actions">
                <button
                  title="Visualizar produto"
                  onClick={() => void open(o.id)}
                >
                  {loading ? <LoaderCircle className="spin" /> : <Eye />}{" "}
                  Visualizar
                </button>
                <button
                  title="Copiar"
                  onClick={() =>
                    navigator.clipboard.writeText(
                      publications?.find((p) => p.offerId === o.id)?.message ??
                        o.affiliateUrl ??
                        o.originalUrl,
                    )
                  }
                >
                  <Clipboard />
                </button>
                <a
                  title={
                    o.affiliateUrl
                      ? "Abrir pelo link oficial de afiliado"
                      : "Link de afiliado sendo preparado"
                  }
                  href={o.affiliateUrl ?? o.originalUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink />
                </a>
              </div>
              <button
                title={
                  o.affiliateUrl
                    ? "Selecionar produto para distribuição"
                    : "Aguarde a geração do link oficial de afiliado"
                }
                className="distribution-select"
                disabled={!o.affiliateUrl}
                onClick={() => setStatus(o.id, "approved")}
              >
                {!o.affiliateUrl
                  ? "Preparando link de afiliado"
                  : o.status === "approved"
                  ? "Selecionado para distribuição"
                  : "Selecionar para distribuição"}
              </button>
            </div>
          </article>
        ))}
      </section>
      {detail && (
        <ProductModal product={detail} close={() => setDetail(null)} />
      )}
    </>
  );
}
function ProductModal({
  product,
  close,
}: {
  product: OfferDetail;
  close: () => void;
}) {
  const images = product.galleryImages.length
    ? product.galleryImages
    : ([product.imageUrl].filter(Boolean) as string[]);
  const [selected, setSelected] = useState(images[0]);
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section
        className="product-modal"
        role="dialog"
        aria-modal="true"
        aria-label={product.title}
      >
        <button
          title="Fechar visualização"
          className="modal-close"
          onClick={close}
        >
          <X />
        </button>
        <div className="product-gallery">
          <div className="product-main-image">
            <ProductImage src={selected} alt={product.title} />
          </div>
          <div className="product-thumbs">
            {images.map((image, index) => (
              <button
                title={`Ver imagem ${index + 1}`}
                className={selected === image ? "active" : ""}
                onClick={() => setSelected(image)}
                key={image}
              >
                <ProductImage
                  src={image}
                  alt={`${product.title} ${index + 1}`}
                />
              </button>
            ))}
          </div>
        </div>
        <div className="product-info">
          <span className="niche">Mercado Livre · anúncio real</span>
          <h2>{product.title}</h2>
          <div className="modal-price">
            {product.previousPrice && <del>{brl(product.previousPrice)}</del>}
            <strong>{brl(product.currentPrice)}</strong>
          </div>
          <p>{product.shipping ?? "Frete calculado pelo Mercado Livre"}</p>
          {product.seller && <p>Vendido por: {product.seller}</p>}
          <p>Disponibilidade: {product.stock ?? 1} ou mais unidades</p>
          <a
            title="Comprar direto no Mercado Livre"
            className="run modal-link"
            href={product.originalUrl}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink /> Abrir anúncio completo
          </a>
          <small>
            Preço e disponibilidade são consultados na API oficial e podem mudar
            no Mercado Livre.
          </small>
          <div className="product-history">
            <b>Histórico do produto</b>
            <small>{product.priceHistory.length} verificação(ões) de preço · {product.publications.length} disparo(s) registrado(s)</small>
            {product.publications.slice(0, 3).map((publication) => (
              <small key={publication.id}>
                {new Date(publication.createdAt).toLocaleString("pt-BR")} · {publication.destination} · {publication.status}
              </small>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
function Runs({ runs }: { runs: Dashboard["runs"] }) {
  return (
    <section className="runs">
      <SectionTitle
        title="Atividade recente"
        subtitle="Execuções registradas no banco"
      />
      {runs.length ? (
        runs.map((r) => (
          <div className="run-row" key={r.id}>
            <span className="success-dot"></span>
            <div>
              <b>Busca {r.trigger === "manual" ? "manual" : "agendada"}</b>
              <small>{new Date(r.startedAt).toLocaleString("pt-BR")}</small>
            </div>
            <span>{r.foundCount} ofertas</span>
            <b>{r.status}</b>
          </div>
        ))
      ) : (
        <p className="muted">Nenhuma execução ainda.</p>
      )}
    </section>
  );
}
function Discovery({
  data,
  reload,
  search,
  notice,
  clearConnectionError,
}: {
  data: Dashboard | null;
  reload: () => Promise<void>;
  search: (term: string, limit?: number, strategy?: string, filters?: { minRating: number; minDiscount: number; minCommission: number; freeShippingOnly: boolean }, mode?: "quick" | "wide") => Promise<void>;
  notice: (message: string) => void;
  clearConnectionError: () => void;
}) {
  type SearchFilters = { minCommission: number; minRating: number; minDiscount: number; minPrice: number; maxPrice: number; extraCommissionOnly: boolean; freeShippingOnly: boolean };
  type SearchRule = { id: string; category: string; query: string; quantity: number };
  type SavedSchedule = { id: string; name: string; enabled: boolean; bestSellers: boolean; time: string; days: number[]; productCount: number; rules: SearchRule[]; filters: SearchFilters; execution?: { status: "waiting" | "running" | "success" | "empty" | "failed"; startedAt?: string; finishedAt?: string; foundCount?: number; error?: string } };
  type PlanDraft = Omit<SavedSchedule, "id" | "execution">;
  const categories = [
    ["Geral", ""], ["Acessórios para veículos", "acessórios automotivos"], ["Beleza e cuidados pessoais", "beleza"],
    ["Brinquedos e hobbies", "brinquedos"], ["Casa, móveis e decoração", "casa decoração"], ["Celulares e telefones", "celulares"],
    ["Eletrônicos, áudio e vídeo", "eletrônicos"], ["Esportes e fitness", "esportes fitness"], ["Ferramentas", "ferramentas"],
    ["Games", "games"], ["Informática", "informática"], ["Moda", "moda"], ["Saúde", "saúde"],
  ] as const;
  const [quickMode, setQuickMode] = useState<"free" | "category" | "link">("free");
  const [quickCategory, setQuickCategory] = useState("Geral");
  const [quickTerm, setQuickTerm] = useState("");
  const [quickQuantity, setQuickQuantity] = useState(20);
  const [quickStrategy, setQuickStrategy] = useState("general");
  const [quickEngine, setQuickEngine] = useState<"quick" | "wide">("quick");
  const [quickMinRating, setQuickMinRating] = useState(0);
  const [quickMinDiscount, setQuickMinDiscount] = useState(0);
  const [quickMinCommission, setQuickMinCommission] = useState(0);
  const [quickFreeShipping, setQuickFreeShipping] = useState(false);
  const strategyLabels: Record<string, string> = { general: "Produtos em geral", best_sellers: "Mais vendidos", offers: "Ofertas do dia", discount: "Maiores descontos", commission: "Maiores comissões" };
  const [productLink, setProductLink] = useState("");
  const [quickBusy, setQuickBusy] = useState(false);
  const [browserConnection, setBrowserConnection] = useState<{ available: boolean; connected: boolean } | null>(null);
  const loadBrowserConnection = async () => {
    const status = await api<{ available: boolean; connected: boolean }>("/affiliate-browser/status");
    setBrowserConnection(status);
    if (status.connected) clearConnectionError();
  };
  useEffect(() => {
    void loadBrowserConnection().catch(() => setBrowserConnection({ available: false, connected: false }));
    const timer = window.setInterval(() => void loadBrowserConnection().catch(() => undefined), 5000);
    return () => window.clearInterval(timer);
  }, []);
  const quickSearch = async () => {
    const preset = quickMode === "category" ? categories.find(([name]) => name === quickCategory)?.[1] ?? "" : "";
    const term = quickTerm.trim() || preset;
    setQuickBusy(true);
    try {
      await search(term, quickQuantity, quickStrategy, { minRating: quickMinRating, minDiscount: quickMinDiscount, minCommission: quickMinCommission, freeShippingOnly: quickFreeShipping }, quickEngine);
    } finally {
      setQuickBusy(false);
    }
  };
  const importLink = async () => {
    if (!productLink.trim()) return notice("Cole o link do produto do Mercado Livre.");
    setQuickBusy(true);
    try {
      const result = await api<{ title: string }>("/search/link", { method: "POST", body: JSON.stringify({ url: productLink.trim() }) });
      setProductLink("");
      await reload();
      notice(`Produto adicionado com link de afiliado: ${result.title}`);
    } catch (error) {
      notice((error as Error).message);
    } finally {
      setQuickBusy(false);
    }
  };
  const blankPlan = (): PlanDraft => ({
    name: "Busca geral", enabled: true, bestSellers: false, time: "07:00", days: [0, 1, 2, 3, 4, 5, 6], productCount: 20,
    rules: [{ id: crypto.randomUUID(), category: "Geral", query: "", quantity: 20 }],
    filters: { minCommission: 0, minRating: 0, minDiscount: 0, minPrice: 0, maxPrice: 1000000, extraCommissionOnly: false, freeShippingOnly: false },
  });
  const [schedule, setSchedule] = useState<PlanDraft>(blankPlan);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savedSchedules, setSavedSchedules] = useState<SavedSchedule[]>([]);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const loadSchedules = async () => {
    const result = await api<{ schedules: SavedSchedule[] }>("/search/schedules");
    setSavedSchedules(result.schedules);
  };
  useEffect(() => {
    void loadSchedules().catch((error) => notice((error as Error).message));
  }, []);
  const weekDays = [
    [0, "Dom"], [1, "Seg"], [2, "Ter"], [3, "Qua"], [4, "Qui"], [5, "Sex"], [6, "Sáb"],
  ] as const;
  const saveSchedule = async () => {
    const total = schedule.rules.reduce((sum, rule) => sum + rule.quantity, 0);
    if (!schedule.days.length || !schedule.rules.length || total < 1 || total > 200) return notice("Revise os dias e mantenha o total entre 1 e 200 produtos.");
    setSavingSchedule(true);
    try {
      const saved = await api<SavedSchedule>(editingId ? `/search/schedules/${editingId}` : "/search/schedules", {
        method: editingId ? "PUT" : "POST",
        body: JSON.stringify({ ...schedule, productCount: total }),
      });
      await loadSchedules();
      setSchedule(blankPlan()); setEditingId(null);
      notice(`Plano “${saved.name}” salvo para ${saved.time}.`);
    } catch (error) {
      notice((error as Error).message);
    } finally {
      setSavingSchedule(false);
    }
  };
  const updateSaved = async (item: SavedSchedule, changes: Partial<PlanDraft>) => {
    await api(`/search/schedules/${item.id}`, { method: "PUT", body: JSON.stringify({ ...item, ...changes, execution: undefined }) });
    await loadSchedules();
  };
  const runNow = async (id: string) => {
    setRunningId(id);
    try { await api(`/search/schedules/${id}/run`, { method: "POST" }); await loadSchedules(); notice("Plano executado. Confira o resultado na Visão geral."); }
    catch (error) { notice((error as Error).message); }
    finally { setRunningId(null); }
  };
  const editSchedule = (item: SavedSchedule) => {
    setEditingId(item.id);
    setSchedule({ name: item.name, enabled: item.enabled, bestSellers: item.bestSellers, time: item.time, days: item.days, productCount: item.productCount, rules: item.rules, filters: item.filters });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const nextRun = (item: SavedSchedule) => {
    if (!item.enabled) return "Automação pausada";
    const [hour, minute] = item.time.split(":").map(Number); const now = new Date();
    for (let offset = 0; offset < 8; offset++) { const candidate = new Date(now); candidate.setDate(now.getDate() + offset); candidate.setHours(hour, minute, 0, 0); if (item.days.includes(candidate.getDay()) && candidate > now) return candidate.toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); }
    return "Sem próxima execução";
  };
  const removeSchedule = async (id: string) => {
    try {
      await api(`/search/schedules/${id}`, { method: "DELETE" });
      await loadSchedules();
      notice("Agendamento removido.");
    } catch (error) {
      notice((error as Error).message);
    }
  };
  const toggle = async (id: string, active: boolean) => {
    await api(`/niches/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ active }),
    });
    await reload();
  };
  return (
    <>
      {quickBusy && quickMode === "link" && <SearchProgress mode="link" />}
      <SectionTitle
        title="Central de busca"
        subtitle="Use sua sessão segura da Central de Afiliados; o Lico Primos não armazena cookies nem sua senha"
      />
      <section className="search-center">
        <article className="connection-card">
          <div className={`connection-light ${browserConnection?.connected ? "online" : ""}`}><ShieldCheck /></div>
          <div>
            <b>Central de Afiliados</b>
            <span>{browserConnection?.connected ? "Conectada e pronta" : browserConnection?.available ? "Abra a Central e faça login" : "Navegador Lico Primos fechado"}</span>
          </div>
          <button className="secondary" onClick={() => void loadBrowserConnection()}>Verificar</button>
        </article>
        <div className="search-mode-tabs">
          <button className={quickMode === "free" ? "active" : ""} onClick={() => setQuickMode("free")}><Search /> Busca livre</button>
          <button className={quickMode === "category" ? "active" : ""} onClick={() => setQuickMode("category")}><PackageSearch /> Categoria</button>
          <button className={quickMode === "link" ? "active" : ""} onClick={() => setQuickMode("link")}><ExternalLink /> Adicionar por link</button>
        </div>
        {quickMode === "link" ? (
          <div className="link-import-form">
            <label>Link do produto<input placeholder="https://www.mercadolivre.com.br/... ou https://meli.la/..." value={productLink} onChange={(event) => setProductLink(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void importLink(); } }} /></label>
            <button className="run" disabled={quickBusy || !browserConnection?.connected} onClick={() => void importLink()}>{quickBusy ? <LoaderCircle className="spin" /> : <ExternalLink />} Extrair produto e gerar link</button>
          </div>
        ) : (
          <div className="search-workflow">
            <div className="search-workflow-grid">
              {quickMode === "category" && <label>Categoria<select value={quickCategory} onChange={(event) => setQuickCategory(event.target.value)}>{categories.map(([name]) => <option key={name}>{name}</option>)}</select></label>}
              <label>{quickMode === "free" ? "O que você quer encontrar?" : "Palavra específica (opcional)"}<input autoFocus placeholder={quickMode === "free" ? "Ex.: iPhone 17, creatina, ferramentas" : "Refine a categoria"} value={quickTerm} onChange={(event) => setQuickTerm(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void quickSearch(); } }} /></label>
              <label>Como deseja buscar?<select value={quickStrategy} onChange={(event) => setQuickStrategy(event.target.value)}><option value="general">Produtos em geral</option><option value="best_sellers">Mais vendidos</option><option value="offers">Ofertas do dia</option><option value="discount">Maiores descontos</option><option value="commission">Maiores comissões</option></select></label>
              <label>Modo de busca<select value={quickEngine} onChange={(event) => setQuickEngine(event.target.value as "quick" | "wide")}><option value="quick">Busca rápida — direto na Central</option><option value="wide">Busca ampla — catálogo + conversão</option></select></label>
              <label>Quantidade<select value={quickQuantity} onChange={(event) => setQuickQuantity(Number(event.target.value))}>{[5, 10, 20, 30, 50, 100, 150, 200].map((amount) => <option key={amount}>{amount}</option>)}</select></label>
            </div>
            <details className="manual-search-filters"><summary>Filtros opcionais</summary><div><label>Avaliação mínima<input type="number" min="0" max="5" step="0.1" value={quickMinRating} onChange={(event) => setQuickMinRating(Number(event.target.value))} /></label><label>Desconto mínimo (%)<input type="number" min="0" max="100" value={quickMinDiscount} onChange={(event) => setQuickMinDiscount(Number(event.target.value))} /></label><label>Comissão mínima (%)<input type="number" min="0" max="100" value={quickMinCommission} onChange={(event) => setQuickMinCommission(Number(event.target.value))} /></label><label className="check-row"><input type="checkbox" checked={quickFreeShipping} onChange={(event) => setQuickFreeShipping(event.target.checked)} />Somente frete grátis</label></div></details>
            <div className="search-summary"><div><span>Consulta preparada</span><b>Buscar {quickQuantity} produtos {quickMode === "category" ? `de ${quickCategory}` : quickTerm.trim() ? `para “${quickTerm.trim()}”` : "em geral"}</b><small>{quickEngine === "wide" ? "Catálogo amplo com conversão individual" : `Estratégia: ${strategyLabels[quickStrategy]}`}</small></div><button className="run" disabled={quickBusy || !browserConnection?.connected} onClick={() => void quickSearch()}>{quickBusy ? <LoaderCircle className="spin" /> : <Play />} Iniciar busca</button></div>
          </div>
        )}
        <p className="secure-session-note"><ShieldCheck /> Sessão lida diretamente do navegador conectado. Cookies não são exibidos nem salvos pelo Lico Primos.</p>
      </section>
      <SectionTitle
        title={editingId ? "Editar plano de busca" : "Novo plano de busca"}
        subtitle="Combine categorias e quantidades; a busca é geral e Mais vendidos é opcional"
      />
      <section className="automation-card search-plan-editor">
        <div className="automation-status">
          <div className="stat-icon"><Settings2 /></div>
          <div>
            <b>{editingId ? "Editando automação" : "Plano independente"}</b>
            <small>Central de Afiliados · {schedule.bestSellers ? "Mais vendidos" : "Busca geral"} · limite total de 200</small>
          </div>
          <button
            title={schedule.enabled ? "Pausar busca automática" : "Ativar busca automática"}
            className={`toggle ${schedule.enabled ? "on" : ""}`}
            onClick={() => setSchedule({ ...schedule, enabled: !schedule.enabled })}
          ><span /></button>
        </div>
        <label className="automation-time">Nome do plano<input value={schedule.name} maxLength={80} onChange={(event) => setSchedule({ ...schedule, name: event.target.value })} /></label>
        <label className="all-days-choice best-sellers-plan"><input type="checkbox" checked={schedule.bestSellers} onChange={(event) => setSchedule({ ...schedule, bestSellers: event.target.checked })} /> Buscar somente Mais vendidos</label>
        <label className="automation-time">
          Horário da busca
          <input type="time" value={schedule.time} onChange={(event) => setSchedule({ ...schedule, time: event.target.value })} />
        </label>
        <label className="all-days-choice">
          <input
            type="checkbox"
            checked={schedule.days.length === 7}
            onChange={(event) => setSchedule({ ...schedule, days: event.target.checked ? [0, 1, 2, 3, 4, 5, 6] : [] })}
          /> Aplicar a todos os dias
        </label>
        <div className="weekday-picker">
          {weekDays.map(([value, label]) => (
            <button
              type="button"
              title={`${schedule.days.includes(value) ? "Remover" : "Adicionar"} ${label}`}
              className={schedule.days.includes(value) ? "selected" : ""}
              onClick={() => setSchedule({ ...schedule, days: schedule.days.includes(value) ? schedule.days.filter((day) => day !== value) : [...schedule.days, value] })}
              key={value}
            >{label}</button>
          ))}
        </div>
        <div className="search-rules">
          <div className="rules-heading"><div><b>O que buscar</b><small>Distribua até 200 produtos entre as categorias</small></div><strong>{schedule.rules.reduce((sum, rule) => sum + rule.quantity, 0)}/200</strong></div>
          {schedule.rules.map((rule, index) => (
            <div className="search-rule" key={rule.id}>
              <span>{index + 1}</span>
              <select value={rule.category} onChange={(event) => { const category = event.target.value; const query = categories.find(([name]) => name === category)?.[1] ?? ""; setSchedule({ ...schedule, rules: schedule.rules.map((item) => item.id === rule.id ? { ...item, category, query } : item) }); }}>
                {categories.map(([name]) => <option key={name}>{name}</option>)}
              </select>
              <input title="Palavra específica (opcional)" placeholder="Palavra específica (opcional)" value={rule.query} onChange={(event) => setSchedule({ ...schedule, rules: schedule.rules.map((item) => item.id === rule.id ? { ...item, query: event.target.value } : item) })} />
              <input title="Quantidade desta categoria" type="number" min="1" max="200" value={rule.quantity} onChange={(event) => setSchedule({ ...schedule, rules: schedule.rules.map((item) => item.id === rule.id ? { ...item, quantity: Math.max(1, Math.min(200, Number(event.target.value) || 1)) } : item) })} />
              <button title="Remover categoria" className="danger-icon" disabled={schedule.rules.length === 1} onClick={() => setSchedule({ ...schedule, rules: schedule.rules.filter((item) => item.id !== rule.id) })}><Trash2 /></button>
            </div>
          ))}
          <button className="secondary add-rule" disabled={schedule.rules.length >= 20} onClick={() => setSchedule({ ...schedule, rules: [...schedule.rules, { id: crypto.randomUUID(), category: "Geral", query: "", quantity: 10 }] })}>+ Adicionar categoria</button>
        </div>
        <details className="plan-filters">
          <summary>Filtros de qualidade</summary>
          <div>
            <label>Avaliação mínima<input type="number" min="0" max="5" step="0.1" value={schedule.filters.minRating} onChange={(e) => setSchedule({ ...schedule, filters: { ...schedule.filters, minRating: Number(e.target.value) } })} /></label>
            <label>Comissão mínima (%)<input type="number" min="0" max="100" value={schedule.filters.minCommission} onChange={(e) => setSchedule({ ...schedule, filters: { ...schedule.filters, minCommission: Number(e.target.value) } })} /></label>
            <label>Desconto mínimo (%)<input type="number" min="0" max="100" value={schedule.filters.minDiscount} onChange={(e) => setSchedule({ ...schedule, filters: { ...schedule.filters, minDiscount: Number(e.target.value) } })} /></label>
            <label>Preço mínimo<input type="number" min="0" value={schedule.filters.minPrice} onChange={(e) => setSchedule({ ...schedule, filters: { ...schedule.filters, minPrice: Number(e.target.value) } })} /></label>
            <label>Preço máximo<input type="number" min="0" value={schedule.filters.maxPrice} onChange={(e) => setSchedule({ ...schedule, filters: { ...schedule.filters, maxPrice: Number(e.target.value) } })} /></label>
            <label className="check-row"><input type="checkbox" checked={schedule.filters.extraCommissionOnly} onChange={(e) => setSchedule({ ...schedule, filters: { ...schedule.filters, extraCommissionOnly: e.target.checked } })} />Somente ganhos extras</label>
            <label className="check-row"><input type="checkbox" checked={schedule.filters.freeShippingOnly} onChange={(e) => setSchedule({ ...schedule, filters: { ...schedule.filters, freeShippingOnly: e.target.checked } })} />Somente frete grátis</label>
          </div>
        </details>
        <div className="plan-actions">
        <button className="run save-automation" disabled={savingSchedule || !schedule.days.length} onClick={() => void saveSchedule()}>
          {savingSchedule ? <LoaderCircle className="spin" /> : <Settings2 />} {editingId ? "Salvar alterações" : "Salvar plano"}
        </button>
        {editingId && <button className="secondary" onClick={() => { setEditingId(null); setSchedule(blankPlan()); }}>Cancelar edição</button>}
        </div>
        <p className="automation-note">O Chrome Lico Primos deve permanecer aberto, minimizado e conectado à sua conta do Mercado Livre.</p>
      </section>
      <SectionTitle
        title="Agenda de buscas"
        subtitle="Automações registradas e prontas para executar nos horários escolhidos"
      />
      <section className="schedule-agenda">
        {savedSchedules.map((item) => (
          <article key={item.id}>
            <div className="schedule-time"><b>{item.time}</b><span>{item.enabled ? "ATIVA" : "PAUSADA"}</span></div>
            <div>
              <b>{item.name} · {item.productCount} produtos · {item.bestSellers ? "Mais vendidos" : "Busca geral"}</b>
              <small>{item.days.length === 7 ? "Todos os dias" : item.days.map((day) => weekDays.find(([value]) => value === day)?.[1]).join(" · ")}</small>
              <small>{item.rules.map((rule) => `${rule.category}: ${rule.quantity}`).join(" · ")}</small>
              <small><b>Próxima:</b> {nextRun(item)}</small>
              {item.execution && <small className={`execution ${item.execution.status}`} title={item.execution.error}><b>{item.execution.status === "running" ? "Executando" : item.execution.status === "success" ? "Concluída" : item.execution.status === "empty" ? "Sem novos produtos" : item.execution.status === "failed" ? "Falhou" : "Aguardando"}</b>{item.execution.finishedAt ? ` · ${new Date(item.execution.finishedAt).toLocaleString("pt-BR")}` : ""}{typeof item.execution.foundCount === "number" ? ` · ${item.execution.foundCount} encontrados` : ""}{item.execution.error ? ` · ${item.execution.error}` : ""}</small>}
            </div>
            <div className="schedule-actions">
              <button title="Executar este plano agora" onClick={() => void runNow(item.id)} disabled={runningId === item.id}>{runningId === item.id ? <LoaderCircle className="spin" /> : <Play />}</button>
              <button title="Editar plano" onClick={() => editSchedule(item)}><Settings2 /></button>
              <button title={item.enabled ? "Pausar plano" : "Ativar plano"} onClick={() => void updateSaved(item, { enabled: !item.enabled })}>{item.enabled ? "II" : <Play />}</button>
              <button title="Remover este plano" className="danger-icon" onClick={() => void removeSchedule(item.id)}><Trash2 /></button>
            </div>
          </article>
        ))}
        {!savedSchedules.length && <div className="empty compact"><History /><h3>Nenhuma automação registrada</h3></div>}
      </section>
      <SectionTitle
        title="Histórico de pesquisas"
        subtitle="Todas as palavras buscadas ficam disponíveis para repetir e comparar resultados"
      />
      <section className="history-grid">
        {data?.searchHistory?.map((item) => (
          <button
            title={`Pesquisar novamente por ${item.term}`}
            onClick={() => void search(item.term)}
            key={item.term}
          >
            <Search />
            <span>
              <b>{item.term}</b>
              <small>
                {item.searches} busca(s) · {item.lastResultCount} produto(s) na
                última
              </small>
            </span>
            <time>
              {new Date(item.lastSearchedAt).toLocaleDateString("pt-BR")}
            </time>
          </button>
        ))}
        {!data?.searchHistory?.length && (
          <div className="empty compact">
            <History />
            <h3>O histórico começa na sua próxima busca</h3>
          </div>
        )}
      </section>
      <SectionTitle
        title="Temas para descobrir"
        subtitle="Ative temas amplos; eles ajudam nas varreduras automáticas, mas não limitam suas pesquisas manuais"
      />
      <section className="settings-grid discovery-grid">
        {data?.niches.map((n) => (
          <article key={n.id}>
            <div className="stat-icon">
              <Settings2 />
            </div>
            <div>
              <h3>{n.name}</h3>
              <p>{JSON.parse(n.wantedKeywords).join(" · ")}</p>
              <button
                title={`Pesquisar produtos de ${n.name}`}
                className="text-action"
                onClick={() => void search(n.name)}
              >
                Explorar agora
              </button>
            </div>
            <button
              title={
                n.active
                  ? "Pausar descoberta automática"
                  : "Ativar descoberta automática"
              }
              className={`toggle ${n.active ? "on" : ""}`}
              onClick={() => toggle(n.id, !n.active)}
            >
              <span />
            </button>
          </article>
        ))}
      </section>
    </>
  );
}
function Integrations({
  data,
  setNotice,
}: {
  data: Dashboard | null;
  setNotice: (s: string) => void;
}) {
  const connect = async () => {
    try {
      const r = await api<{ authorizationUrl: string }>(
        "/mercadolivre/connect",
        { method: "POST" },
      );
      window.location.assign(r.authorizationUrl);
    } catch (e) {
      setNotice((e as Error).message);
    }
  };
  return (
    <>
      <SectionTitle
        title="Integração oficial"
        subtitle="Conexão segura com o Mercado Livre por OAuth"
      />
      <section className="integration-list">
        {data?.integrations.map((i) => (
          <article key={i.id}>
            <div className="store-avatar">
              <img src="/brands/mercado_livre.svg" alt="" />
            </div>
            <div>
              <h3>{i.name}</h3>
              <p>{i.reason}</p>
            </div>
            <span className={i.enabled ? "connected" : "disabled"}>
              {i.enabled ? "CONECTADA" : "DESCONECTADA"}
            </span>
          </article>
        ))}
      </section>
      {!data?.integrations[0]?.enabled && (
        <button className="run" onClick={connect}>
          <ShieldCheck /> Conectar Mercado Livre
        </button>
      )}
    </>
  );
}
function ConnectionsHub({
  data,
  platform,
  reload,
  notice,
}: {
  data: Dashboard | null;
  platform: Platform;
  reload: () => Promise<void>;
  notice: (s: string) => void;
}) {
  const [section, setSection] = useState("Redes");
  const tabs = ["Redes", "Telegram", "WhatsApp", "Grupos e canais"];
  return (
    <>
      <div className="hub-tabs">
        {tabs.map((item) => (
          <button
            className={section === item ? "active" : ""}
            onClick={() => setSection(item)}
            key={item}
          >
            {item}
          </button>
        ))}
      </div>
      {section === "Redes" && (
        <>
          <Integrations data={data} setNotice={notice} />
          <NetworksPage platform={platform} reload={reload} notice={notice} />
        </>
      )}
      {section === "Telegram" && (
        <MessagingPage
          kind="telegram"
          platform={platform}
          reload={reload}
          notice={notice}
        />
      )}{" "}
      {section === "WhatsApp" && (
        <MessagingPage
          kind="whatsapp"
          platform={platform}
          reload={reload}
          notice={notice}
        />
      )}{" "}
      {section === "Grupos e canais" && (
        <ChannelsPage platform={platform} reload={reload} notice={notice} />
      )}
    </>
  );
}
