# Integração do Lico Primos com n8n

Esta API adiciona automação sem substituir as rotas, a interface, a busca agendada ou a fila existente. Durante a homologação, nenhuma chamada ao WhatsApp ou Telegram é permitida.

## 1. Variáveis de ambiente

```env
DRY_RUN=true
EXTERNAL_PUBLISHING_ENABLED=false
N8N_API_KEY=gere-uma-chave-aleatoria-com-pelo-menos-24-caracteres
```

Gere uma chave localmente:

```bash
openssl rand -base64 32
```

Reinicie a API depois de alterar o `.env`. Para acesso remoto do n8n, publique a API somente por HTTPS e restrinja a rede ou o proxy à origem esperada.

As duas travas de envio são independentes. Uma mensagem externa só pode sair quando:

```env
DRY_RUN=false
EXTERNAL_PUBLISHING_ENABLED=true
```

Durante os testes, mantenha exatamente o inverso. `POST /publish` criará a fila, mas o adaptador de mensagem será bloqueado.

Controles opcionais de entrega:

```env
WHATSAPP_QUIET_START=23:30
WHATSAPP_QUIET_END=07:00
```

O modo atual `fixed` continua respeitando os 10 minutos configurados. O modo opcional `safe_random` usa de 2 a 15 minutos e não é ativado automaticamente. `GET /api/products/{id}/story` gera somente um JSON 1080x1920 para futura integração com Instagram/Canva; não publica nada.

## 2. Autenticação no n8n

Em cada node **HTTP Request**, configure:

- Authentication: `Generic Credential Type`;
- Generic Auth Type: `Header Auth`;
- Name: `X-API-Key`;
- Value: a mesma chave de `N8N_API_KEY`.

Também é aceito `Authorization: Bearer <chave>`. Não coloque a chave diretamente no JSON do workflow.

Base local:

```text
http://localhost:3000/api
```

Se o n8n estiver em Docker, `localhost` aponta para o contêiner. Use o hostname do serviço na mesma rede ou `host.docker.internal` quando aplicável.

## 3. Fluxo recomendado

### Busca complementar pela API oficial

O campo `searchSource` é opcional. O valor padrão `affiliate_hub` preserva o fluxo existente. Use `official_api` para buscar sem abrir navegador. Essa fonte fornece o endereço normal do anúncio, mas não cria link afiliado: o produto fica em `awaiting_affiliate_link` e não pode ser aprovado ou publicado.

Quando `query` não é informada, o backend escolhe um termo do catálogo versionado de oito nichos. A escolha considera histórico, evita repetição excessiva e acrescenta modificadores de intenção, sinônimos e sazonalidade brasileira. O n8n não precisa manter uma segunda lista de palavras-chave.

```bash
curl --request POST "$LICO_API_URL/search/run" \
  --header "X-API-Key: $LICO_N8N_KEY" \
  --header 'Content-Type: application/json' \
  --data '{"query":"tênis corrida","limit":50,"searchSource":"official_api","filters":{"maxPrice":200,"minDiscount":20,"minRating":4}}'
```

Exporte os candidatos para revisão e geração manual do link na Central de Afiliados:

```bash
curl "$LICO_API_URL/products/candidates/export.txt?status=awaiting_affiliate_link&limit=100" \
  --header "X-API-Key: $LICO_N8N_KEY" \
  --output candidatos-mercado-livre.txt
```

Depois, cadastre o link oficial. O status muda automaticamente para `pending`; a aprovação continua separada:

```bash
curl --request PATCH "$LICO_API_URL/products/ID_DO_PRODUTO" \
  --header "X-API-Key: $LICO_N8N_KEY" \
  --header 'Content-Type: application/json' \
  --data '{"affiliateUrl":"https://meli.la/SEU_LINK"}'
```

1. Iniciar a busca.
2. Consultar o job até `status` ser `succeeded` ou `failed` (`finishedAt` também será preenchido).
3. Listar candidatos `pending`.
4. Validar cada candidato.
5. Aprovar ou rejeitar com `PATCH`.
6. Colocar apenas aprovados na fila usando uma chave idempotente estável.
7. Consultar o histórico.

Não repita automaticamente erros `400`, `401`, `404` ou `409`. Para erros `429` ou `500`, use espera exponencial e preserve a mesma `Idempotency-Key`.

## 4. Exemplos cURL

Defina valores locais sem gravá-los no histórico do projeto:

```bash
export LICO_API_URL='http://localhost:3000/api'
export LICO_N8N_KEY='substitua-pela-chave-do-env'
```

### Iniciar busca

```bash
curl --request POST "$LICO_API_URL/search/run" \
  --header "X-API-Key: $LICO_N8N_KEY" \
  --header 'Content-Type: application/json' \
  --data '{
    "query": "notebook",
    "limit": 20,
    "mode": "quick",
    "strategy": "discount",
    "filters": {
      "minRating": 4.5,
      "minDiscount": 20,
      "minCommission": 0,
      "freeShippingOnly": false
    }
  }'
```

### Consultar job

```bash
curl "$LICO_API_URL/search/jobs/SEU_JOB_ID" \
  --header "X-API-Key: $LICO_N8N_KEY"
```

### Listar candidatos

```bash
curl "$LICO_API_URL/products/candidates?status=pending&minScore=60&limit=20&offset=0" \
  --header "X-API-Key: $LICO_N8N_KEY"
```

### Validar produto

```bash
curl "$LICO_API_URL/products/SEU_PRODUCT_ID/validate" \
  --header "X-API-Key: $LICO_N8N_KEY"
```

A resposta inclui `valid`, `available`, `realPrice`, `confirmedAffiliateLink`,
`currentPrice`, `affiliateUrl`, `stock` e `freeShipping` no nível principal. Os
mesmos testes detalhados permanecem disponíveis em `quality.checks`.

### Aprovar produto

```bash
curl --request PATCH "$LICO_API_URL/products/SEU_PRODUCT_ID" \
  --header "X-API-Key: $LICO_N8N_KEY" \
  --header 'Content-Type: application/json' \
  --data '{"status":"approved"}'
```

### Rejeitar produto

```bash
curl --request PATCH "$LICO_API_URL/products/SEU_PRODUCT_ID" \
  --header "X-API-Key: $LICO_N8N_KEY" \
  --header 'Content-Type: application/json' \
  --data '{"status":"rejected"}'
```

### Colocar produto aprovado na fila

Use uma chave determinística, por exemplo `produto + grupo + data da campanha`. Repetir a mesma requisição com essa chave devolve a resposta original sem criar outra publicação.

```bash
curl --request POST "$LICO_API_URL/products/SEU_PRODUCT_ID/publish" \
  --header "X-API-Key: $LICO_N8N_KEY" \
  --header 'Idempotency-Key: produto-grupo-2026-08-10' \
  --header 'Content-Type: application/json' \
  --data '{
    "channelIds": ["ID_DO_GRUPO_DE_TESTE"],
    "name": "Homologação n8n",
    "intervalMinutes": 5
  }'
```

### Histórico

```bash
curl "$LICO_API_URL/publications/history?status=queued&limit=50&offset=0" \
  --header "X-API-Key: $LICO_N8N_KEY"
```

### Registrar erro de workflow

```bash
curl --request POST "$LICO_API_URL/logs/error" \
  --header "X-API-Key: $LICO_N8N_KEY" \
  --header 'Content-Type: application/json' \
  --data '{
    "executionId": "12345",
    "workflowName": "Seleção e Publicação",
    "node": "Publicar produto",
    "productId": "SEU_PRODUCT_ID",
    "endpoint": "/api/products/SEU_PRODUCT_ID/publish",
    "httpStatus": 409,
    "message": "Produto não aprovado",
    "timestamp": "2026-08-10T20:00:00-04:00",
    "attempts": 1
  }'
```

O endpoint aceita somente esses campos, limita seus tamanhos e grava o evento em `AuditLog` com a ação `n8n.workflow.error`. Ele não chama integrações externas.

## 5. Status padronizados

- `pending`: aguardando decisão;
- `approved`: aprovado para entrar na fila;
- `queued`: criado ou pausado na fila;
- `published`: envio concluído;
- `rejected`: rejeitado por regra ou revisão;
- `expired`: anúncio ou estoque expirado;
- `failed`: falha de validação ou processamento.

A API converte estados internos antigos, como `scheduled`, `paused`, `sent` e `suspicious`, para esse conjunto. Isso preserva a compatibilidade da interface existente.

Uma resposta de publicação com `status: queued` e `dryRun: true` nunca deve ser
registrada como `published`. A API recusa essa transição enquanto não existir
uma publicação interna com envio efetivamente concluído.

## 6. Idempotência

`POST /products/{id}/publish` exige `Idempotency-Key`:

- mesma chave e mesmo corpo: retorna a primeira resposta;
- mesma chave e corpo diferente: `409 idempotency_conflict`;
- mesma chave ainda em processamento: `409 request_in_progress`;
- chaves ficam registradas por sete dias;
- a restrição única no banco impede duplicidade concorrente.

## 7. Erros

Formato:

```json
{
  "error": {
    "code": "product_not_approved",
    "message": "Apenas produtos aprovados podem entrar na fila de publicação."
  }
}
```

Códigos HTTP principais:

- `400`: corpo, filtros ou `Idempotency-Key` inválidos;
- `401`: API key ausente ou incorreta;
- `404`: produto ou job inexistente;
- `409`: transição, aprovação ou idempotência em conflito;
- `429`: limite de requisições;
- `500`: erro interno;
- `503`: `N8N_API_KEY` não configurada.

## 8. Checklist antes do primeiro envio real

- testes, lint e build aprovados;
- API exposta por HTTPS;
- chave exclusiva do n8n;
- workflow observado em dry-run por alguns dias;
- aprovados e rejeitados revisados manualmente;
- apenas um grupo de teste habilitado;
- limite diário baixo;
- `Idempotency-Key` obrigatória e estável;
- mecanismo de pausa testado;
- somente então avaliar a alteração das duas travas.

A especificação completa está em `openapi.yaml`.
