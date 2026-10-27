import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Configura banco isolado de testes antes de importar Prisma/Fastify
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'file:./test.db';
process.env.JWT_SECRET = 'test-secret-greencode-av2';

const TEST_DB_FILES = [
  path.join(__dirname, '../prisma/test.db'),
  path.join(__dirname, '../prisma/test.db-wal'),
  path.join(__dirname, '../prisma/test.db-shm'),
  path.join(__dirname, '../prisma/test.db-journal'),
];

function cleanupTestDbFiles() {
  for (const file of TEST_DB_FILES) {
    if (fs.existsSync(file)) {
      fs.rmSync(file, { force: true });
    }
  }
}

async function runTests() {
  console.log('=== GREENCODE AV2 — SUÍTE DE TESTES DE INTEGRAÇÃO DA API ===\n');

  cleanupTestDbFiles();
  execSync('npx prisma migrate deploy', {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: 'file:./test.db' },
    stdio: 'pipe',
  });

  const { buildApp } = await import('../src/http/app');
  const { prisma } = await import('../src/lib/prisma');
  const app = await buildApp({ logger: false });
  await app.ready();

  try {
    // -------------------------------------------------------------
    // 1. HEALTH CHECK & OPENAPI DOCS
    // -------------------------------------------------------------
    console.log('1. Testando Health Check e documentação OpenAPI (/docs/json)...');
    const healthRes = await app.inject({ method: 'GET', url: '/health' });
    assert.equal(healthRes.statusCode, 200);
    assert.equal(healthRes.json().status, 'ok');

    const swaggerRes = await app.inject({ method: 'GET', url: '/docs/json' });
    assert.equal(swaggerRes.statusCode, 200);
    assert.equal(swaggerRes.json().info.version, '2.0.0');

    // -------------------------------------------------------------
    // 2. AUTHENTICATION & BOOTSTRAP JWT
    // -------------------------------------------------------------
    console.log('2. Testando Provisionamento Inicial (Bootstrap) e Autenticação JWT...');
    const unauthRes = await app.inject({ method: 'GET', url: '/api/organizations' });
    assert.equal(unauthRes.statusCode, 401);

    const bootstrapRes = await app.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: {
        name: 'Admin Principal',
        username: 'admin',
        email: 'admin@test.com',
        password: 'password123',
      },
    });
    assert.equal(bootstrapRes.statusCode, 201);
    const adminToken: string = bootstrapRes.json().token;
    assert.ok(adminToken);

    // Segundo bootstrap deve falhar com 409 Conflict
    const dupBootstrap = await app.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: {
        name: 'Outro Admin',
        username: 'admin2',
        password: 'password123',
      },
    });
    assert.equal(dupBootstrap.statusCode, 409);

    const invalidLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: 'wrong' },
    });
    assert.equal(invalidLogin.statusCode, 401);

    const validLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: 'password123' },
    });
    assert.equal(validLogin.statusCode, 200);

    const meRes = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(meRes.statusCode, 200);
    assert.equal(meRes.json().role, 'ADMINISTRADOR');

    const authHeader = (token: string) => ({ authorization: `Bearer ${token}` });

    // -------------------------------------------------------------
    // 3. CRUD COMPLETO DE USUARIOS + RBAC + OPTIMISTIC LOCKING
    // -------------------------------------------------------------
    console.log('3. Testando CRUD completo de Usuario + RBAC + Versionamento Otimista...');
    const createOp = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: authHeader(adminToken),
      payload: {
        name: 'Operador Cadastro',
        username: 'operador',
        password: 'password123',
        role: 'OPERADOR_CADASTRO',
      },
    });
    assert.equal(createOp.statusCode, 201);

    const createAlmox = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: authHeader(adminToken),
      payload: {
        name: 'Almoxarife',
        username: 'almox',
        password: 'password123',
        role: 'ALMOXARIFE',
      },
    });
    assert.equal(createAlmox.statusCode, 201);

    const createAud = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: authHeader(adminToken),
      payload: {
        name: 'Auditor',
        username: 'auditor',
        password: 'password123',
        role: 'AUDITOR',
      },
    });
    assert.equal(createAud.statusCode, 201);

    const createTempUser = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: authHeader(adminToken),
      payload: {
        name: 'Usuario Temporario',
        username: 'tempuser',
        password: 'password123',
        role: 'AUDITOR',
      },
    });
    assert.equal(createTempUser.statusCode, 201);
    const tempUserId = createTempUser.json().id;

    const opToken = (
      await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'operador', password: 'password123' },
      })
    ).json().token as string;

    const almoxToken = (
      await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'almox', password: 'password123' },
      })
    ).json().token as string;

    const auditorToken = (
      await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'auditor', password: 'password123' },
      })
    ).json().token as string;

    // Auditor pode listar usuários (200), mas não pode criar (403)
    const audListUsers = await app.inject({
      method: 'GET',
      url: '/api/users',
      headers: authHeader(auditorToken),
    });
    assert.equal(audListUsers.statusCode, 200);
    assert.equal(audListUsers.json().length, 5);

    const audForbiddenCreate = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: authHeader(auditorToken),
      payload: {
        name: 'Hacker',
        username: 'hacker',
        password: 'password123',
        role: 'ADMINISTRADOR',
      },
    });
    assert.equal(audForbiddenCreate.statusCode, 403);

    // GetById + Update com Optimistic Locking + Delete
    const getTempUser = await app.inject({
      method: 'GET',
      url: `/api/users/${tempUserId}`,
      headers: authHeader(adminToken),
    });
    assert.equal(getTempUser.statusCode, 200);
    assert.equal(getTempUser.json().version, 1);

    const updateTempUser = await app.inject({
      method: 'PUT',
      url: `/api/users/${tempUserId}`,
      headers: authHeader(adminToken),
      payload: { name: 'Usuario Atualizado', version: 1 },
    });
    assert.equal(updateTempUser.statusCode, 200);
    assert.equal(updateTempUser.json().version, 2);

    const staleUserUpdate = await app.inject({
      method: 'PUT',
      url: `/api/users/${tempUserId}`,
      headers: authHeader(adminToken),
      payload: { name: ' Conflito', version: 1 },
    });
    assert.equal(staleUserUpdate.statusCode, 409);

    const deleteTempUser = await app.inject({
      method: 'DELETE',
      url: `/api/users/${tempUserId}`,
      headers: authHeader(adminToken),
    });
    assert.equal(deleteTempUser.statusCode, 204);

    // -------------------------------------------------------------
    // 4. CRUD COMPLETO DE ORGANIZACAO + VALIDACAO CNPJ
    // -------------------------------------------------------------
    console.log('4. Testando CRUD completo de Organizacao + Validação de CNPJ...');
    const invalidCnpjRes = await app.inject({
      method: 'POST',
      url: '/api/organizations',
      headers: authHeader(opToken),
      payload: {
        name: 'Empresa Inválida',
        cnpj: '11.111.111/1111-11',
        type: 'EMPRESA_PRIVADA',
        phone: '1199999999',
        email: 'inv@emp.com',
        address: 'Rua A, 10',
      },
    });
    assert.equal(invalidCnpjRes.statusCode, 400);

    // Almoxarife não pode cadastrar organização
    const almoxForbiddenOrg = await app.inject({
      method: 'POST',
      url: '/api/organizations',
      headers: authHeader(almoxToken),
      payload: {
        name: 'Empresa X',
        cnpj: '27.212.684/0001-41',
        type: 'EMPRESA_PRIVADA',
        phone: '1199999999',
        email: 'x@emp.com',
        address: 'Rua A, 10',
      },
    });
    assert.equal(almoxForbiddenOrg.statusCode, 403);

    const org1Res = await app.inject({
      method: 'POST',
      url: '/api/organizations',
      headers: authHeader(opToken),
      payload: {
        name: 'Corporação EcoTech',
        cnpj: '27.212.684/0001-41',
        type: 'EMPRESA_PRIVADA',
        phone: '1133334444',
        email: 'contato@ecotech.com.br',
        address: 'Av. Brasil, 500',
      },
    });
    assert.equal(org1Res.statusCode, 201);
    const org1Id = org1Res.json().id as string;

    const orgTempRes = await app.inject({
      method: 'POST',
      url: '/api/organizations',
      headers: authHeader(opToken),
      payload: {
        name: 'Org Temporária',
        cnpj: '11.222.333/0001-81',
        type: 'ONG',
        phone: '1122223333',
        email: 'temp@ong.org',
        address: 'Rua B, 20',
      },
    });
    assert.equal(orgTempRes.statusCode, 201);
    const orgTempId = orgTempRes.json().id as string;

    const orgListRes = await app.inject({
      method: 'GET',
      url: '/api/organizations',
      headers: authHeader(auditorToken),
    });
    assert.equal(orgListRes.statusCode, 200);
    assert.equal(orgListRes.json().length, 2);

    const orgGetRes = await app.inject({
      method: 'GET',
      url: `/api/organizations/${org1Id}`,
      headers: authHeader(auditorToken),
    });
    assert.equal(orgGetRes.statusCode, 200);

    const orgUpdateRes = await app.inject({
      method: 'PUT',
      url: `/api/organizations/${org1Id}`,
      headers: authHeader(opToken),
      payload: { address: 'Av. Brasil, 1000 - Sede Nova', version: 1 },
    });
    assert.equal(orgUpdateRes.statusCode, 200);
    assert.equal(orgUpdateRes.json().version, 2);

    const orgStaleRes = await app.inject({
      method: 'PUT',
      url: `/api/organizations/${org1Id}`,
      headers: authHeader(opToken),
      payload: { address: 'Stale', version: 1 },
    });
    assert.equal(orgStaleRes.statusCode, 409);

    const orgDeleteTempRes = await app.inject({
      method: 'DELETE',
      url: `/api/organizations/${orgTempId}`,
      headers: authHeader(opToken),
    });
    assert.equal(orgDeleteTempRes.statusCode, 204);

    // -------------------------------------------------------------
    // 5. CRUD COMPLETO DE CONTRATO + CLAUSULAS JSON + RECALCULO
    // -------------------------------------------------------------
    console.log('5. Testando CRUD completo de Contrato + Cláusulas JSON...');
    const org2Res = await app.inject({
      method: 'POST',
      url: '/api/organizations',
      headers: authHeader(opToken),
      payload: {
        name: 'Hospital Vida',
        cnpj: '12.345.678/0001-95',
        type: 'HOSPITAL',
        phone: '1144445555',
        email: 'ti@hospitalvida.org',
        address: 'Av. Saúde, 100',
      },
    });
    const org2Id = org2Res.json().id as string;

    const contract1Res = await app.inject({
      method: 'POST',
      url: '/api/contracts',
      headers: authHeader(opToken),
      payload: {
        organizationId: org1Id,
        contractNumber: 'CTR-TEST-001',
        startDate: '2026-01-01T00:00:00.000Z',
        endDate: '2027-01-01T00:00:00.000Z',
        status: 'ATIVO',
        collectionFrequency: 'MENSAL',
        taxRate: 10,
        depreciationRate: 20,
        estimatedMonthlyValue: 15000,
        clauses: { slaHours: 24, certifiedDisposal: true },
      },
    });
    assert.equal(contract1Res.statusCode, 201);
    const contract1Id = contract1Res.json().id as string;
    assert.equal(contract1Res.json().clauses.slaHours, 24);

    // 1:1 constraint — segundo contrato na mesma organização deve retornar 409
    const dupContractRes = await app.inject({
      method: 'POST',
      url: '/api/contracts',
      headers: authHeader(opToken),
      payload: {
        organizationId: org1Id,
        contractNumber: 'CTR-TEST-DUP',
        startDate: '2026-01-01T00:00:00.000Z',
      },
    });
    assert.equal(dupContractRes.statusCode, 409);

    const tempContractRes = await app.inject({
      method: 'POST',
      url: '/api/contracts',
      headers: authHeader(opToken),
      payload: {
        organizationId: org2Id,
        contractNumber: 'CTR-TEMP-002',
        startDate: '2026-02-01T00:00:00.000Z',
      },
    });
    assert.equal(tempContractRes.statusCode, 201);
    const tempContractId = tempContractRes.json().id as string;

    const listContractsRes = await app.inject({
      method: 'GET',
      url: '/api/contracts',
      headers: authHeader(auditorToken),
    });
    assert.equal(listContractsRes.statusCode, 200);
    assert.equal(listContractsRes.json().length, 2);

    const getContractRes = await app.inject({
      method: 'GET',
      url: `/api/contracts/${contract1Id}`,
      headers: authHeader(auditorToken),
    });
    assert.equal(getContractRes.statusCode, 200);

    const updateContractRes = await app.inject({
      method: 'PUT',
      url: `/api/contracts/${contract1Id}`,
      headers: authHeader(opToken),
      payload: {
        taxRate: 10,
        depreciationRate: 10,
        clauses: { slaHours: 12, certifiedDisposal: true },
        version: 1,
      },
    });
    assert.equal(updateContractRes.statusCode, 200);
    assert.equal(updateContractRes.json().version, 2);
    assert.equal(updateContractRes.json().clauses.slaHours, 12);

    const staleContractRes = await app.inject({
      method: 'PUT',
      url: `/api/contracts/${contract1Id}`,
      headers: authHeader(opToken),
      payload: { notes: 'Stale', version: 1 },
    });
    assert.equal(staleContractRes.statusCode, 409);

    const delContractRes = await app.inject({
      method: 'DELETE',
      url: `/api/contracts/${tempContractId}`,
      headers: authHeader(opToken),
    });
    assert.equal(delContractRes.statusCode, 204);

    // -------------------------------------------------------------
    // 6. CRUD COMPLETO DE LOTE + DATA VALIDATOR + $TRANSACTION ATOMICA
    // -------------------------------------------------------------
    console.log('6. Testando CRUD completo de Lote + Validação Temporal + Rollback $transaction...');
    const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const futureLotRes = await app.inject({
      method: 'POST',
      url: '/api/lots',
      headers: authHeader(almoxToken),
      payload: {
        code: 'LOTE-FUTURO',
        organizationId: org1Id,
        origin: 'A',
        destination: 'B',
        entryDate: futureDate,
      },
    });
    assert.equal(futureLotRes.statusCode, 400);

    const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
    const oldLotRes = await app.inject({
      method: 'POST',
      url: '/api/lots',
      headers: authHeader(almoxToken),
      payload: {
        code: 'LOTE-ANTIGO',
        organizationId: org1Id,
        origin: 'A',
        destination: 'B',
        entryDate: oldDate,
      },
    });
    assert.equal(oldLotRes.statusCode, 400);

    // Teste de atomicidade ($transaction): 2 equipamentos com mesmo codigoBarrasInterno -> rollback completo do lote!
    const rollbackLotRes = await app.inject({
      method: 'POST',
      url: '/api/lots',
      headers: authHeader(almoxToken),
      payload: {
        code: 'LOTE-ROLLBACK',
        organizationId: org1Id,
        origin: 'Matriz',
        destination: 'Galpão',
        newEquipments: [
          {
            codigoBarrasInterno: 'BAR-DUP-1',
            serial: 'SN-1',
            category: 'PC',
            brand: 'Dell',
            model: 'OptiPlex',
            condition: 'BOM',
            location: 'Doca 1',
          },
          {
            codigoBarrasInterno: 'BAR-DUP-1',
            serial: 'SN-2',
            category: 'PC',
            brand: 'Dell',
            model: 'OptiPlex',
            condition: 'BOM',
            location: 'Doca 1',
          },
        ],
      },
    });
    assert.equal(rollbackLotRes.statusCode, 409);

    const checkRolledBackLot = await prisma.lote.findUnique({
      where: { code: 'LOTE-ROLLBACK' },
    });
    assert.equal(checkRolledBackLot, null);

    // Criação válida transacional de Lote + múltiplos Equipamentos
    const lot1Res = await app.inject({
      method: 'POST',
      url: '/api/lots',
      headers: authHeader(almoxToken),
      payload: {
        code: 'LOTE-VALIDO-001',
        organizationId: org1Id,
        invoiceNumber: 'NF-555',
        carrier: 'EcoTrans',
        origin: 'Matriz EcoTech',
        destination: 'Galpão Central',
        newEquipments: [
          {
            codigoBarrasInterno: 'GC-TEST-0001',
            serial: 'SN-BATCH-01',
            category: 'Notebook',
            brand: 'Dell',
            model: 'Latitude',
            condition: 'NOVO',
            location: 'Setor A',
            estimatedValue: 1000,
          },
          {
            codigoBarrasInterno: 'GC-TEST-0002',
            serial: 'SN-BATCH-02',
            category: 'Monitor',
            brand: 'LG',
            model: 'UltraWide',
            condition: 'OTIMO',
            location: 'Setor A',
            estimatedValue: 800,
          },
        ],
      },
    });
    assert.equal(lot1Res.statusCode, 201);
    const lot1Id = lot1Res.json().id as string;
    assert.equal(lot1Res.json().equipments.length, 2);

    const lotTempRes = await app.inject({
      method: 'POST',
      url: '/api/lots',
      headers: authHeader(almoxToken),
      payload: {
        code: 'LOTE-TEMP-DEL',
        organizationId: org1Id,
        origin: 'Filial',
        destination: 'Galpão',
      },
    });
    assert.equal(lotTempRes.statusCode, 201);
    const lotTempId = lotTempRes.json().id as string;

    const listLotsRes = await app.inject({
      method: 'GET',
      url: '/api/lots',
      headers: authHeader(auditorToken),
    });
    assert.equal(listLotsRes.statusCode, 200);
    assert.equal(listLotsRes.json().length, 2);

    const getLotRes = await app.inject({
      method: 'GET',
      url: `/api/lots/${lot1Id}`,
      headers: authHeader(auditorToken),
    });
    assert.equal(getLotRes.statusCode, 200);

    const updateLotRes = await app.inject({
      method: 'PUT',
      url: `/api/lots/${lot1Id}`,
      headers: authHeader(almoxToken),
      payload: { status: 'EM_PROCESSAMENTO', version: 1 },
    });
    assert.equal(updateLotRes.statusCode, 200);
    assert.equal(updateLotRes.json().version, 2);

    const staleLotRes = await app.inject({
      method: 'PUT',
      url: `/api/lots/${lot1Id}`,
      headers: authHeader(almoxToken),
      payload: { status: 'FECHADO', version: 1 },
    });
    assert.equal(staleLotRes.statusCode, 409);

    const delLotRes = await app.inject({
      method: 'DELETE',
      url: `/api/lots/${lotTempId}`,
      headers: authHeader(almoxToken),
    });
    assert.equal(delLotRes.statusCode, 204);

    // -------------------------------------------------------------
    // 7. CRUD COMPLETO DE EQUIPAMENTO + REGRAS DE DOMINIO + TRIGGERS SQL
    // -------------------------------------------------------------
    console.log('7. Testando CRUD completo de Equipamento + Regras Financeiras/Status/Condição + Trigger SQL...');
    // Verifica cálculo financeiro: estimated=1000, NOVO(1.0), dep=10%(900), tax=10%(90) => currentValue=810
    const eqCreateRes = await app.inject({
      method: 'POST',
      url: '/api/equipments',
      headers: authHeader(almoxToken),
      payload: {
        organizationId: org1Id,
        lotId: lot1Id,
        codigoBarrasInterno: 'GC-TEST-0003',
        serial: 'SN-SERVER-99',
        category: 'Servidor',
        brand: 'HP',
        model: 'ProLiant DL380',
        condition: 'NOVO',
        location: 'Rack 01',
        estimatedValue: 1000,
        notes: 'Servidor de borda',
      },
    });
    assert.equal(eqCreateRes.statusCode, 201);
    const eqId = eqCreateRes.json().id as string;
    assert.equal(eqCreateRes.json().currentValue, 810);

    const valuationRes = await app.inject({
      method: 'GET',
      url: `/api/equipments/${eqId}/valuation`,
      headers: authHeader(auditorToken),
    });
    assert.equal(valuationRes.statusCode, 200);
    assert.equal(valuationRes.json().currentValue, 810);

    // Regra 1: bloqueio de ida direta para AGUARDANDO_COMPONENTES sem passar por EM_TRIAGEM
    const invalidDesmonte = await app.inject({
      method: 'PATCH',
      url: `/api/equipments/${eqId}/status`,
      headers: authHeader(almoxToken),
      payload: { status: 'AGUARDANDO_COMPONENTES', note: 'Tentando pular triagem' },
    });
    assert.equal(invalidDesmonte.statusCode, 400);

    // Teste direto do TRIGGER SQL no banco (mesmo ignorando camada de serviço!)
    await assert.rejects(
      async () => {
        await prisma.$executeRawUnsafe(
          `UPDATE "equipamentos" SET "status" = 'AGUARDANDO_COMPONENTES' WHERE "id" = '${eqId}';`
        );
      },
      (err: Error) => err.message.includes('DB_TRIGGER')
    );

    // Regra 2: rebaixamento >= 2 categorias (NOVO -> REGULAR) sem justificativa deve falhar
    const invalidCondDrop = await app.inject({
      method: 'PATCH',
      url: `/api/equipments/${eqId}/condition`,
      headers: authHeader(almoxToken),
      payload: { condition: 'REGULAR', note: '' },
    });
    assert.equal(invalidCondDrop.statusCode, 400);

    // Com justificativa textual deve funcionar e recalcular depreciação (1000 * 0.5 * 0.9 * 0.9 = 405)
    const validCondDrop = await app.inject({
      method: 'PATCH',
      url: `/api/equipments/${eqId}/condition`,
      headers: authHeader(almoxToken),
      payload: {
        condition: 'REGULAR',
        note: 'Fonte redundante queimada identificada em bancada.',
        version: 1,
      },
    });
    assert.equal(validCondDrop.statusCode, 200);
    assert.equal(validCondDrop.json().currentValue, 405);
    assert.equal(validCondDrop.json().version, 2);

    // Transição válida: RECEBIDO -> EM_TRIAGEM -> AGUARDANDO_COMPONENTES
    const toTriagem = await app.inject({
      method: 'PATCH',
      url: `/api/equipments/${eqId}/status`,
      headers: authHeader(almoxToken),
      payload: { status: 'EM_TRIAGEM', note: 'Triagem completa iniciada', version: 2 },
    });
    assert.equal(toTriagem.statusCode, 200);

    const toDesmonte = await app.inject({
      method: 'PATCH',
      url: `/api/equipments/${eqId}/status`,
      headers: authHeader(almoxToken),
      payload: {
        status: 'AGUARDANDO_COMPONENTES',
        toLocation: 'Setor Desmonte',
        note: 'Liberado após triagem',
        version: 3,
      },
    });
    assert.equal(toDesmonte.statusCode, 200);
    assert.equal(toDesmonte.json().status, 'AGUARDANDO_COMPONENTES');

    // Update CRUD geral + Optimistic Locking
    const updateEqRes = await app.inject({
      method: 'PUT',
      url: `/api/equipments/${eqId}`,
      headers: authHeader(almoxToken),
      payload: { notes: 'Aguardando fonte 800W', version: 4 },
    });
    assert.equal(updateEqRes.statusCode, 200);
    assert.equal(updateEqRes.json().version, 5);

    const staleEqRes = await app.inject({
      method: 'PUT',
      url: `/api/equipments/${eqId}`,
      headers: authHeader(almoxToken),
      payload: { notes: 'Conflito', version: 2 },
    });
    assert.equal(staleEqRes.statusCode, 409);

    const eqHistoryRes = await app.inject({
      method: 'GET',
      url: `/api/equipments/${eqId}/history`,
      headers: authHeader(auditorToken),
    });
    assert.equal(eqHistoryRes.statusCode, 200);
    assert.equal(eqHistoryRes.json().length, 4);

    // Consolidação financeira da organização
    const finSummaryRes = await app.inject({
      method: 'GET',
      url: `/api/organizations/${org1Id}/financial-summary`,
      headers: authHeader(auditorToken),
    });
    assert.equal(finSummaryRes.statusCode, 200);
    assert.equal(finSummaryRes.json().totalEquipments, 3);

    // Cria equipamento temporário e testa DELETE
    const eqTempRes = await app.inject({
      method: 'POST',
      url: '/api/equipments',
      headers: authHeader(almoxToken),
      payload: {
        organizationId: org1Id,
        serial: 'SN-TEMP-DEL',
        category: 'Cabo',
        brand: 'Genérico',
        model: 'Cat6',
        condition: 'BOM',
        location: 'Caixa 1',
      },
    });
    assert.equal(eqTempRes.statusCode, 201);
    const delEqRes = await app.inject({
      method: 'DELETE',
      url: `/api/equipments/${eqTempRes.json().id}`,
      headers: authHeader(almoxToken),
    });
    assert.equal(delEqRes.statusCode, 204);

    // -------------------------------------------------------------
    // 8. CRUD COMPLETO DE MOVIMENTACAO
    // -------------------------------------------------------------
    console.log('8. Testando CRUD completo de Movimentacao...');
    const createMovRes = await app.inject({
      method: 'POST',
      url: '/api/movements',
      headers: authHeader(almoxToken),
      payload: {
        equipmentId: eqId,
        lotId: lot1Id,
        type: 'REPARO',
        quantity: 1,
        note: 'Fonte instalada e servidor em reparo',
        toStatus: 'EM_REPARO',
        toLocation: 'Laboratório Servidores',
      },
    });
    assert.equal(createMovRes.statusCode, 201);
    const movId = createMovRes.json().id as string;

    const listMovRes = await app.inject({
      method: 'GET',
      url: `/api/movements?equipmentId=${eqId}`,
      headers: authHeader(auditorToken),
    });
    assert.equal(listMovRes.statusCode, 200);
    assert.equal(listMovRes.json().length, 5);

    const getMovRes = await app.inject({
      method: 'GET',
      url: `/api/movements/${movId}`,
      headers: authHeader(auditorToken),
    });
    assert.equal(getMovRes.statusCode, 200);

    const updateMovRes = await app.inject({
      method: 'PUT',
      url: `/api/movements/${movId}`,
      headers: authHeader(almoxToken),
      payload: {
        note: 'Fonte instalada, BIOS atualizada e servidor em reparo',
        financialValue: 550,
        version: 1,
      },
    });
    assert.equal(updateMovRes.statusCode, 200);
    assert.equal(updateMovRes.json().version, 2);

    const staleMovRes = await app.inject({
      method: 'PUT',
      url: `/api/movements/${movId}`,
      headers: authHeader(almoxToken),
      payload: { note: 'Stale', version: 1 },
    });
    assert.equal(staleMovRes.statusCode, 409);

    // Almoxarife não tem permissão de DELETE em movimentações (403); Admin tem (204)
    const almoxDelMov = await app.inject({
      method: 'DELETE',
      url: `/api/movements/${movId}`,
      headers: authHeader(almoxToken),
    });
    assert.equal(almoxDelMov.statusCode, 403);

    const adminDelMov = await app.inject({
      method: 'DELETE',
      url: `/api/movements/${movId}`,
      headers: authHeader(adminToken),
    });
    assert.equal(adminDelMov.statusCode, 204);

    // -------------------------------------------------------------
    // 9. CRUD COMPLETO DE EVENTO_AUDITORIA + INTEGRIDADE SHA-256
    // -------------------------------------------------------------
    console.log('9. Testando CRUD completo de EventoAuditoria + Verificação Criptográfica...');
    const createAuditRes = await app.inject({
      method: 'POST',
      url: '/api/audit-events',
      headers: authHeader(adminToken),
      payload: {
        action: 'MANUAL_COMPLIANCE_CHECK',
        entityName: 'Organizacao',
        entityId: org1Id,
        details: { inspector: 'Auditor Interno', passed: true },
      },
    });
    assert.equal(createAuditRes.statusCode, 201);
    const auditId = createAuditRes.json().id as string;

    const listAuditRes = await app.inject({
      method: 'GET',
      url: '/api/audit-events',
      headers: authHeader(auditorToken),
    });
    assert.equal(listAuditRes.statusCode, 200);
    assert.ok(listAuditRes.json().length >= 15);

    const getAuditRes = await app.inject({
      method: 'GET',
      url: `/api/audit-events/${auditId}`,
      headers: authHeader(auditorToken),
    });
    assert.equal(getAuditRes.statusCode, 200);

    const updateAuditRes = await app.inject({
      method: 'PUT',
      url: `/api/audit-events/${auditId}`,
      headers: authHeader(adminToken),
      payload: {
        details: { inspector: 'Auditor Chefe', passed: true, certificate: 'ISO-14001' },
        version: 1,
      },
    });
    assert.equal(updateAuditRes.statusCode, 200);
    assert.equal(updateAuditRes.json().version, 2);

    const staleAuditRes = await app.inject({
      method: 'PUT',
      url: `/api/audit-events/${auditId}`,
      headers: authHeader(adminToken),
      payload: { action: 'STALE', version: 1 },
    });
    assert.equal(staleAuditRes.statusCode, 409);

    const verifyBeforeDel = await app.inject({
      method: 'GET',
      url: '/api/audit-events/verify',
      headers: authHeader(auditorToken),
    });
    assert.equal(verifyBeforeDel.statusCode, 200);
    assert.equal(verifyBeforeDel.json().valid, true);

    const delAuditRes = await app.inject({
      method: 'DELETE',
      url: `/api/audit-events/${auditId}`,
      headers: authHeader(adminToken),
    });
    assert.equal(delAuditRes.statusCode, 204);

    const verifyAfterDel = await app.inject({
      method: 'GET',
      url: '/api/audit-events/verify',
      headers: authHeader(auditorToken),
    });
    assert.equal(verifyAfterDel.statusCode, 200);
    assert.equal(verifyAfterDel.json().valid, true);

    console.log(
      `\n✔ TODOS OS TESTES PASSARAM COM SUCESSO! (${verifyAfterDel.json().totalEvents} eventos auditados e verificados)`
    );
  } finally {
    await app.close();
    cleanupTestDbFiles();
  }
}

runTests().catch((err) => {
  console.error('\n✖ FALHA NOS TESTES DE INTEGRAÇÃO:', err);
  cleanupTestDbFiles();
  process.exit(1);
});
