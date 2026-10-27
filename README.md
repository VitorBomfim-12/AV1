# GreenCode — Sistema Monolítico RESTful de Logística Reversa (AV2)

Aplicação servidora monolítica para rastreabilidade, triagem técnica, valoração financeira e destinação ambientalmente adequada de resíduos eletroeletrônicos, evoluída a partir do núcleo CLI da AV1 para uma arquitetura web em camadas (**Controller-Service-Repository**) com **Fastify**, **Prisma ORM**, **SQLite** (sem uso de Docker), autenticação stateless **JWT**, transações atômicas (`$transaction`), **versionamento otimista** e **triggers/constraints SQL**.

> Para a fundamentação teórica, decisões arquiteturais, *trade-offs* e alternativas rejeitadas, consulte [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## 1. Versões Exatas de Todas as Ferramentas e Bibliotecas Utilizadas

### 1.1. Ambiente de Execução, Compilação e Banco de Dados
| Ferramenta / Componente | Versão Utilizada | Finalidade no Projeto |
| :--- | :---: | :--- |
| **Node.js** | `v24.19.0` | Runtime JavaScript/TypeScript assíncrono no servidor |
| **NPM** | `11.17.0` | Gerenciador de pacotes e scripts de automação |
| **TypeScript (`tsc`)** | `5.9.3` | Compilador estático (`target: ES2022`, `module: CommonJS`, `strict: true`) |
| **TSX** | `4.23.15` | Execução direta e *hot-reload* (`watch`) de arquivos `.ts` em dev, seed e testes |
| **SQLite (via Prisma Engine)** | `3.x` (`WAL` + `FK ON`) | Banco de dados relacional transacional ACID local (sem necessidade de Docker) |
| **Prisma CLI** | `6.19.3` | Geração do cliente tipado, migrações SQL versionadas e execução de seed |
| **Prisma Studio** | `0.511.0` | Interface visual web para inspeção das tabelas relacionais |
| **Módulos Nativos Node.js** | `v24.19.0` | `node:crypto` (SHA-256, AES-256-CBC legado, UUID), `node:fs`, `node:path`, `node:assert/strict`, `node:readline/promises` |

### 1.2. Dependências de Produção (`dependencies`)
| Pacote NPM | Versão Instalada | Finalidade no Projeto |
| :--- | :---: | :--- |
| **`fastify`** | `5.12.7` | Framework HTTP de alta performance com validação JSON Schema (Ajv) e *graceful shutdown* |
| **`@fastify/jwt`** | `9.1.0` | Assinatura e verificação de tokens JSON Web Token (JWT) stateless |
| **`@fastify/cors`** | `10.1.0` | Habilitação de CORS para integração com clientes front-end SPA |
| **`@fastify/swagger`** | `9.9.2` | Geração automática da especificação **OpenAPI 3.0** a partir dos schemas das rotas |
| **`@fastify/swagger-ui`** | `5.2.6` | Interface interativa Swagger UI servida na rota `/docs` |
| **`@prisma/client`** | `6.19.3` | Cliente ORM tipado para consultas relacionais, *eager loading* e `$transaction` |
| **`bcryptjs`** | `2.4.3` | Hashing seguro de senhas com *salt* (10 rounds), 100% compatível com Windows e Linux |
| **`dotenv`** | `16.6.1` | Leitura de variáveis de ambiente a partir do arquivo `.env` |

### 1.3. Dependências de Desenvolvimento (`devDependencies`)
| Pacote NPM | Versão Instalada | Finalidade no Projeto |
| :--- | :---: | :--- |
| **`prisma`** | `6.19.3` | CLI de schema, migrações SQL (`prisma migrate`) e seed (`prisma db seed`) |
| **`typescript`** | `5.9.3` | Verificação de tipos e build de produção para a pasta `dist/` |
| **`tsx`** | `4.23.15` | Runner TypeScript multiplataforma para `dev`, `seed` e testes |
| **`@types/node`** | `20.19.43` | Tipagens estáticas da API do Node.js |
| **`@types/bcryptjs`** | `2.4.6` | Tipagens estáticas da biblioteca `bcryptjs` |

### 1.4. Plataformas Homologadas
- **Linux**: Ubuntu `24.04.03 LTS` ou superior e distribuições derivadas do Ubuntu
- **Windows**: Windows `10` ou superior (PowerShell / Prompt de Comando)

---

## 2. Tutorial Passo a Passo — Como Configurar e Rodar a Aplicação

### Passo 1: Acessar a pasta do projeto e instalar as dependências
No terminal (Bash no Linux ou PowerShell/CMD no Windows):

```bash
npm install
```

### Passo 2: Configurar as variáveis de ambiente (`.env`)
Caso o arquivo `.env` ainda não exista na raiz do projeto, copie o modelo `.env.example`:

- **No Linux (Ubuntu / derivados):**
  ```bash
  cp .env.example .env
  ```
- **No Windows (PowerShell / CMD):**
  ```powershell
  copy .env.example .env
  ```

Conteúdo padrão do `.env`:
```env
DATABASE_URL="file:./dev.db"
PORT=3000
HOST="0.0.0.0"
JWT_SECRET="greencode-av2-super-secret-jwt-key-2026"
JWT_EXPIRES_IN="30m"
NODE_ENV="development"
```

### Passo 3: Preparar o Banco de Dados (Client + Migrations + Triggers SQL + Seed)
Rode o comando unificado abaixo para gerar o Prisma Client, aplicar a migração SQL (criando as 7 tabelas, índices `UNIQUE`, `CHECK constraints` e `TRIGGERs`) e popular o banco com a massa de dados inicial:

```bash
npm run setup
```

> **Comandos individuais equivalentes (caso queira rodar separadamente):**
> - Gerar cliente Prisma: `npm run prisma:generate`
> - Aplicar migrações SQL: `npm run prisma:migrate`
> - Popular banco com dados de teste (Seed): `npm run seed` (ou `npx prisma db seed`)
> - Abrir painel visual do banco no navegador: `npx prisma studio`

### Passo 4: Iniciar o Servidor HTTP

#### Opção A — Modo Desenvolvimento (com recarregamento automático)
```bash
npm run dev
```

#### Opção B — Modo Produção (compilando TypeScript para JavaScript em `dist/`)
```bash
npm run build
npm start
```

Com o servidor ativo em `http://localhost:3000`:
- **Health Check**: `http://localhost:3000/health`
- **Documentação Interativa Swagger UI**: `http://localhost:3000/docs`
- **Especificação OpenAPI JSON**: `http://localhost:3000/docs/json`
- Para encerrar com **graceful shutdown**, pressione `Ctrl + C` (`SIGINT`).

### Passo 5: Executar os Testes Automatizados e o Legado CLI
- **Suíte completa de testes de integração da API REST (AV2)** *(usa um banco isolado `test.db`, sem afetar seu `dev.db`)*:
  ```bash
  npm test
  ```
- **Simulação automatizada legada da AV1 (CLI)**:
  ```bash
  npm run test:cli
  ```
- **Interface interativa de linha de comando da AV1 (CLI)**:
  ```bash
  npm run cli
  ```

---

## 3. Usuários Pré-Cadastrados pelo Seed

Após rodar `npm run setup` (ou `npm run seed`), você pode autenticar com qualquer um dos 4 perfis RBAC abaixo:

| Perfil (`role`) | `username` | `password` | Escopo de Acesso |
| :--- | :--- | :--- | :--- |
| `ADMINISTRADOR` | `admin` | `admin123` | CRUD completo nas 7 entidades + gestão de usuários e auditoria |
| `OPERADOR_CADASTRO` | `operador` | `operador123` | CRUD de Organizações e Contratos + leitura operacional |
| `ALMOXARIFE` | `almoxarife` | `almox123` | CRUD de Lotes e Equipamentos + criação/edição de Movimentações |
| `AUDITOR` | `auditor` | `auditor123` | Leitura global, histórico de rastreabilidade e verificação SHA-256 |

---

## 4. Exemplos de Requisições HTTP (Prontas para Uso)

Você pode testar todas as rotas diretamente pelo **Swagger UI** (`http://localhost:3000/docs`), importando a coleção pronta do **Insomnia** ([`insomnia-collection.json`](./insomnia-collection.json) — veja também os payloads **somente JSON** na [Seção 5](#5-requisições-para-o-insomnia-somente-json)), ou pelo terminal com `curl` abaixo.

> **Dica para terminal Linux/macOS**: Salve o token JWT em uma variável `TOKEN` após o login para reutilizá-lo nas chamadas seguintes. No Windows PowerShell ou Postman, basta copiar o valor do campo `"token"` retornado no login e enviar no header `Authorization: Bearer SEU_TOKEN`.

---

### 4.0. Saúde do Servidor e Autenticação (`/health` e `/api/auth`)

#### Verificar saúde do servidor
```bash
curl -X GET http://localhost:3000/health
```

#### Provisionamento inicial do 1º Admin (apenas se o banco estiver vazio, sem seed)
```bash
curl -X POST http://localhost:3000/api/auth/bootstrap \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Administrador Inicial",
    "username": "admin",
    "email": "admin@greencode.com.br",
    "password": "admin123"
  }'
```

#### Login e captura do Token JWT
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }'
```

No Bash (Linux), você pode exportar o token diretamente:
```bash
export TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | node -pe "JSON.parse(fs.readFileSync(0,'utf8')).token")
```

#### Consultar usuário autenticado (`GET /api/auth/me`)
```bash
curl -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

---

### 4.1. Entidade 1 — Usuários (`/api/users`)

#### Criar Usuário (`POST /api/users`)
```bash
curl -X POST http://localhost:3000/api/users \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Roberto Almoxarife Turno Noite",
    "username": "roberto.almox",
    "email": "roberto@greencode.com.br",
    "password": "senha123",
    "role": "ALMOXARIFE",
    "active": true
  }'
```

#### Listar Usuários com filtros opcionais (`GET /api/users`)
```bash
curl -X GET "http://localhost:3000/api/users?role=ALMOXARIFE&active=true" \
  -H "Authorization: Bearer $TOKEN"
```

#### Buscar Usuário por ID (`GET /api/users/:id`)
```bash
curl -X GET http://localhost:3000/api/users/ID_DO_USUARIO \
  -H "Authorization: Bearer $TOKEN"
```

#### Atualizar Usuário com Versionamento Otimista (`PUT /api/users/:id`)
```bash
curl -X PUT http://localhost:3000/api/users/ID_DO_USUARIO \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Roberto Almoxarife Sênior",
    "active": true,
    "version": 1
  }'
```

#### Excluir Usuário (`DELETE /api/users/:id`)
```bash
curl -X DELETE http://localhost:3000/api/users/ID_DO_USUARIO \
  -H "Authorization: Bearer $TOKEN"
```

---

### 4.2. Entidade 2 — Organizações (`/api/organizations`)

#### Criar Organização com CNPJ válido (`POST /api/organizations`)
```bash
curl -X POST http://localhost:3000/api/organizations \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Rede Varejo Sustentável S.A.",
    "cnpj": "33.000.167/0001-01",
    "type": "EMPRESA_PRIVADA",
    "phone": "(11) 4002-8922",
    "email": "esg@varejosustentavel.com.br",
    "address": "Av. das Nações Unidas, 12901 - São Paulo/SP",
    "active": true
  }'
```

#### Listar Organizações (`GET /api/organizations`)
```bash
curl -X GET "http://localhost:3000/api/organizations?active=true" \
  -H "Authorization: Bearer $TOKEN"
```

#### Buscar Organização por ID (`GET /api/organizations/:id`)
```bash
curl -X GET http://localhost:3000/api/organizations/ID_DA_ORGANIZACAO \
  -H "Authorization: Bearer $TOKEN"
```

#### Consultar Resumo Financeiro da Organização (`GET /api/organizations/:id/financial-summary`)
```bash
curl -X GET http://localhost:3000/api/organizations/ID_DA_ORGANIZACAO/financial-summary \
  -H "Authorization: Bearer $TOKEN"
```

#### Atualizar Organização (`PUT /api/organizations/:id`)
```bash
curl -X PUT http://localhost:3000/api/organizations/ID_DA_ORGANIZACAO \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "(11) 3090-1122",
    "address": "Av. das Nações Unidas, 14000 - Torre Sul - São Paulo/SP",
    "version": 1
  }'
```

#### Excluir Organização sem vínculos (`DELETE /api/organizations/:id`)
```bash
curl -X DELETE http://localhost:3000/api/organizations/ID_DA_ORGANIZACAO \
  -H "Authorization: Bearer $TOKEN"
```

---

### 4.3. Entidade 3 — Contratos (`/api/contracts`)

#### Criar Contrato 1:1 com Cláusulas JSON (`POST /api/contracts`)
```bash
curl -X POST http://localhost:3000/api/contracts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "organizationId": "ID_DA_ORGANIZACAO",
    "contractNumber": "CTR-2026-0099",
    "startDate": "2026-02-01T00:00:00.000Z",
    "endDate": "2027-02-01T00:00:00.000Z",
    "status": "ATIVO",
    "collectionFrequency": "MENSAL",
    "taxRate": 10,
    "depreciationRate": 15,
    "estimatedMonthlyValue": 25000,
    "clauses": {
      "pnrsCompliance": true,
      "slaHoursCollection": 36,
      "dataWipeStandard": "NIST-800-88",
      "environmentalBonus": true
    },
    "notes": "Contrato corporativo com cláusulas JSON e rateio de recicláveis."
  }'
```

#### Listar Contratos (`GET /api/contracts`)
```bash
curl -X GET "http://localhost:3000/api/contracts?status=ATIVO" \
  -H "Authorization: Bearer $TOKEN"
```

#### Buscar Contrato por ID (`GET /api/contracts/:id`)
```bash
curl -X GET http://localhost:3000/api/contracts/ID_DO_CONTRATO \
  -H "Authorization: Bearer $TOKEN"
```

#### Atualizar Contrato recalculando equipamentos da organização (`PUT /api/contracts/:id`)
```bash
curl -X PUT http://localhost:3000/api/contracts/ID_DO_CONTRATO \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "taxRate": 8.5,
    "depreciationRate": 12,
    "collectionFrequency": "QUINZENAL",
    "version": 1
  }'
```

#### Excluir Contrato (`DELETE /api/contracts/:id`)
```bash
curl -X DELETE http://localhost:3000/api/contracts/ID_DO_CONTRATO \
  -H "Authorization: Bearer $TOKEN"
```

---

### 4.4. Entidade 4 — Lotes (`/api/lots`)

#### Criar Lote com Adição Atômica de Múltiplos Equipamentos em `$transaction` (`POST /api/lots`)
```bash
curl -X POST http://localhost:3000/api/lots \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "LOTE-2026-100",
    "organizationId": "ID_DA_ORGANIZACAO",
    "invoiceNumber": "NF-778899",
    "carrier": "TransEco Logística",
    "origin": "Centro de Distribuição Cliente",
    "destination": "Galpão Central GreenCode - Doca 01",
    "status": "ABERTO",
    "notes": "Coleta programada mensal",
    "newEquipments": [
      {
        "codigoBarrasInterno": "GC-2026-100001",
        "serial": "SN-DELL-5510",
        "category": "Notebook",
        "brand": "Dell",
        "model": "Precision 5510",
        "condition": "OTIMO",
        "location": "Doca 01 - Palete A",
        "estimatedValue": 5200,
        "notes": "Completo com fonte"
      },
      {
        "codigoBarrasInterno": "GC-2026-100002",
        "serial": "SN-HP-G800",
        "category": "Desktop",
        "brand": "HP",
        "model": "ProDesk 600",
        "condition": "BOM",
        "location": "Doca 01 - Palete A",
        "estimatedValue": 2900,
        "notes": "Gabinete íntegro"
      }
    ]
  }'
```

#### Listar Lotes (`GET /api/lots`)
```bash
curl -X GET "http://localhost:3000/api/lots?status=ABERTO" \
  -H "Authorization: Bearer $TOKEN"
```

#### Buscar Lote por ID (`GET /api/lots/:id`)
```bash
curl -X GET http://localhost:3000/api/lots/ID_DO_LOTE \
  -H "Authorization: Bearer $TOKEN"
```

#### Atualizar Lote (`PUT /api/lots/:id`)
```bash
curl -X PUT http://localhost:3000/api/lots/ID_DO_LOTE \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "EM_PROCESSAMENTO",
    "destination": "Setor de Triagem Técnica",
    "version": 1
  }'
```

#### Excluir Lote (`DELETE /api/lots/:id`)
```bash
curl -X DELETE http://localhost:3000/api/lots/ID_DO_LOTE \
  -H "Authorization: Bearer $TOKEN"
```

---

### 4.5. Entidade 5 — Equipamentos e Operações de Domínio (`/api/equipments`)

#### Criar Equipamento Individual (`POST /api/equipments`)
*(Se `codigoBarrasInterno` for omitido, o sistema gera automaticamente um código único no padrão `GC-YYYYMMDD-XXXXXX`.)*
```bash
curl -X POST http://localhost:3000/api/equipments \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "organizationId": "ID_DA_ORGANIZACAO",
    "lotId": "ID_DO_LOTE",
    "codigoBarrasInterno": "GC-2026-900001",
    "serial": "SN-MAC-M1-009",
    "category": "Notebook",
    "brand": "Apple",
    "model": "MacBook Pro 14",
    "condition": "OTIMO",
    "location": "Recebimento Cofre R2",
    "estimatedValue": 8500,
    "notes": "Recebido para descaracterização corporativa"
  }'
```

#### Listar Equipamentos com filtros (`GET /api/equipments`)
```bash
curl -X GET "http://localhost:3000/api/equipments?status=RECEBIDO&condition=OTIMO" \
  -H "Authorization: Bearer $TOKEN"
```

#### Buscar Equipamento por ID (`GET /api/equipments/:id`)
```bash
curl -X GET http://localhost:3000/api/equipments/ID_DO_EQUIPAMENTO \
  -H "Authorization: Bearer $TOKEN"
```

#### Consultar Memória de Cálculo Financeiro do Equipamento (`GET /api/equipments/:id/valuation`)
```bash
curl -X GET http://localhost:3000/api/equipments/ID_DO_EQUIPAMENTO/valuation \
  -H "Authorization: Bearer $TOKEN"
```

#### Atualizar Condição Física — Rebaixamento >= 2 níveis exige justificativa (`PATCH /api/equipments/:id/condition`)
```bash
curl -X PATCH http://localhost:3000/api/equipments/ID_DO_EQUIPAMENTO/condition \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "condition": "RUIM",
    "note": "Identificada oxidação interna severa na placa lógica durante inspeção.",
    "version": 1
  }'
```

#### Alterar Status Logístico — Triagem antes de Desmonte (`PATCH /api/equipments/:id/status`)
1º Passo — Enviar para `EM_TRIAGEM`:
```bash
curl -X PATCH http://localhost:3000/api/equipments/ID_DO_EQUIPAMENTO/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "EM_TRIAGEM",
    "toLocation": "Bancada de Triagem T1",
    "note": "Iniciando diagnóstico completo de componentes."
  }'
```
2º Passo — Somente após `EM_TRIAGEM` é permitido avançar para `AGUARDANDO_COMPONENTES`:
```bash
curl -X PATCH http://localhost:3000/api/equipments/ID_DO_EQUIPAMENTO/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "AGUARDANDO_COMPONENTES",
    "toLocation": "Setor de Desmonte / Peças",
    "note": "Triagem concluída; encaminhado para separação de módulos."
  }'
```

#### Atualização Cadastral Geral (`PUT /api/equipments/:id`)
```bash
curl -X PUT http://localhost:3000/api/equipments/ID_DO_EQUIPAMENTO \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "location": "Prateleira B4",
    "notes": "Etiquetado e conferido",
    "version": 4
  }'
```

#### Consultar Histórico Completo de Rastreabilidade (`GET /api/equipments/:id/history`)
```bash
curl -X GET http://localhost:3000/api/equipments/ID_DO_EQUIPAMENTO/history \
  -H "Authorization: Bearer $TOKEN"
```

#### Excluir Equipamento (`DELETE /api/equipments/:id`)
```bash
curl -X DELETE http://localhost:3000/api/equipments/ID_DO_EQUIPAMENTO \
  -H "Authorization: Bearer $TOKEN"
```

---

### 4.6. Entidade 6 — Movimentações (`/api/movements`)

#### Criar Movimentação sincronizando o Equipamento atomicamente (`POST /api/movements`)
```bash
curl -X POST http://localhost:3000/api/movements \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "equipmentId": "ID_DO_EQUIPAMENTO",
    "lotId": "ID_DO_LOTE",
    "type": "REPARO",
    "quantity": 1,
    "note": "Substituição de módulo SSD e limpeza química concluídas.",
    "toStatus": "EM_REPARO",
    "toLocation": "Laboratório Eletrônico L1",
    "financialValue": 3100
  }'
```

#### Listar Movimentações (`GET /api/movements`)
```bash
curl -X GET "http://localhost:3000/api/movements?type=REPARO" \
  -H "Authorization: Bearer $TOKEN"
```

#### Buscar Movimentação por ID (`GET /api/movements/:id`)
```bash
curl -X GET http://localhost:3000/api/movements/ID_DA_MOVIMENTACAO \
  -H "Authorization: Bearer $TOKEN"
```

#### Atualizar Movimentação (`PUT /api/movements/:id`)
```bash
curl -X PUT http://localhost:3000/api/movements/ID_DA_MOVIMENTACAO \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "note": "Substituição de SSD NVMe 512GB homologada pelo controle de qualidade.",
    "financialValue": 3350,
    "version": 1
  }'
```

#### Excluir Movimentação — exclusivo `ADMINISTRADOR` (`DELETE /api/movements/:id`)
```bash
curl -X DELETE http://localhost:3000/api/movements/ID_DA_MOVIMENTACAO \
  -H "Authorization: Bearer $TOKEN"
```

---

### 4.7. Entidade 7 — Eventos de Auditoria (`/api/audit-events`)

#### Registrar Evento Manual na Cadeia SHA-256 (`POST /api/audit-events`)
```bash
curl -X POST http://localhost:3000/api/audit-events \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "EXTERNAL_ISO14001_INSPECTION",
    "entityName": "Organizacao",
    "entityId": "ID_DA_ORGANIZACAO",
    "details": {
      "auditorCompany": "EcoCert Brasil",
      "conformity": "100%",
      "reportCode": "ISO-2026-884"
    }
  }'
```

#### Listar Eventos de Auditoria (`GET /api/audit-events`)
```bash
curl -X GET "http://localhost:3000/api/audit-events?entityName=Equipamento" \
  -H "Authorization: Bearer $TOKEN"
```

#### Verificar Integridade Criptográfica de Toda a Cadeia de Hashes (`GET /api/audit-events/verify`)
```bash
curl -X GET http://localhost:3000/api/audit-events/verify \
  -H "Authorization: Bearer $TOKEN"
```

#### Buscar Evento de Auditoria por ID (`GET /api/audit-events/:id`)
```bash
curl -X GET http://localhost:3000/api/audit-events/ID_DO_EVENTO \
  -H "Authorization: Bearer $TOKEN"
```

#### Atualizar Evento de Auditoria (`PUT /api/audit-events/:id`)
```bash
curl -X PUT http://localhost:3000/api/audit-events/ID_DO_EVENTO \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "details": {
      "auditorCompany": "EcoCert Brasil",
      "conformity": "100%",
      "reportCode": "ISO-2026-884-REV2"
    },
    "version": 1
  }'
```

#### Excluir Evento de Auditoria (`DELETE /api/audit-events/:id`)
```bash
curl -X DELETE http://localhost:3000/api/audit-events/ID_DO_EVENTO \
  -H "Authorization: Bearer $TOKEN"
```

---

## 5. Requisições para o Insomnia (Somente JSON)

Para utilizar no **Insomnia**, você pode **importar a coleção pronta** ou **copiar somente os JSONs** abaixo diretamente na aba **Body → JSON**.

### 5.0. Importação Automática no Insomnia (Recomendado)
Na raiz do projeto está o arquivo [`insomnia-collection.json`](./insomnia-collection.json) com **todas as 50 requisições organizadas em pastas** e captura automática de Token JWT e IDs:

1. Abra o **Insomnia** e clique em **Import** (ou **Create → Import → File**).
2. Selecione o arquivo `insomnia-collection.json` na raiz deste projeto.
3. No seletor de ambiente (canto superior esquerdo), escolha um dos perfis pré-configurados:
   - **`1. Perfil ADMINISTRADOR (Auto-Token)`** *(acesso total)*
   - **`2. Perfil OPERADOR_CADASTRO (Auto-Token)`** *(Empresas e Contratos)*
   - **`3. Perfil ALMOXARIFE (Auto-Token)`** *(Estoque: Lotes, Equipamentos e Movimentações)*
   - **`4. Perfil AUDITOR (Auto-Token)`** *(Leitura global e Auditoria SHA-256)*
   - **`5. Manual (Colar Token e IDs)`** *(caso prefira preencher manualmente)*

> **Uso manual no Insomnia:** Em todas as rotas `/api/*` (exceto `/bootstrap` e `/login`), selecione na aba **Auth** a opção **Bearer Token** e cole o `token` retornado no login. Na aba **Body**, selecione **JSON** e cole apenas os blocos abaixo.

---

### 5.1. Saúde e Autenticação (`/health` e `/api/auth`)

- **`GET`** `http://localhost:3000/health` *(sem Body / sem Auth)*
- **`GET`** `http://localhost:3000/api/auth/me` *(sem Body / com Auth Bearer)*

#### Bootstrap do 1º Admin — `POST http://localhost:3000/api/auth/bootstrap` *(apenas banco vazio)*
```json
{
  "name": "Administrador Inicial",
  "username": "admin",
  "email": "admin@greencode.com.br",
  "password": "admin123"
}
```

#### Login Administrador — `POST http://localhost:3000/api/auth/login`
```json
{
  "username": "admin",
  "password": "admin123"
}
```

#### Login Operador de Cadastro — `POST http://localhost:3000/api/auth/login`
```json
{
  "username": "operador",
  "password": "operador123"
}
```

#### Login Almoxarife — `POST http://localhost:3000/api/auth/login`
```json
{
  "username": "almoxarife",
  "password": "almox123"
}
```

#### Login Auditor — `POST http://localhost:3000/api/auth/login`
```json
{
  "username": "auditor",
  "password": "auditor123"
}
```

---

### 5.2. Usuários (`/api/users`)

- **`GET`** `http://localhost:3000/api/users` *(opcional: `?role=ALMOXARIFE&active=true&search=roberto`)*
- **`GET`** `http://localhost:3000/api/users/ID_DO_USUARIO`
- **`DELETE`** `http://localhost:3000/api/users/ID_DO_USUARIO`

#### Criar Usuário — `POST http://localhost:3000/api/users`
```json
{
  "name": "Roberto Almoxarife Turno Noite",
  "username": "roberto.almox",
  "email": "roberto@greencode.com.br",
  "password": "senha123",
  "role": "ALMOXARIFE",
  "active": true
}
```

#### Atualizar Usuário — `PUT http://localhost:3000/api/users/ID_DO_USUARIO`
```json
{
  "name": "Roberto Almoxarife Sênior",
  "active": true,
  "version": 1
}
```

---

### 5.3. Empresas / Organizações (`/api/organizations`)

- **`GET`** `http://localhost:3000/api/organizations` *(opcional: `?active=true&type=EMPRESA_PRIVADA&search=Varejo`)*
- **`GET`** `http://localhost:3000/api/organizations/ID_DA_ORGANIZACAO`
- **`GET`** `http://localhost:3000/api/organizations/ID_DA_ORGANIZACAO/financial-summary`
- **`DELETE`** `http://localhost:3000/api/organizations/ID_DA_ORGANIZACAO`

#### Criar Empresa / Organização — `POST http://localhost:3000/api/organizations`
```json
{
  "name": "Rede Varejo Sustentável S.A.",
  "cnpj": "33.000.167/0001-01",
  "type": "EMPRESA_PRIVADA",
  "phone": "(11) 4002-8922",
  "email": "esg@varejosustentavel.com.br",
  "address": "Av. das Nações Unidas, 12901 - São Paulo/SP",
  "active": true
}
```

#### Atualizar Empresa / Organização — `PUT http://localhost:3000/api/organizations/ID_DA_ORGANIZACAO`
```json
{
  "phone": "(11) 3090-1122",
  "address": "Av. das Nações Unidas, 14000 - Torre Sul - São Paulo/SP",
  "version": 1
}
```

---

### 5.4. Contratos (`/api/contracts`)

- **`GET`** `http://localhost:3000/api/contracts` *(opcional: `?status=ATIVO&organizationId=ID_DA_ORGANIZACAO`)*
- **`GET`** `http://localhost:3000/api/contracts/ID_DO_CONTRATO`
- **`DELETE`** `http://localhost:3000/api/contracts/ID_DO_CONTRATO`

#### Criar Contrato — `POST http://localhost:3000/api/contracts`
```json
{
  "organizationId": "ID_DA_ORGANIZACAO",
  "contractNumber": "CTR-2026-0099",
  "startDate": "2026-02-01T00:00:00.000Z",
  "endDate": "2027-02-01T00:00:00.000Z",
  "status": "ATIVO",
  "collectionFrequency": "MENSAL",
  "taxRate": 10,
  "depreciationRate": 15,
  "estimatedMonthlyValue": 25000,
  "clauses": {
    "pnrsCompliance": true,
    "slaHoursCollection": 36,
    "dataWipeStandard": "NIST-800-88",
    "environmentalBonus": true
  },
  "notes": "Contrato corporativo com cláusulas JSON e rateio de recicláveis."
}
```

#### Atualizar Contrato — `PUT http://localhost:3000/api/contracts/ID_DO_CONTRATO`
```json
{
  "taxRate": 8.5,
  "depreciationRate": 12,
  "collectionFrequency": "QUINZENAL",
  "version": 1
}
```

---

### 5.5. Estoque — Lotes (`/api/lots`)

- **`GET`** `http://localhost:3000/api/lots` *(opcional: `?status=ABERTO&organizationId=ID_DA_ORGANIZACAO`)*
- **`GET`** `http://localhost:3000/api/lots/ID_DO_LOTE`
- **`DELETE`** `http://localhost:3000/api/lots/ID_DO_LOTE`

#### Criar Lote com Equipamentos em `$transaction` — `POST http://localhost:3000/api/lots`
```json
{
  "code": "LOTE-2026-100",
  "organizationId": "ID_DA_ORGANIZACAO",
  "invoiceNumber": "NF-778899",
  "carrier": "TransEco Logística",
  "origin": "Centro de Distribuição Cliente",
  "destination": "Galpão Central GreenCode - Doca 01",
  "status": "ABERTO",
  "notes": "Coleta programada mensal",
  "newEquipments": [
    {
      "codigoBarrasInterno": "GC-2026-100001",
      "serial": "SN-DELL-5510",
      "category": "Notebook",
      "brand": "Dell",
      "model": "Precision 5510",
      "condition": "OTIMO",
      "location": "Doca 01 - Palete A",
      "estimatedValue": 5200,
      "notes": "Completo com fonte"
    },
    {
      "codigoBarrasInterno": "GC-2026-100002",
      "serial": "SN-HP-G800",
      "category": "Desktop",
      "brand": "HP",
      "model": "ProDesk 600",
      "condition": "BOM",
      "location": "Doca 01 - Palete A",
      "estimatedValue": 2900,
      "notes": "Gabinete íntegro"
    }
  ]
}
```

#### Atualizar Lote — `PUT http://localhost:3000/api/lots/ID_DO_LOTE`
```json
{
  "status": "EM_PROCESSAMENTO",
  "destination": "Setor de Triagem Técnica",
  "version": 1
}
```

---

### 5.6. Estoque — Equipamentos (`/api/equipments`)

- **`GET`** `http://localhost:3000/api/equipments` *(opcional: `?status=RECEBIDO&condition=OTIMO&category=Notebook&search=GC-2026`)*
- **`GET`** `http://localhost:3000/api/equipments/ID_DO_EQUIPAMENTO`
- **`GET`** `http://localhost:3000/api/equipments/ID_DO_EQUIPAMENTO/valuation`
- **`GET`** `http://localhost:3000/api/equipments/ID_DO_EQUIPAMENTO/history`
- **`DELETE`** `http://localhost:3000/api/equipments/ID_DO_EQUIPAMENTO`

#### Cadastrar Equipamento no Estoque — `POST http://localhost:3000/api/equipments`
```json
{
  "organizationId": "ID_DA_ORGANIZACAO",
  "lotId": "ID_DO_LOTE",
  "codigoBarrasInterno": "GC-2026-900001",
  "serial": "SN-MAC-M1-009",
  "category": "Notebook",
  "brand": "Apple",
  "model": "MacBook Pro 14",
  "condition": "OTIMO",
  "location": "Recebimento Cofre R2",
  "estimatedValue": 8500,
  "notes": "Recebido para descaracterização corporativa"
}
```

#### Atualizar Cadastro do Equipamento — `PUT http://localhost:3000/api/equipments/ID_DO_EQUIPAMENTO`
```json
{
  "location": "Prateleira B4",
  "notes": "Etiquetado e conferido no almoxarifado",
  "version": 1
}
```

#### Alterar Condição Física (queda >= 2 níveis exige `note`) — `PATCH http://localhost:3000/api/equipments/ID_DO_EQUIPAMENTO/condition`
```json
{
  "condition": "RUIM",
  "note": "Identificada oxidação interna severa na placa lógica durante inspeção."
}
```

#### Alterar Status Logístico (1º Passo: Triagem) — `PATCH http://localhost:3000/api/equipments/ID_DO_EQUIPAMENTO/status`
```json
{
  "status": "EM_TRIAGEM",
  "toLocation": "Bancada de Triagem T1",
  "note": "Iniciando diagnóstico completo de componentes."
}
```

#### Alterar Status Logístico (2º Passo: Desmonte pós-triagem) — `PATCH http://localhost:3000/api/equipments/ID_DO_EQUIPAMENTO/status`
```json
{
  "status": "AGUARDANDO_COMPONENTES",
  "toLocation": "Setor de Desmonte / Peças",
  "note": "Triagem concluída; encaminhado para separação de módulos."
}
```

---

### 5.7. Estoque — Movimentações (`/api/movements`)

- **`GET`** `http://localhost:3000/api/movements` *(opcional: `?equipmentId=ID_DO_EQUIPAMENTO&type=REPARO`)*
- **`GET`** `http://localhost:3000/api/movements/ID_DA_MOVIMENTACAO`
- **`DELETE`** `http://localhost:3000/api/movements/ID_DA_MOVIMENTACAO` *(exclusivo `ADMINISTRADOR`)*

#### Registrar Movimentação — `POST http://localhost:3000/api/movements`
```json
{
  "equipmentId": "ID_DO_EQUIPAMENTO",
  "lotId": "ID_DO_LOTE",
  "type": "REPARO",
  "quantity": 1,
  "note": "Substituição de módulo SSD e limpeza química concluídas.",
  "toStatus": "EM_REPARO",
  "toLocation": "Laboratório Eletrônico L1",
  "financialValue": 3100
}
```

#### Atualizar Movimentação — `PUT http://localhost:3000/api/movements/ID_DA_MOVIMENTACAO`
```json
{
  "note": "Substituição de SSD NVMe 512GB homologada pelo controle de qualidade.",
  "financialValue": 3350,
  "version": 1
}
```

---

### 5.8. Eventos de Auditoria SHA-256 (`/api/audit-events`)

- **`GET`** `http://localhost:3000/api/audit-events` *(opcional: `?entityName=Equipamento`)*
- **`GET`** `http://localhost:3000/api/audit-events/verify`
- **`GET`** `http://localhost:3000/api/audit-events/ID_DO_EVENTO`
- **`DELETE`** `http://localhost:3000/api/audit-events/ID_DO_EVENTO`

#### Registrar Evento Manual — `POST http://localhost:3000/api/audit-events`
```json
{
  "action": "EXTERNAL_ISO14001_INSPECTION",
  "entityName": "Organizacao",
  "entityId": "ID_DA_ORGANIZACAO",
  "details": {
    "auditorCompany": "EcoCert Brasil",
    "conformity": "100%",
    "reportCode": "ISO-2026-884"
  }
}
```

#### Atualizar Evento de Auditoria — `PUT http://localhost:3000/api/audit-events/ID_DO_EVENTO`
```json
{
  "details": {
    "auditorCompany": "EcoCert Brasil",
    "conformity": "100%",
    "reportCode": "ISO-2026-884-REV2"
  },
  "version": 1
}
```
