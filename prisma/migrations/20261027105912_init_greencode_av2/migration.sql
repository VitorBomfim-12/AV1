-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "usuarios_role_check" CHECK ("role" IN ('ADMINISTRADOR', 'OPERADOR_CADASTRO', 'ALMOXARIFE', 'AUDITOR')),
    CONSTRAINT "usuarios_version_check" CHECK ("version" >= 1)
);

-- CreateTable
CREATE TABLE "organizacoes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "organizacoes_cnpj_len_check" CHECK (length("cnpj") = 14),
    CONSTRAINT "organizacoes_version_check" CHECK ("version" >= 1)
);

-- CreateTable
CREATE TABLE "contratos" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "contractNumber" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "collectionFrequency" TEXT NOT NULL DEFAULT 'MENSAL',
    "taxRate" REAL NOT NULL DEFAULT 0,
    "depreciationRate" REAL NOT NULL DEFAULT 10,
    "estimatedMonthlyValue" REAL NOT NULL DEFAULT 0,
    "clauses" JSONB,
    "notes" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "contratos_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizacoes" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "contratos_status_check" CHECK ("status" IN ('RASCUNHO', 'ATIVO', 'SUSPENSO', 'ENCERRADO')),
    CONSTRAINT "contratos_tax_rate_check" CHECK ("taxRate" >= 0 AND "taxRate" <= 100),
    CONSTRAINT "contratos_depreciation_rate_check" CHECK ("depreciationRate" >= 0 AND "depreciationRate" <= 100),
    CONSTRAINT "contratos_monthly_value_check" CHECK ("estimatedMonthlyValue" >= 0),
    CONSTRAINT "contratos_dates_check" CHECK ("endDate" IS NULL OR "endDate" >= "startDate"),
    CONSTRAINT "contratos_version_check" CHECK ("version" >= 1)
);

-- CreateTable
CREATE TABLE "lotes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "invoiceNumber" TEXT,
    "carrier" TEXT,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ABERTO',
    "entryDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "lotes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizacoes" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "lotes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "usuarios" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "lotes_status_check" CHECK ("status" IN ('ABERTO', 'EM_PROCESSAMENTO', 'FECHADO', 'CANCELADO')),
    CONSTRAINT "lotes_version_check" CHECK ("version" >= 1)
);

-- CreateTable
CREATE TABLE "equipamentos" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "lotId" TEXT,
    "codigoBarrasInterno" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEBIDO',
    "location" TEXT NOT NULL,
    "estimatedValue" REAL NOT NULL DEFAULT 0,
    "currentValue" REAL NOT NULL DEFAULT 0,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "equipamentos_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizacoes" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "equipamentos_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lotes" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "equipamentos_condition_check" CHECK ("condition" IN ('NOVO', 'OTIMO', 'BOM', 'REGULAR', 'RUIM', 'PESSIMO', 'SUCATA')),
    CONSTRAINT "equipamentos_status_check" CHECK ("status" IN ('RECEBIDO', 'EM_TRIAGEM', 'AGUARDANDO_COMPONENTES', 'EM_REPARO', 'RECONDICIONADO', 'DESCARTADO', 'DOADO', 'VENDIDO')),
    CONSTRAINT "equipamentos_estimated_value_check" CHECK ("estimatedValue" >= 0),
    CONSTRAINT "equipamentos_current_value_check" CHECK ("currentValue" >= 0),
    CONSTRAINT "equipamentos_version_check" CHECK ("version" >= 1)
);

-- CreateTable
CREATE TABLE "movimentacoes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "equipmentId" TEXT NOT NULL,
    "lotId" TEXT,
    "actorId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "fromCondition" TEXT,
    "toCondition" TEXT,
    "fromLocation" TEXT,
    "toLocation" TEXT,
    "financialValue" REAL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "movimentacoes_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipamentos" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "movimentacoes_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lotes" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "movimentacoes_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "usuarios" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "movimentacoes_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "movimentacoes_type_check" CHECK ("type" IN ('RECEBIMENTO', 'TRIAGEM', 'TRANSFERENCIA', 'REPARO', 'RECONDICIONAMENTO', 'DESCARTE', 'DOACAO', 'VENDA', 'AJUSTE_ESTOQUE')),
    CONSTRAINT "movimentacoes_version_check" CHECK ("version" >= 1)
);

-- CreateTable
CREATE TABLE "eventos_auditoria" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityName" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "previousHash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "eventos_auditoria_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "usuarios" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "eventos_auditoria_version_check" CHECK ("version" >= 1)
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_username_key" ON "usuarios"("username");
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");
CREATE UNIQUE INDEX "organizacoes_cnpj_key" ON "organizacoes"("cnpj");
CREATE UNIQUE INDEX "contratos_organizationId_key" ON "contratos"("organizationId");
CREATE UNIQUE INDEX "contratos_contractNumber_key" ON "contratos"("contractNumber");
CREATE UNIQUE INDEX "lotes_code_key" ON "lotes"("code");
CREATE INDEX "lotes_organizationId_idx" ON "lotes"("organizationId");
CREATE INDEX "lotes_status_idx" ON "lotes"("status");
CREATE UNIQUE INDEX "equipamentos_codigoBarrasInterno_key" ON "equipamentos"("codigoBarrasInterno");
CREATE INDEX "equipamentos_organizationId_idx" ON "equipamentos"("organizationId");
CREATE INDEX "equipamentos_lotId_idx" ON "equipamentos"("lotId");
CREATE INDEX "equipamentos_status_idx" ON "equipamentos"("status");
CREATE INDEX "movimentacoes_equipmentId_idx" ON "movimentacoes"("equipmentId");
CREATE INDEX "movimentacoes_lotId_idx" ON "movimentacoes"("lotId");
CREATE INDEX "movimentacoes_actorId_idx" ON "movimentacoes"("actorId");
CREATE UNIQUE INDEX "eventos_auditoria_hash_key" ON "eventos_auditoria"("hash");
CREATE INDEX "eventos_auditoria_entityName_entityId_idx" ON "eventos_auditoria"("entityName", "entityId");
CREATE INDEX "eventos_auditoria_actorId_idx" ON "eventos_auditoria"("actorId");

-- Database Triggers para garantia de consistencia de estados no SGBD
CREATE TRIGGER "trg_equipamentos_prevent_invalid_desmonte_insert"
BEFORE INSERT ON "equipamentos"
FOR EACH ROW
WHEN NEW."status" = 'AGUARDANDO_COMPONENTES'
BEGIN
    SELECT RAISE(ABORT, 'DB_TRIGGER: Equipamento nao pode iniciar diretamente em AGUARDANDO_COMPONENTES sem passar por EM_TRIAGEM.');
END;

CREATE TRIGGER "trg_equipamentos_prevent_invalid_desmonte_update"
BEFORE UPDATE OF "status" ON "equipamentos"
FOR EACH ROW
WHEN NEW."status" = 'AGUARDANDO_COMPONENTES' AND OLD."status" NOT IN ('EM_TRIAGEM', 'AGUARDANDO_COMPONENTES')
BEGIN
    SELECT RAISE(ABORT, 'DB_TRIGGER: Equipamento so pode transitar para AGUARDANDO_COMPONENTES a partir de EM_TRIAGEM.');
END;

CREATE TRIGGER "trg_equipamentos_prevent_terminal_reopen"
BEFORE UPDATE OF "status" ON "equipamentos"
FOR EACH ROW
WHEN OLD."status" IN ('DESCARTADO', 'DOADO', 'VENDIDO') AND NEW."status" != OLD."status"
BEGIN
    SELECT RAISE(ABORT, 'DB_TRIGGER: Equipamento em status terminal nao pode transitar para outro status.');
END;
