import {
  CollectionFrequency,
  ContractStatus,
  EquipmentCondition,
  EquipmentStatus,
  LotStatus,
  Role,
  TransactionType,
} from '../src/domain/enums';
import { initDatabasePragmas, prisma } from '../src/lib/prisma';
import { AuditEventService } from '../src/services/audit-event.service';
import { AuthService } from '../src/services/auth.service';
import { ContractService } from '../src/services/contract.service';
import { EquipmentService } from '../src/services/equipment.service';
import { LotService } from '../src/services/lot.service';
import { MovementService } from '../src/services/movement.service';
import { OrganizationService } from '../src/services/organization.service';
import { UserService } from '../src/services/user.service';

async function main() {
  console.log('=== GREENCODE AV2 — INICIANDO SEED DO BANCO DE DADOS ===\n');
  await initDatabasePragmas();

  // Limpa tabelas respeitando integridade referencial para seed idempotente
  await prisma.eventoAuditoria.deleteMany();
  await prisma.movimentacao.deleteMany();
  await prisma.equipamento.deleteMany();
  await prisma.lote.deleteMany();
  await prisma.contrato.deleteMany();
  await prisma.organizacao.deleteMany();
  await prisma.usuario.deleteMany();

  const authService = new AuthService();
  const userService = new UserService();
  const orgService = new OrganizationService();
  const contractService = new ContractService();
  const lotService = new LotService();
  const equipmentService = new EquipmentService();
  const movementService = new MovementService();
  const auditService = new AuditEventService();

  // 1. Usuários (4 perfis funcionais)
  const admin = await authService.bootstrapAdmin({
    name: 'Administrador Geral',
    username: 'admin',
    email: 'admin@greencode.com.br',
    password: 'admin123',
  });
  const adminActor = { id: admin.id, username: admin.username, role: admin.role };

  const operador = await userService.create(adminActor, {
    name: 'Marina Operadora de Cadastro',
    username: 'operador',
    email: 'operador@greencode.com.br',
    password: 'operador123',
    role: Role.OPERADOR_CADASTRO,
  });
  const operadorActor = { id: operador.id, username: operador.username, role: operador.role };

  const almoxarife = await userService.create(adminActor, {
    name: 'Carlos Gestor de Almoxarifado',
    username: 'almoxarife',
    email: 'almoxarife@greencode.com.br',
    password: 'almox123',
    role: Role.ALMOXARIFE,
  });
  const almoxActor = { id: almoxarife.id, username: almoxarife.username, role: almoxarife.role };

  const auditor = await userService.create(adminActor, {
    name: 'Fernanda Auditora Ambiental',
    username: 'auditor',
    email: 'auditor@greencode.com.br',
    password: 'auditor123',
    role: Role.AUDITOR,
  });
  const auditorActor = { id: auditor.id, username: auditor.username, role: auditor.role };

  console.log('✔ Usuários criados (admin, operador, almoxarife, auditor)');

  // 2. Organizações (com CNPJs brasileiros válidos)
  const orgBanco = await orgService.create(operadorActor, {
    name: 'Banco Atlântico S.A.',
    cnpj: '27.212.684/0001-41',
    type: 'EMPRESA_PRIVADA',
    phone: '(11) 3040-1000',
    email: 'sustentabilidade@bancoatlantico.com.br',
    address: 'Av. Paulista, 1500 - São Paulo/SP',
  });

  const orgHospital = await orgService.create(operadorActor, {
    name: 'Hospital São Lucas Rede Saúde',
    cnpj: '11.222.333/0001-81',
    type: 'HOSPITAL',
    phone: '(11) 2100-5000',
    email: 'engenharia.clinica@saolucas.org.br',
    address: 'Rua Vergueiro, 890 - São Paulo/SP',
  });

  // Terceira organização sem contrato para demonstrar relacionamento 1:1 opcional
  const orgUniversidade = await orgService.create(operadorActor, {
    name: 'Instituto Tecnológico Estadual',
    cnpj: '12.345.678/0001-95',
    type: 'UNIVERSIDADE',
    phone: '(19) 3521-7000',
    email: 'patrimonio@ite.edu.br',
    address: 'Cidade Universitária, Bloco B - Campinas/SP',
  });

  console.log('✔ Organizações criadas (3 organizações com CNPJs validados)');

  // 3. Contratos (com cláusulas JSON semiestruturadas e parâmetros financeiros)
  await contractService.create(operadorActor, {
    organizationId: orgBanco.id,
    contractNumber: 'CTR-2026-0001',
    startDate: '2026-01-15T00:00:00.000Z',
    endDate: '2027-01-15T00:00:00.000Z',
    status: ContractStatus.ATIVO,
    collectionFrequency: CollectionFrequency.MENSAL,
    taxRate: 12,
    depreciationRate: 15,
    estimatedMonthlyValue: 45000,
    clauses: {
      pnrsCompliance: true,
      dataSanitizationStandard: 'NIST SP 800-88 Purge',
      slaHoursCollection: 48,
      revenueSharePercent: 25,
      penalties: {
        lateCollectionDailyFinePercent: 0.5,
      },
    },
    notes: 'Contrato corporativo de renovação de frota bancária (ciclo de 18 meses).',
  });

  await contractService.create(operadorActor, {
    organizationId: orgHospital.id,
    contractNumber: 'CTR-2026-0002',
    startDate: '2026-03-01T00:00:00.000Z',
    endDate: '2028-03-01T00:00:00.000Z',
    status: ContractStatus.ATIVO,
    collectionFrequency: CollectionFrequency.TRIMESTRAL,
    taxRate: 8,
    depreciationRate: 20,
    estimatedMonthlyValue: 18500,
    clauses: {
      pnrsCompliance: true,
      requiresEnvironmentalCertificate: true,
      hazardousComponentsProtocol: 'ANVISA-RDC-222',
    },
    notes: 'Coleta de terminais administrativos e TI hospitalar.',
  });

  console.log('✔ Contratos criados com cláusulas JSON e coeficientes financeiros');

  // 4. Lotes e Equipamentos (incluindo criação transacional composta e estados variados)
  const loteBanco = await lotService.create(almoxActor, {
    code: 'LOTE-2026-001',
    organizationId: orgBanco.id,
    invoiceNumber: 'NF-00098412',
    carrier: 'TransRápida EcoLogística',
    origin: 'Centro Administrativo Banco Atlântico - SP',
    destination: 'Galpão Central GreenCode - Doca 01',
    status: LotStatus.EM_PROCESSAMENTO,
    notes: 'Lote de desmobilização de agências bancárias.',
    newEquipments: [
      {
        codigoBarrasInterno: 'GC-2026-000001',
        serial: 'DELL-XPS-9901',
        category: 'Notebook',
        brand: 'Dell',
        model: 'Latitude 7420',
        condition: EquipmentCondition.OTIMO,
        location: 'Setor de Triagem A1',
        estimatedValue: 4200,
        notes: 'Acompanha carregador original',
      },
      {
        codigoBarrasInterno: 'GC-2026-000002',
        serial: 'LEN-T14-8821',
        category: 'Notebook',
        brand: 'Lenovo',
        model: 'ThinkPad T14 Gen 2',
        condition: EquipmentCondition.BOM,
        location: 'Setor de Reparo B2',
        estimatedValue: 3800,
        notes: 'Bateria com desgaste moderado',
      },
      {
        codigoBarrasInterno: 'GC-2026-000003',
        serial: 'HP-ELITE-7710',
        category: 'Desktop',
        brand: 'HP',
        model: 'EliteDesk 800 G6',
        condition: EquipmentCondition.REGULAR,
        location: 'Área de Descarte Seguro D1',
        estimatedValue: 2600,
        notes: 'Placa-mãe oxidada',
      },
    ],
  });

  const loteHospital = await lotService.create(almoxActor, {
    code: 'LOTE-2026-002',
    organizationId: orgHospital.id,
    invoiceNumber: 'NF-00044109',
    carrier: 'EcoFrota Sudeste',
    origin: 'Hospital São Lucas - Unidade Paulista',
    destination: 'Galpão Central GreenCode - Doca 02',
    status: LotStatus.FECHADO,
    newEquipments: [
      {
        codigoBarrasInterno: 'GC-2026-000004',
        serial: 'APC-UPS-3000',
        category: 'No-Break',
        brand: 'APC',
        model: 'Smart-UPS 3000VA',
        condition: EquipmentCondition.BOM,
        location: 'Expedição Doação Social',
        estimatedValue: 5000,
        notes: 'Módulo inversor íntegro',
      },
      {
        codigoBarrasInterno: 'GC-2026-000005',
        serial: 'LG-MON-27UL',
        category: 'Monitor',
        brand: 'LG',
        model: '27UL500 IPS',
        condition: EquipmentCondition.NOVO,
        location: 'Estoque Recebimento R1',
        estimatedValue: 1600,
        notes: 'Caixa reserva desmobilizada sem uso',
      },
    ],
  });

  const loteUniversidade = await lotService.create(almoxActor, {
    code: 'LOTE-2026-003',
    organizationId: orgUniversidade.id,
    invoiceNumber: 'NF-00011200',
    carrier: 'Transporte Institucional ITE',
    origin: 'Campus Campinas - Lab Redes',
    destination: 'Galpão Central GreenCode - Doca 03',
    status: LotStatus.ABERTO,
  });

  const eqSwitch = await equipmentService.create(almoxActor, {
    organizationId: orgUniversidade.id,
    lotId: loteUniversidade.id,
    codigoBarrasInterno: 'GC-2026-000006',
    serial: 'CISCO-CAT-2960X',
    category: 'Switch de Rede',
    brand: 'Cisco',
    model: 'Catalyst 2960-X 48P',
    condition: EquipmentCondition.BOM,
    location: 'Bancada de Testes Redes',
    estimatedValue: 6500,
    notes: 'Portas PoE operacionais',
  });

  // 5. Movimentações e Transições de Estado respeitando todas as regras de domínio
  const [eqDell, eqLenovo, eqHp] = loteBanco.equipments;
  const [eqUps] = loteHospital.equipments;

  // Cenário 1: Queda de 3 níveis de condição (OTIMO -> PESSIMO/RUIM) com justificativa obrigatória + Triagem -> Desmonte
  await equipmentService.updateCondition(almoxActor, eqDell.id, {
    condition: EquipmentCondition.RUIM,
    note: 'Avaria severa na carcaça e tela trincada identificada na abertura do palete.',
  });
  await equipmentService.changeStatus(almoxActor, eqDell.id, {
    status: EquipmentStatus.EM_TRIAGEM,
    note: 'Iniciando triagem técnica completa.',
  });
  await equipmentService.changeStatus(almoxActor, eqDell.id, {
    status: EquipmentStatus.AGUARDANDO_COMPONENTES,
    toLocation: 'Bancada de Desmonte / Peças M1',
    note: 'Aprovado em triagem para aguardar tela/SSD ou reaproveitamento de componentes.',
  });

  // Cenário 2: Ciclo completo de recuperação de valor até VENDA
  await equipmentService.changeStatus(almoxActor, eqLenovo.id, {
    status: EquipmentStatus.EM_TRIAGEM,
    note: 'Triagem inicial concluída.',
  });
  await equipmentService.changeStatus(almoxActor, eqLenovo.id, {
    status: EquipmentStatus.EM_REPARO,
    toLocation: 'Laboratório Eletrônico L2',
    note: 'Substituição de bateria e pasta térmica.',
  });
  await equipmentService.changeStatus(almoxActor, eqLenovo.id, {
    status: EquipmentStatus.RECONDICIONADO,
    toLocation: 'Estoque Recondicionados E1',
    note: 'Equipamento certificado com selo GreenCode.',
  });
  await movementService.create(almoxActor, {
    equipmentId: eqLenovo.id,
    lotId: loteBanco.id,
    type: TransactionType.VENDA,
    quantity: 1,
    note: 'Comercializado para parceiro corporativo de revenda sustentável.',
    toStatus: EquipmentStatus.VENDIDO,
    toLocation: 'Expedido - Cliente Secundário',
    financialValue: 2450,
  });

  // Cenário 3: Triagem -> Descarte Ambientalmente Adequado
  await equipmentService.changeStatus(almoxActor, eqHp.id, {
    status: EquipmentStatus.EM_TRIAGEM,
    note: 'Inspeção de placas eletrônicas.',
  });
  await equipmentService.updateCondition(almoxActor, eqHp.id, {
    condition: EquipmentCondition.SUCATA,
    note: 'Curto-circuito irreversível no chipset principal e trilhas rompidas.',
  });
  await equipmentService.changeStatus(almoxActor, eqHp.id, {
    status: EquipmentStatus.DESCARTADO,
    toLocation: 'Contêiner Reciclagem Metais Nobres',
    note: 'Destinado à refinaria homologada para extração de cobre e ouro.',
  });

  // Cenário 4: Triagem -> Recondicionado -> Doação Social
  await equipmentService.changeStatus(almoxActor, eqUps.id, {
    status: EquipmentStatus.EM_TRIAGEM,
    note: 'Teste de carga de baterias.',
  });
  await equipmentService.changeStatus(almoxActor, eqUps.id, {
    status: EquipmentStatus.RECONDICIONADO,
    note: 'Pronto para reuso.',
  });
  await equipmentService.changeStatus(almoxActor, eqUps.id, {
    status: EquipmentStatus.DOADO,
    toLocation: 'Expedido - ONG Inclusão Digital',
    note: 'Doado com emissão de certificado de compensação socioambiental.',
  });

  // Cenário 5: Equipamento da universidade em triagem
  await equipmentService.changeStatus(almoxActor, eqSwitch.id, {
    status: EquipmentStatus.EM_TRIAGEM,
    note: 'Em homologação de portas Gigabit.',
  });

  const integrity = await auditService.verifyIntegrity(auditorActor);

  console.log('✔ Lotes, Equipamentos e Movimentações populados com sucesso');
  console.log(
    `✔ Cadeia de Auditoria verificada: íntegra=${integrity.valid} (${integrity.totalEvents} eventos encadeados)\n`
  );
  console.log('Credenciais disponíveis para autenticação (POST /api/auth/login):');
  console.table([
    { Perfil: 'ADMINISTRADOR', Usuario: 'admin', Senha: 'admin123' },
    { Perfil: 'OPERADOR_CADASTRO', Usuario: 'operador', Senha: 'operador123' },
    { Perfil: 'ALMOXARIFE', Usuario: 'almoxarife', Senha: 'almox123' },
    { Perfil: 'AUDITOR', Usuario: 'auditor', Senha: 'auditor123' },
  ]);
}

main()
  .catch((err) => {
    console.error('Erro ao executar seed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
