"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const store_1 = require("../src/store");
const service_1 = require("../src/service");
const security_1 = require("../src/security");
const model_1 = require("../src/model");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const TEST_DIR = path.join(__dirname, '../data_test');
if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
}
console.log("=== SIMULAÇÃO DA JORNADA COMPLETA ===");
const masterKey = security_1.CryptoService.generateMasterKey();
const persistence = new store_1.PersistenceService(TEST_DIR, masterKey);
const service = new service_1.Service(persistence);
console.log("1. Provisionamento e Login do Admin");
const tempId = "provision";
service.db.users.push({ id: tempId, username: "temp", role: model_1.Role.ADMINISTRADOR, active: true });
service.createUser(tempId, "Admin", "admin", "1234", model_1.Role.ADMINISTRADOR);
const admin = service.login("admin", "1234");
console.log("Login feito com sucesso:", admin.name);
console.log("\n2. Criação de Organização");
const org = service.createOrganization(admin.id, "Empresa A", "27212684000141", "Tipo", "111", "email@email.com", "Rua X");
console.log("Org criada:", org.id);
console.log("\n3. Criação de Operador, Almoxarife e Auditor");
service.createUser(admin.id, "Operador 1", "operador1", "1234", model_1.Role.OPERADOR_CADASTRO);
service.createUser(admin.id, "Almoxarife 1", "almox1", "1234", model_1.Role.ALMOXARIFE);
service.createUser(admin.id, "Auditor 1", "auditor1", "1234", model_1.Role.AUDITOR);
console.log("\n4. Login como Almoxarife e criação de Lote e Equipamento");
const almox = service.login("almox1", "1234");
const lote = service.createLot(almox.id, "LOTE-001", "Matriz", "Filial", new Date().toISOString(), []);
console.log("Lote criado:", lote.id);
const equip = service.createEquipment(almox.id, org.id, "SN-12345", "Notebook", "Dell", "XPS", "OTIMO", "Prateleira A", "Sem fonte");
console.log("Equipamento criado:", equip.id);
console.log("\n5. Mudança de Estado Físico e Triagem");
service.updateEquipmentCondition(almox.id, equip.id, "RUIM", "Caiu no chão durante transporte");
service.changeEquipmentStatus(almox.id, equip.id, model_1.EquipmentStatus.EM_TRIAGEM, "Iniciando triagem");
console.log("\n6. Movimentação para Desmonte");
service.changeEquipmentStatus(almox.id, equip.id, model_1.EquipmentStatus.AGUARDANDO_COMPONENTES, "Faltando HD");
console.log("\n7. Login como Auditor e Consulta de Rastreabilidade");
const auditor = service.login("auditor1", "1234");
const historico = service.getEquipmentHistory(auditor.id, equip.id);
console.log(`Histórico do equipamento ${equip.serial}:`);
historico.forEach(tx => {
    console.log(` - [${tx.createdAt}] Tipo: ${tx.type}, Nota: ${tx.note}, Status Origem/Dest: ${tx.fromStatus || ''} -> ${tx.toStatus || ''}`);
});
console.log("\n=== SIMULAÇÃO CONCLUÍDA ===");
