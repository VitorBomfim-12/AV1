"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Service = void 0;
const store_1 = require("./store");
const model_1 = require("./model");
const security_1 = require("./security");
const errors_1 = require("./errors");
class Service {
    constructor(persistence) {
        this.conditionRank = ['NOVO', 'OTIMO', 'BOM', 'REGULAR', 'RUIM', 'PESSIMO', 'SUCATA'];
        this.persistence = persistence;
        this.db = this.persistence.read('db.json', (0, store_1.initialDatabaseState)());
    }
    saveState(action, data) {
        this.persistence.write('db.json', this.db);
        this.persistence.appendJournal(action, data);
    }
    requireAccess(actorId, action) {
        const user = this.db.users.find(u => u.id === actorId);
        if (!user)
            throw new errors_1.AppError("Usuário não encontrado.");
        if (!user.active)
            throw new errors_1.AppError("Usuário inativo.");
        if (!(0, security_1.can)(user.role, action)) {
            throw new errors_1.AppError("Permissão negada para esta operação.");
        }
        return user;
    }
    login(username, passwordString) {
        const hash = security_1.CryptoService.hashPassword(passwordString);
        const user = this.db.users.find(u => u.username === username && u.passwordHash === hash);
        if (!user)
            throw new errors_1.AppError("Credenciais inválidas.");
        if (!user.active)
            throw new errors_1.AppError("Usuário inativo.");
        return user;
    }
    createUser(actorId, name, username, passwordString, role) {
        this.requireAccess(actorId, "user");
        if (this.db.users.find(u => u.username === username)) {
            throw new errors_1.AppError("Nome de usuário já existe.");
        }
        const hash = security_1.CryptoService.hashPassword(passwordString);
        const user = model_1.EntityFactory.createUser(name, username, hash, role);
        this.db.users.push(user);
        this.saveState('createUser', { id: user.id, username });
        return user;
    }
    createOrganization(actorId, name, cnpj, type, phone, email, address) {
        this.requireAccess(actorId, "org");
        const validator = new model_1.CNPJValidator();
        validator.validate(cnpj);
        if (this.db.organizations.find(o => o.cnpj === cnpj)) {
            throw new errors_1.AppError("Organização com este CNPJ já existe.");
        }
        const org = model_1.EntityFactory.createOrganization(name, cnpj, type, phone, email, address);
        this.db.organizations.push(org);
        this.saveState('createOrganization', { id: org.id, cnpj });
        return org;
    }
    createLot(actorId, code, origin, destination, dateStr = new Date().toISOString(), equipmentIds = []) {
        this.requireAccess(actorId, "lot");
        const dateValidator = new model_1.DateValidator();
        dateValidator.validate(new Date(dateStr));
        const lot = model_1.EntityFactory.createLot(code, origin, destination, actorId, equipmentIds);
        lot.createdAt = dateStr;
        this.db.lots.push(lot);
        this.saveState('createLot', { id: lot.id, code });
        return lot;
    }
    createEquipment(actorId, organizationId, serial, category, brand, model, condition, location, notes) {
        this.requireAccess(actorId, "equipment");
        const org = this.db.organizations.find(o => o.id === organizationId);
        if (!org)
            throw new errors_1.AppError("Organização não encontrada.");
        const eq = model_1.EntityFactory.createEquipment(organizationId, serial, category, brand, model, condition, location, notes);
        this.db.equipment.push(eq);
        this.saveState('createEquipment', { id: eq.id, serial });
        return eq;
    }
    updateEquipmentCondition(actorId, equipmentId, newCondition, note) {
        this.requireAccess(actorId, "equipment");
        const eq = this.db.equipment.find(e => e.id === equipmentId);
        if (!eq)
            throw new errors_1.AppError("Equipamento não encontrado.");
        const oldRank = this.conditionRank.indexOf(eq.condition.toUpperCase());
        const newRank = this.conditionRank.indexOf(newCondition.toUpperCase());
        if (oldRank !== -1 && newRank !== -1) {
            if (newRank - oldRank >= 2 && (!note || note.trim().length === 0)) {
                throw new errors_1.AppError("Justificativa obrigatória para rebaixamento de 2 ou mais categorias de estado.");
            }
        }
        eq.condition = newCondition.toUpperCase();
        const tx = model_1.EntityFactory.createTransaction(eq.id, model_1.TransactionType.TRIAGEM, actorId, note || "Alteração de condição");
        this.db.transactions.push(tx);
        this.saveState('updateEquipmentCondition', { id: eq.id, newCondition });
        return eq;
    }
    changeEquipmentStatus(actorId, equipmentId, newStatus, note = "") {
        this.requireAccess(actorId, "equipment");
        const eq = this.db.equipment.find(e => e.id === equipmentId);
        if (!eq)
            throw new errors_1.AppError("Equipamento não encontrado.");
        if (newStatus === model_1.EquipmentStatus.AGUARDANDO_COMPONENTES && eq.status !== model_1.EquipmentStatus.EM_TRIAGEM) {
            throw new errors_1.AppError("Equipamento só pode ir para desmonte/aguardando componentes após triagem completa.");
        }
        const oldStatus = eq.status;
        eq.status = newStatus;
        const tx = model_1.EntityFactory.createTransaction(eq.id, model_1.TransactionType.TRANSFERENCIA, actorId, note);
        tx.fromStatus = oldStatus;
        tx.toStatus = newStatus;
        this.db.transactions.push(tx);
        this.saveState('changeEquipmentStatus', { id: eq.id, status: newStatus });
    }
    listOrganizations(actorId) {
        this.requireAccess(actorId, "audit");
        return this.db.organizations;
    }
    listEquipments(actorId) {
        this.requireAccess(actorId, "audit");
        return this.db.equipment;
    }
    getEquipmentHistory(actorId, equipmentId) {
        this.requireAccess(actorId, "audit");
        return this.db.transactions.filter(t => t.equipmentId === equipmentId);
    }
}
exports.Service = Service;
