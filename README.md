# Prospect - Sistema de Geração de Leads

Sistema completo para prospecção de empresas que precisam de site ou sistema.

## Tecnologias

- Servidor (Back-end): Node.js + Express
- Interface (Front-end): React + TailwindCSS
- Banco: PostgreSQL
- Integração: Google Places API (Google Maps Platform)

## Funcionalidades

- Coleta de empresas por cidade, categoria e raio via Google Places API
- Classificação de presença digital:
  - `sem_site`
  - `site_fraco`
  - `site_ok`
- Enriquecimento opcional de Instagram
- Painel com visão geral e lista de contatos
- Quadro Kanban (estilo Trello) para gerenciar prospecção por etapas
- Botão "Incluir no Kanban" para transformar uma prospecção em cartão
- Campos de cartão para anotações, próxima ação, valor de proposta e data de retorno
- Ações de prospecção via WhatsApp (manual e envio direto pela API da Meta) e marcação de contato
- Página de E-mail com status de campanha (CSV de envio SMTP) e caixa de entrada IMAP
- Automação de busca por múltiplas cidades/categorias
- Priorização de contatos sem site ou com sinais de presença fraca

## Estrutura

```text
/backend
  server.js
  routes/
  services/
  database/
  scripts/

/frontend
  src/
    pages/
    components/
    api/
```

## 1) Instalar Node.js

Recomendado: Node.js 20+

### Windows (winget)

```powershell
winget install OpenJS.NodeJS.LTS
```

Verificar:

```powershell
node -v
npm -v
```

## 2) Configurar PostgreSQL

Instale PostgreSQL 14+.

Crie um banco para o projeto:

```sql
CREATE DATABASE prospect;
```

## 3) Configurar Google Places API

No Google Cloud Console:

1. Crie/seleciona um projeto
2. Ative as APIs:
   - Places API
   - Geocoding API
3. Gere uma chave de API
4. Restrinja a chave (IP/HTTP referrer) para segurança

## 4) Configurar variáveis de ambiente

### Back-end

No diretório `backend`, copie `.env.example` para `.env` e preencha:

```powershell
cd backend
Copy-Item .env.example .env
```

Campos principais:

- `GOOGLE_PLACES_API_KEY`
- `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`
- `AUTH_USERNAME`, `AUTH_PASSWORD`, `AUTH_JWT_SECRET`
- `META_WHATSAPP_PHONE_NUMBER_ID`
- `META_WHATSAPP_ACCESS_TOKEN`

Para envio automático via Meta WhatsApp Cloud API, também configure:

- `META_WHATSAPP_API_VERSION` (padrão: `v22.0`)
- `META_WHATSAPP_DEFAULT_MODE` (`text` ou `template`)
- `META_WHATSAPP_TEMPLATE_NAME` (obrigatório quando usar modo `template`, ex.: `saudacao_oficial`)
- `META_WHATSAPP_TEMPLATE_LANGUAGE_CODE` (ex.: `pt_BR`)
- `META_WHATSAPP_ALLOW_BR_LANDLINE` (`false` por padrão; use `true` para permitir tentativa em fixo BR)
- `META_WHATSAPP_TEMPLATE_BY_CATEGORY` (opcional, ex.: `dentist:saudacao_dentista,lawyer:saudacao_advogado,restaurant:saudacao_restaurante`)
- `META_WHATSAPP_USE_TEXT_IN_OPEN_WINDOW` (padrão `true`; quando há janela aberta, envia em `text` em vez de `template`)
- `META_WHATSAPP_OPEN_WINDOW_LOOKBACK_HOURS` (padrão `24`; janela de tempo para considerar conversa inbound recente)
- `META_WHATSAPP_OPEN_WINDOW_TEXT` (opcional; texto usado no envio em janela aberta quando não vier `message` na requisição)
- `META_WHATSAPP_POST_SEND_WAIT_MS` (padrão `30000`; aguarda webhook de entrega para já retornar `failed` no endpoint)
- `META_WHATSAPP_POST_SEND_POLL_MS` (padrão `1500`; intervalo de polling durante a espera pós-envio)
- `META_WHATSAPP_AUTO_RETRY_ON_INBOUND_ENABLED` (padrão `true`; ao receber mensagem inbound, tenta reenviar em `text` uma falha recente elegível)
- `META_WHATSAPP_AUTO_RETRY_FAILED_CODES` (padrão `131049`; códigos de erro elegíveis para auto-retry no inbound)
- `META_WHATSAPP_AUTO_RETRY_LOOKBACK_HOURS` (padrão `168`; janela de horas para buscar falha recente elegível)
- `META_WHATSAPP_DEFAULT_COUNTRY_CODE` (padrão: `55`)
- `META_WHATSAPP_BLOCK_ON_FAILED_ENABLED` (`true`/`false`, padrão: `true`)
- `META_WHATSAPP_BLOCK_ON_FAILED_CODES` (padrão: `131026,130472`)
- `META_WHATSAPP_BLOCK_FAILED_LOOKBACK_DAYS` (padrão: `30`)

Para preparar uma campanha de e-mail a partir dos leads com falha no WhatsApp, rode no `backend`:

```powershell
npm run email:failed-campaign
```

O script tenta extrair e-mails do site da empresa, salva o melhor e-mail encontrado na tabela `companies` e gera um CSV em `backend/exports/` com colunas prontas para envio (`from_email`, `to_email`, `subject`, `body`).

Para enviar o CSV via SMTP (Hostinger), configure no `backend/.env`:

- `OUTREACH_FROM_EMAIL` (ex.: `contato@impulsestrategy.com.br`)
- `OUTREACH_SMTP_HOST` (Hostinger: `smtp.hostinger.com`)
- `OUTREACH_SMTP_PORT` (Hostinger SSL: `465`)
- `OUTREACH_SMTP_SECURE` (`true` para `465`)
- `OUTREACH_SMTP_USER` (normalmente o mesmo e-mail remetente)
- `OUTREACH_SMTP_PASS` (senha da caixa de e-mail)
- `OUTREACH_EMAIL_REPLY_TO` (opcional)
- `OUTREACH_EMAIL_SEND_DRY_RUN` (`true` para simular sem enviar)
- `OUTREACH_EMAIL_SEND_DELAY_MS` (delay entre envios)
- `OUTREACH_EMAIL_SEND_MAX` (`0` = todos)

Para habilitar a caixa de entrada na página de E-mail, configure também:

- `OUTREACH_IMAP_HOST` (Hostinger: `imap.hostinger.com`)
- `OUTREACH_IMAP_PORT` (Hostinger SSL: `993`)
- `OUTREACH_IMAP_SECURE` (`true` para `993`)
- `OUTREACH_IMAP_USER` (normalmente o mesmo e-mail do SMTP)
- `OUTREACH_IMAP_PASS` (opcional; se vazio usa `OUTREACH_SMTP_PASS`)

Depois, rode:

```powershell
npm run email:send-campaign
```

O envio usa o CSV mais recente em `backend/exports/` e gera um relatório em `backend/exports/` com status por destinatário.

### Front-end

No diretório `frontend`, copie `.env.example` para `.env`:

```powershell
cd ../frontend
Copy-Item .env.example .env
```

## 5) Instalar dependências

```powershell
cd backend
npm install

cd ../frontend
npm install
```

## 6) Rodar back-end

```powershell
cd backend
npm run dev
```

Back-end padrão: `http://localhost:4000`

## 7) Rodar front-end

Em outro terminal:

```powershell
cd frontend
npm run dev
```

Front-end padrão: `http://localhost:5173`

## Login

As rotas da API (exceto `/health` e `/api/auth/login`) exigem autenticação.

- Endpoint de login: `POST /api/auth/login`
- Corpo:
  ```json
  {
    "username": "seu_usuario",
    "password": "sua_senha"
  }
  ```

Variáveis de autenticação no `backend/.env`:

- `AUTH_USERNAME`
- `AUTH_PASSWORD`
- `AUTH_JWT_SECRET`
- `AUTH_TOKEN_EXPIRES_IN` (padrão: `7d`)

## Rotas da API

- `POST /search`
  - corpo da requisição:
    ```json
    {
      "city": "Campinas",
      "category": "dentist",
      "radius": 5000
    }
    ```
- `GET /companies`
- `GET /companies?status=sem_site`
- `POST /contacted/:id`
- `GET /stats`
- `GET /kanban/cards`
- `POST /kanban/cards`
- `PATCH /kanban/cards/:id`
- `GET /whatsapp/meta/config`
- `POST /companies/:id/whatsapp/send`
- `GET /whatsapp/inbox/conversations`
- `GET /whatsapp/inbox/conversations/:waId/messages`
- `PATCH /whatsapp/inbox/conversations/:waId/read`
- `POST /whatsapp/inbox/conversations/:waId/reply`
- `GET /email/overview`
- `GET /email/inbox/messages`
- `GET /email/inbox/messages/:uid`

Também disponíveis com prefixo `/api`, por exemplo: `GET /api/companies`.

## Tabela `companies`

Campos principais:

- `id`
- `name`
- `phone`
- `address`
- `city`
- `category`
- `website`
- `instagram_url`
- `rating`
- `reviews`
- `status_site`
- `contacted`
- `place_id`
- `created_at`

## Scripts de automação (backend)

### Busca automática por múltiplas cidades e categorias

```powershell
cd backend
npm run auto:search -- --cities=Campinas,Sorocaba --categories=dentist,lawyer,restaurant --radius=5000
```

### Enriquecer Instagram (opcional)

```powershell
npm run auto:instagram -- --limit=100
```

### Priorizar leads

```powershell
npm run auto:prioritize
```

## Critérios de classificação de site

- `sem_site`: quando não existe site
- `site_fraco`: site existe, mas falha em um ou mais critérios:
  - não usa `https`
  - não possui título da página (`<title>`)
  - carregamento lento
- `site_ok`: passou nos critérios

## Mensagem padrão de prospecção

```text
Olá, tudo bem?

Encontrei sua empresa no Google e percebi que vocês ainda não possuem um site profissional ou presença digital forte.

Hoje muitas empresas estão recebendo novos clientes através do Google e do WhatsApp.

Trabalho com criação de sites rápidos e integrados ao WhatsApp que ajudam empresas a aparecer mais no Google e gerar mais clientes.

Se quiser posso te mostrar um exemplo de site para o seu segmento.
```

## Integração Meta WhatsApp Cloud API

Depois de criar seu aplicativo na Meta, preencha no `backend/.env`:

- `META_WHATSAPP_PHONE_NUMBER_ID`
- `META_WHATSAPP_ACCESS_TOKEN`
- `META_WHATSAPP_VERIFY_TOKEN` (usado na validação do webhook)

Webhook para receber mensagens inbound da Meta:

- `GET /webhooks/meta/whatsapp` (verificação)
- `POST /webhooks/meta/whatsapp` (eventos de mensagens/status)

### Envio direto para um lead

Exemplo (modo texto):

```powershell
Invoke-RestMethod -Uri "http://localhost:4000/api/companies/123/whatsapp/send" -Method Post -ContentType "application/json" -Body (@{
  message = "Olá, tudo bem?"
} | ConvertTo-Json)
```

Exemplo (modo template):

```powershell
Invoke-RestMethod -Uri "http://localhost:4000/api/companies/123/whatsapp/send" -Method Post -ContentType "application/json" -Body (@{
  mode = "template"
  templateName = "nome_do_template_aprovado"
  templateLanguageCode = "pt_BR"
  templateParameters = @("Cliente", "Keula")
} | ConvertTo-Json)
```

No painel, o botão verde de WhatsApp passa a disparar pela Meta quando a integração estiver configurada. Quando não estiver, ele continua abrindo o WhatsApp manual (`wa.me`).

## Observações

- A busca de Instagram é heurística (pode exigir validação manual em alguns casos).
- Para produção, recomenda-se adicionar autenticação, logs estruturados e monitoramento.
