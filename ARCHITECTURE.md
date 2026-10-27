# Documentação Arquitetural — GreenCode AV2

## 1. Visão Geral da Evolução Arquitetural (AV1 → AV2)

Na **AV1**, o **GreenCode** operava como um aplicativo de linha de comando (CLI) monousuário com persistência em arquivos JSON criptografados (`AES-256-CBC`) e *journaling* em disco. Embora adequado para validação inicial das regras de domínio, esse modelo impunha limitações severas para operação multiusuário simultânea, integração com interfaces ricas (SPA) e consultas relacionais complexas.

Na **AV2**, o sistema evoluiu para um **Servidor HTTP Monolítico Modular** expondo uma **API RESTful documentada via OpenAPI 3 / Swagger**, estruturada segundo o padrão **Controller-Service-Repository**, persistência relacional via **Prisma ORM**, autenticação *stateless* com **JSON Web Tokens (JWT)**, transações atômicas (`$transaction`), **versionamento otimista** (`version`) e **constraints/triggers no banco de dados**.

---

## 2. Decisões Arquiteturais, Trade-offs e Alternativas Rejeitadas

### 2.1. Monólito Modular vs. Microsserviços
* **Decisão adotada**: Arquitetura monolítica estruturada em camadas bem isoladas (`Controllers` → `Services` → `Repositories` → `Prisma/DB`).
* **Justificativa**: No estágio atual do empreendimento, a coesão transacional (ex.: criar um lote com dezenas de equipamentos, calcular depreciação contratual e gravar auditoria na mesma transação ACID), a simplicidade operacional de *deploy* único e a depuração direta superam amplamente os benefícios de sistemas distribuídos.
* **Alternativa rejeitada (Microsserviços)**: Introduziria sobrecarga prematura de rede, consistência eventual (Sagas/Outbox), orquestração de múltiplos bancos e complexidade de infraestrutura incompatível com o porte atual do produto.
* **Limites reconhecidos do Monólito**: Caso módulos específicos (como geração pesada de relatórios analíticos ou ingestão IoT de balanças industriais) passem a demandar escalabilidade assimétrica de CPU/memória, a separação atual em `Services` e `Repositories` permitirá extrair contextos delimitados sem reescrever regras de negócio.

### 2.2. Fastify vs. Express
* **Decisão adotada**: **Fastify v5** com `@fastify/jwt`, `@fastify/cors`, `@fastify/swagger` e `@fastify/swagger-ui`.
* **Justificativa**:
  1. **Validação nativa por JSON Schema (Ajv)**: Valida `body`, `params` e `querystring` antes mesmo de acionar o *Controller*, reduzindo *boilerplate* e gerando automaticamente a especificação OpenAPI interativa em `/docs`.
  2. **Arquitetura orientada a plugins e hooks**: Permite encapsular o hook de autenticação (`authenticateHook`) e o tratamento global estruturado de erros (`setErrorHandler`).
  3. **Performance e Ciclo de Vida**: Menor *overhead* por requisição HTTP e suporte nativo a *graceful shutdown* (`app.close()`), encerrando conexões ativas e desconectando o Prisma com segurança em sinais `SIGINT`/`SIGTERM`.
* **Alternativa rejeitada (Express)**: Exigiria bibliotecas adicionais para validação declarativa, documentação OpenAPI manual e *middlewares* menos padronizados para captura de erros assíncronos.

### 2.3. Prisma ORM com SQLite (Sem Docker) vs. SGBD Externo Obrigatório
* **Decisão adotada**: **Prisma ORM v6** sobre **SQLite** em modo **WAL (`Write-Ahead Logging`)** com `PRAGMA foreign_keys = ON`, migrações SQL versionadas, `CHECK constraints` e `TRIGGERs` nativos.
* **Justificativa e Trade-offs**:
  * **Portabilidade Comercial Multiplataforma**: Atende imediatamente Windows 10+ e Linux Ubuntu 24.04.03+ sem exigir Docker nem instalação/configuração prévia de um daemon SGBD externo, bastando `npm install` e `npm run setup`.
  * **Integridade Relacional Plena**: Suporta chaves estrangeiras estritas (`ON DELETE RESTRICT / SET NULL / CASCADE`), índices `UNIQUE` (`cnpj`, `codigoBarrasInterno`, `contractNumber`, `code`, `username`), colunas `JSON` (`clauses`, `details`), transações ACID e *triggers* SQL reais.
  * **Trade-off e Evolução**: O SQLite serializa escritas simultâneas em arquivo único, o que atende centenas de requisições por segundo em modo WAL, mas limita *clusters* horizontais com múltiplas instâncias de servidor. Graças ao isolamento na camada **Repository** + **Prisma**, a migração futura para **PostgreSQL** em nuvem exige apenas alterar `provider = "postgresql"` e `DATABASE_URL` em `prisma/schema.prisma`.

### 2.4. Autenticação JWT Stateless e Hashing de Senhas
* **Decisão adotada**: Tokens JWT assinados com `@fastify/jwt` (expiração configurável via `JWT_EXPIRES_IN`, padrão `30m`, preservando a política de sessão de 30 minutos da AV1) + hashing com **`bcryptjs`** (10 *salt rounds*) com verificação retrocompatível para hashes `SHA-256` legados da AV1.
* **Justificativa**: Em uma API RESTful consumida por SPA, sessões em memória acoplariam o cliente a uma instância física do servidor. O JWT torna a API *stateless*, enquanto o hook `authenticateHook` valida a assinatura, verifica se o usuário permanece ativo e injeta `request.actor` (`id`, `username`, `role`) para autorização RBAC nos serviços.

---

## 3. Transações, Concorrência Otimista e Garantia de Estado no Banco

1. **Unidades Atômicas (`prisma.$transaction`)**:
   * Criação de `Lote` com inclusão simultânea de múltiplos `Equipamentos` e suas `Movimentacoes` iniciais (`RECEBIMENTO`): se qualquer código de barras falhar ou violar unicidade, **nenhum registro parcial é persistido**.
   * Mudança de status/condição física do `Equipamento` + recálculo financeiro + inserção de `Movimentacao` + gravação de `EventoAuditoria` encadeado por SHA-256.
   * Atualização de taxas de `Contrato` (`taxRate` / `depreciationRate`) recalculando atomicamente o `currentValue` dos equipamentos da organização.
2. **Versionamento Otimista (`version`)**:
   * Todos os 7 modelos possuem o campo `version Int @default(1)`.
   * Nas operações `PUT`/`PATCH`, quando `version` é informado pelo cliente, o repositório executa `updateMany` condicionado a `WHERE id = :id AND version = :expectedVersion`, incrementando `version + 1`. Caso outra requisição concorrente tenha alterado o registro antes, a operação retorna **`409 Conflict`**, evitando *lost updates*.
3. **Constraints e Triggers no Banco de Dados (`prisma/migrations/.../migration.sql`)**:
   * Índices `UNIQUE` em `organizacoes.cnpj`, `equipamentos.codigoBarrasInterno`, `usuarios.username`, `contratos.contractNumber`, `lotes.code` e `eventos_auditoria.hash`.
   * `CHECK constraints` garantindo CNPJ de 14 dígitos, taxas entre `0` e `100`, quantidades positivas (`quantity > 0`), valores financeiros não-negativos e datas de contrato coerentes (`endDate >= startDate`).
   * **Triggers SQL** (`trg_equipamentos_prevent_invalid_desmonte_insert`, `trg_equipamentos_prevent_invalid_desmonte_update`, `trg_equipamentos_prevent_terminal_reopen`) impedindo no próprio motor do banco que um equipamento vá para `AGUARDANDO_COMPONENTES` sem ter passado por `EM_TRIAGEM` ou reabra estados terminais (`VENDIDO`, `DOADO`, `DESCARTADO`).
