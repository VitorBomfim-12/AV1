import { PersistenceService } from '../src/store';
import { Service } from '../src/service';
import { CryptoService } from '../src/security';
import { Role, EquipmentStatus } from '../src/model';
import * as fs from 'fs';
import * as path from 'path';

const TEST_DIR = path.join(__dirname, '../data_test');
if (fs.existsSync(TEST_DIR)) {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
}

console.log("=== SIMULAÇÃO DA JORNADA COMPLETA ===");

const masterKey = CryptoService.generateMasterKey();
const persistence = new PersistenceService(TEST_DIR, masterKey);
const service = new Service(persistence);

console.log("1. Provisionamento e Login do Admin");
const tempId = "provision";
(service as any).db.users.push({ id: tempId, username: "temp", role: Role.ADMINISTRADOR, active: true });
service.createUser(tempId, "Admin", "admin", "1234", Role.ADMINISTRADOR);

const admin = service.login("admin", "1234");
console.log("Login feito com sucesso:", admin.name);

console.log("\n2. Criação de Organização");
const org = service.createOrganization(admin.id, "Empresa A", "27212684000141", "Tipo", "111", "email@email.com", "Rua X");
console.log("Org criada:", org.id);

console.log("\n3. Criação de Operador, Almoxarife e Auditor");
service.createUser(admin.id, "Operador 1", "operador1", "1234", Role.OPERADOR_CADASTRO);
service.createUser(admin.id, "Almoxarife 1", "almox1", "1234", Role.ALMOXARIFE);
service.createUser(admin.id, "Auditor 1", "auditor1", "1234", Role.AUDITOR);

console.log("\n4. Login como Almoxarife e criação de Lote e Equipamento");
const almox = service.login("almox1", "1234");

const lote = service.createLot(almox.id, "LOTE-001", "Matriz", "Filial", new Date().toISOString(), []);
console.log("Lote criado:", lote.id);

const equip = service.createEquipment(almox.id, org.id, "SN-12345", "Notebook", "Dell", "XPS", "OTIMO", "Prateleira A", "Sem fonte");
console.log("Equipamento criado:", equip.id);

console.log("\n5. Mudança de Estado Físico e Triagem");
service.updateEquipmentCondition(almox.id, equip.id, "RUIM", "Caiu no chão durante transporte");
service.changeEquipmentStatus(almox.id, equip.id, EquipmentStatus.EM_TRIAGEM, "Iniciando triagem");

console.log("\n6. Movimentação para Desmonte");
service.changeEquipmentStatus(almox.id, equip.id, EquipmentStatus.AGUARDANDO_COMPONENTES, "Faltando HD");

console.log("\n7. Login como Auditor e Consulta de Rastreabilidade");
const auditor = service.login("auditor1", "1234");

const historico = service.getEquipmentHistory(auditor.id, equip.id);
console.log(`Histórico do equipamento ${equip.serial}:`);
historico.forEach(tx => {
  console.log(` - [${tx.createdAt}] Tipo: ${tx.type}, Nota: ${tx.note}, Status Origem/Dest: ${tx.fromStatus || ''} -> ${tx.toStatus || ''}`);
});

console.log("\n=== SIMULAÇÃO CONCLUÍDA ===");
