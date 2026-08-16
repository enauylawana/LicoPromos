# Lico Primos — Oferta Master Pro

Aplicação em Node.js e React para garimpar, validar, organizar e distribuir ofertas reais do Mercado Livre. Links liberados para distribuição precisam ter sido confirmados pelo programa de afiliados no domínio oficial `meli.la`.

## O que já funciona

- painel responsivo com login, modo claro e escuro;
- busca oficial do catálogo do Mercado Livre por palavras-chave;
- nichos editáveis, filtros, desconto, pontuação e prevenção de duplicidade;
- SQLite com Prisma, histórico de preços e disparos por produto, fila, auditoria e execuções do agendador;
- aprovação/rejeição, cópia da mensagem e registro de publicação manual;
- busca manual e planos de busca recorrentes por dias e horários em `America/Porto_Velho`;
- proteção de senha, cookie HttpOnly, rate limiting, Helmet, Zod e segredos somente no servidor;
- sessão de afiliado persistida no perfil local do Chrome e iniciada
  automaticamente em uma instância isolada fora da tela, sem abrir abas no
  navegador usado pela pessoa durante as buscas;
- varredura sequencial das páginas públicas de resultados até completar a
  quantidade de produtos aprovados ou esgotar as páginas disponíveis;
- geração do link pela barra **Compartilhar** da página do anúncio, com
  confirmação isolada daquele item na Central quando a barra não responder;
- verificação horária incremental de preço, estoque e situação do anúncio;
- alertas internos de queda de preço e sugestão de substituto do mesmo nicho;
- cópias curta urgente e racional, sempre com um único link confirmado;
- distribuição agendada com intervalos fixos ou naturais de 3 a 7 minutos, limites diários e histórico;
- Telegram Bot API e sessão local experimental do WhatsApp Web;
- relatórios reais, ranking de produtos em alta e endpoint de heartbeat;
- testes automatizados das regras principais.

## Instalação para iniciantes

É necessário ter Node.js 22 ou mais recente.

```bash
npm install
cp .env.example .env
npm run setup
npm run dev
```

O comando `npm run setup` cria o banco e, quando ainda não existe administrador e
`ADMIN_EMAIL`/`ADMIN_PASSWORD` estão vazios, gera credenciais aleatórias exibidas
uma única vez no terminal. Guarde-as para o primeiro acesso. Se preferir definir
as próprias credenciais, preencha as duas variáveis antes de executar o setup.

Abra `http://localhost:5174`. Troque também o `SESSION_SECRET` antes de expor o
sistema em uma rede.

Para testar e gerar uma versão pronta:

```bash
npm test
npm run build
```

## Conectar o Mercado Livre

1. Crie uma aplicação no portal oficial de desenvolvedores do Mercado Livre.
2. Faça o fluxo OAuth 2.0 documentado pelo Mercado Livre.
3. Coloque o access token somente no `.env`, em `MERCADO_LIVRE_ACCESS_TOKEN`.
4. Execute `npm run dev`, entre no painel e clique em **Procurar agora**.

O token normalmente expira e deve ser renovado pelo fluxo oficial com refresh token. A renovação automática será a próxima etapa; nunca coloque sua senha do Mercado Livre no sistema.

## Extensão local de captura

A pasta `extension/` contém a extensão Chrome do Lico Primos. Ela captura somente
os dados visíveis dos cards e o link curto gerado pela própria Central de
Afiliados. A extensão não lê, exporta nem armazena cookies ou senhas.

1. Inicie o projeto com `npm run dev`.
2. Abra `chrome://extensions` no Chrome.
3. Ative **Modo do desenvolvedor**.
4. Clique em **Carregar sem compactação**.
5. Selecione a pasta absoluta `AFILIADOS/extension`.
6. Abra a Central de Afiliados, marque os cards e use **Capturar e enviar**.

O servidor aceita a captura apenas de uma origem `chrome-extension://`, via
`localhost`, e os produtos entram como pendentes no Centro de Distribuição.

## Fluxo operacional

1. Entre no painel.
2. Confirme que o token do Mercado Livre foi configurado.
3. Faça uma busca ou configure um plano em **Descoberta**.
4. Confirme que os produtos possuem link oficial `https://meli.la/...`.
5. Selecione produtos e destinos no **Centro de Distribuição**.
6. Revise campanha, intervalo e início antes de confirmar.
7. Consulte o histórico no detalhe do produto e os totais em **Relatórios**.

`DRY_RUN=true` permanece como trava global do ambiente. O envio só ocorre depois de uma campanha explícita e para destinos previamente conectados.

## Jobs e heartbeat

- Busca agendada e fila de distribuição: avaliadas a cada minuto.
- Verificação de preço/estoque: minuto 17 de cada hora, em lotes definidos por `PRICE_VERIFIER_BATCH_SIZE`.
- `GET /api/heartbeat`: saúde do serviço e última verificação de preços.
- `POST /api/heartbeat/price-verifier`: dispara uma verificação sob demanda (`{ "limit": 20 }`).
- `GET /api/reports/trending`: ranking dos produtos ativos por score, queda de preço e envios recentes.
- `GET /api/reports/member-growth`: total e variação de participantes quando a sessão conectada disponibiliza essa informação.

Para execução 24/7, use o build de produção em uma máquina ou serviço sempre ligado. Em múltiplas instâncias, migre SQLite e os jobs locais para PostgreSQL e uma fila distribuída.

## Situação da integração oficial (verificada em 6 de agosto de 2026)

### Mercado Livre

A busca usa o catálogo público e os endpoints oficiais disponíveis para validar
produto e preço. O Programa de Afiliados orienta gerar links pela Barra de
Afiliados, Central ou Gerador de Links. Não há uma API pública de geração de link
afiliado confirmada para este projeto. A distribuição só aceita um link depois
de confirmar o prefixo oficial `https://meli.la/`; a URL comum do anúncio nunca
é tratada como link comissionado.

- [Documentação oficial de itens e buscas](https://developers.mercadolivre.com.br/pt_br/itens-e-buscas)
- [Perguntas oficiais do Programa de Afiliados](https://www.mercadolivre.com.br/l/primeiros-passos-perguntas-frequentes-para-afiliados)

### WhatsApp

A WhatsApp Business Platform é voltada a mensagens para destinatários autorizados e exige consentimento, modelos e cumprimento das políticas aplicáveis. O conector de grupos via WhatsApp Web existente é experimental e pode exigir nova autenticação quando o WhatsApp mudar; para produção, priorize integrações oficiais compatíveis com o caso de uso.

- [Documentação oficial da WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api/)

## Credenciais

Crie contas somente nos portais oficiais. Depois de aprovado, copie `.env.example` para `.env` e preencha localmente. Nunca envie tokens pelo chat, não grave credenciais no Git e não as coloque no front-end. O botão **Testar integrações** explica por que cada adaptador está desativado sem revelar valores.

## Banco e dados

O SQLite fica em `prisma/data/offers.db`. O comando de preparação usa o SQL versionado em `prisma/init.sql`, de forma repetível, e o Prisma atende às consultas da aplicação. As tabelas incluem usuários, lojas, nichos, ofertas, histórico de preços, links, publicações, execuções, configurações e auditoria. A chave composta `storeId + externalId` impede duplicidade do mesmo produto por loja.

## Publicação e produção

Para uso local, `npm run dev` inicia API e painel. Para produção, execute `npm run build` e `npm start` atrás de HTTPS e de um proxy reverso confiável. Use uma senha forte, um `SESSION_SECRET` aleatório, backups do banco e limites de acesso de rede. Para múltiplas instâncias, substitua SQLite por PostgreSQL e o agendador local por uma fila distribuída antes de escalar.

## Limitações conhecidas

- Sem um access token válido, nenhuma oferta é criada.
- Imagens e informações vêm das respostas oficiais do Mercado Livre.
- O access token atual precisa ser renovado pelo processo OAuth quando expirar.
- Nem toda publicação informa preço anterior; sem ele, o sistema não inventa desconto.
- O histórico interno ajuda a comparar preços coletados, mas não prova sozinho que uma promoção é verdadeira.
- A integração experimental com WhatsApp Web depende de sessão válida e não contorna CAPTCHA, bloqueios ou políticas da plataforma.

## Erros comuns

- **Banco não existe:** execute `npm run setup`.
- **Login não funciona:** confira `ADMIN_EMAIL` e `ADMIN_PASSWORD`; se mudou depois do seed, recrie o usuário de desenvolvimento ou ajuste pelo Prisma Studio.
- **Porta ocupada:** altere `PORT` no `.env`; o proxy do Vite também deve apontar para a mesma porta.
- **Integração desativada:** isso é esperado sem aprovação e credenciais oficiais.
- **Token do Mercado Livre expirado:** um erro `401 Unauthorized` indica que o token precisa ser renovado pelo fluxo OAuth 2.0.
- **WhatsApp Web desconectado:** escaneie novamente o QR code pelo painel antes de retomar campanhas.
- **Nenhuma oferta confirmada:** confira se a sessão do perfil isolado ainda está autenticada e se os anúncios geram links `meli.la`.

## Roadmap

- renovação automática do access token do Mercado Livre;
- fila distribuída e PostgreSQL para ambientes com múltiplas instâncias;
- integração oficial com a WhatsApp Cloud API;
- painel proativo de saúde das integrações.

## Licença

Projeto de uso privado. Não redistribua seus componentes sem autorização.
