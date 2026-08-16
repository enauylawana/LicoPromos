# Workflows do n8n

Este diretório versiona os workflows usados pelo projeto sem armazenar
credenciais, cookies, tokens ou chaves de API.

## Estrutura

- `workflows/production/`: versões revisadas e aptas para importação.
- `workflows/legacy/`: referências antigas que não devem ser ativadas.

## Workflow legado do Mercado Livre

`workflows/legacy/automacao-mercado-livre-afiliados.json` foi recuperado de uma
exportação local. Ele não corresponde ao fluxo principal atualmente validado e
permanece desativado porque:

- referencia o nó inexistente `Gerador de Keywords`;
- contém somente um placeholder para o processador Python;
- usa uma URL fictícia para o WhatsApp;
- consulta diretamente a API pública do Mercado Livre, que pode responder 403;
- não utiliza a API segura e idempotente do projeto.

`workflows/legacy/ml-ofertas-whatsapp-export.json` é a exportação do workflow
`ML Ofertas - WhatsApp`/`Ofertas ML - WhatsApp` mostrada no n8n. Ela também foi
mantida desativada: a busca pública direta está respondendo 403, o gerador de
link depende de cookie de sessão e o destino do WhatsApp ainda é um placeholder.
Identificadores da instância n8n foram removidos da cópia versionada.

Não adicione credenciais ao JSON. Configure-as somente no cofre de credenciais
do n8n após a importação.

## Exportação da versão atual

No editor do n8n, abra o workflow, use o menu de três pontos e selecione
`Download`. Salve o JSON e revise-o antes de movê-lo para
`workflows/production/`.
