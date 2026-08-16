import { spawn } from "node:child_process";
import { access, mkdir } from "node:fs/promises";
import path from "node:path";

const port = 9222;
const profile = path.resolve(".runtime/lico-primos-chrome-profile");
const headless = process.env.AFFILIATE_BROWSER_HEADLESS === "true";
const background = process.env.AFFILIATE_BROWSER_BACKGROUND === "true" || headless;
await mkdir(profile, { recursive: true });

const chromeCandidates = [
  process.env.AFFILIATE_CHROME_EXECUTABLE,
  path.join(process.env.HOME ?? "", "Applications/Google Chrome Lico Primos.app/Contents/MacOS/Google Chrome"),
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  path.join(process.env.HOME ?? "", "Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
].filter(Boolean);

let chromeExecutable;
for (const candidate of chromeCandidates) {
  try {
    await access(candidate);
    chromeExecutable = candidate;
    break;
  } catch {
    // Procura a próxima instalação possível do Chrome oficial.
  }
}

if (!chromeExecutable) {
  console.error("Google Chrome normal não encontrado. Instale-o em /Applications antes de iniciar o navegador de afiliados.");
  process.exit(1);
}

try {
  const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
    signal: AbortSignal.timeout(1_000),
  });
  if (response.ok) {
    console.log("Chrome Lico Primos já está conectado e pode permanecer minimizado.");
    process.exit(0);
  }
} catch {
  // Inicia uma nova sessão dedicada quando a porta ainda não está disponível.
}

const chromeArguments = [
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  ...(background
    ? ["--window-position=-20000,-20000", "--window-size=1440,1200"]
    : ["--start-maximized"]),
  "https://www.mercadolivre.com.br/afiliados/hub?is_affiliate=true",
];

// No macOS, `open -na` força uma instância independente. Executar o binário
// diretamente pode encaminhar os argumentos para outra janela já aberta e
// deixar de ativar a porta usada pela automação.
const child = process.platform === "darwin" && !background
  ? spawn("open", ["-na", chromeExecutable, "--args", ...chromeArguments], { detached: true, stdio: "ignore" })
  : spawn(chromeExecutable, chromeArguments, { detached: true, stdio: "ignore" });
child.unref();
console.log(
  background
    ? "Central de Afiliados iniciada em uma instância isolada fora da tela."
    : "Chrome normal do Lico Primos iniciado. Entre no Mercado Livre uma vez e depois mantenha a janela minimizada.",
);
