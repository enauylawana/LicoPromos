import { execFile, spawn } from "node:child_process";
import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const DEFAULT_CDP_URL = "http://127.0.0.1:9222";
const HUB_URL = "https://www.mercadolivre.com.br/afiliados/hub?is_affiliate=true";
const PROFILE_PATH = path.resolve(".runtime/lico-primos-chrome-profile");

let startup: Promise<void> | undefined;
const execFileAsync = promisify(execFile);

/**
 * O Chrome dedicado precisa ser completo porque o Hub rejeita headless. No
 * macOS, uma navegação pode tornar novamente visível uma janela que nasceu com
 * `open -j`. Ocultamos somente o processo que usa o perfil do Lico Primos; o
 * Chrome pessoal da pessoa nunca é afetado.
 */
export async function hideAffiliateBrowser() {
  if (process.platform !== "darwin") return;
  try {
    const { stdout } = await execFileAsync("pgrep", [
      "-f",
      `--user-data-dir=${PROFILE_PATH}`,
    ]);
    const pids = stdout
      .split(/\s+/)
      .map(Number)
      .filter((pid) => Number.isSafeInteger(pid) && pid > 1);
    if (!pids.length) return;
    const conditions = pids.map((pid) => `unix id is ${pid}`).join(" or ");
    await execFileAsync("osascript", [
      "-e",
      `tell application "System Events" to set visible of every process whose ${conditions} to false`,
    ]);
  } catch {
    // A automação continua fora da tela pela posição negativa mesmo quando o
    // macOS não concede acesso ao System Events.
  }
}

async function cdpAvailable(cdpUrl: string) {
  try {
    const response = await fetch(`${cdpUrl}/json/version`, {
      signal: AbortSignal.timeout(1_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function findChromeExecutable() {
  const candidates = [
    process.env.AFFILIATE_CHROME_EXECUTABLE,
    path.join(
      process.env.HOME ?? "",
      "Applications/Google Chrome Lico Primos.app/Contents/MacOS/Google Chrome",
    ),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    path.join(
      process.env.HOME ?? "",
      "Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Tenta a próxima instalação conhecida.
    }
  }
  throw new Error("Google Chrome não foi encontrado neste computador.");
}

async function startBackgroundBrowser(cdpUrl: string) {
  if (await cdpAvailable(cdpUrl)) return;
  const parsedUrl = new URL(cdpUrl);
  if (!["127.0.0.1", "localhost"].includes(parsedUrl.hostname)) {
    throw new Error("O navegador de afiliados configurado não está disponível.");
  }

  const port = parsedUrl.port || "9222";
  const executable = await findChromeExecutable();
  await mkdir(PROFILE_PATH, { recursive: true });
  const chromeArguments = [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${PROFILE_PATH}`,
      // A Central de Afiliados recusa o modo headless. Mantemos uma instância
      // completa e isolada fora da área visível, sem criar abas no Chrome usado
      // pela pessoa. É esse perfil que conserva os cookies da sessão.
      "--window-position=-20000,-20000",
      "--window-size=1440,1200",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      HUB_URL,
    ];
  const appPath = executable.includes('/Contents/MacOS/')
    ? executable.slice(0, executable.indexOf('/Contents/MacOS/'))
    : undefined;
  // `open -g -j -n` inicia uma instância nova, oculta e sem ativá-la. Isso
  // evita que o macOS troque o foco do aplicativo atual para o Chrome usado
  // pela automação.
  const child = process.platform === 'darwin' && appPath
    ? spawn('open', ['-g', '-j', '-n', appPath, '--args', ...chromeArguments], { detached: true, stdio: 'ignore' })
    : spawn(executable, chromeArguments,
    { detached: true, stdio: "ignore" },
    );
  child.unref();

  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (await cdpAvailable(cdpUrl)) return;
  }
  throw new Error("O Chrome invisível não iniciou dentro do tempo esperado.");
}

/**
 * Mantém a sessão do Mercado Livre no perfil local do Chrome. Os cookies ficam
 * no armazenamento protegido do próprio perfil e nunca passam pela API. O Hub
 * bloqueia navegadores headless, então a janela completa fica fora da tela.
 */
export function ensureAffiliateBrowser(cdpUrl = process.env.AFFILIATE_CHROME_URL ?? DEFAULT_CDP_URL) {
  startup ??= startBackgroundBrowser(cdpUrl)
    .then(async () => {
      await hideAffiliateBrowser();
    })
    .finally(() => {
      startup = undefined;
    });
  return startup;
}
