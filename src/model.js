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
exports.EntityFactory = exports.AuditEvent = exports.Transaction = exports.Lot = exports.Equipment = exports.Organization = exports.User = exports.Entity = exports.DateValidator = exports.CNPJValidator = exports.Validator = exports.TransactionType = exports.EquipmentStatus = exports.Role = void 0;
const crypto = __importStar(require("crypto"));
const errors_1 = require("./errors");
var Role;
(function (Role) {
    Role["ADMINISTRADOR"] = "ADMINISTRADOR";
    Role["OPERADOR_CADASTRO"] = "OPERADOR_CADASTRO";
    Role["ALMOXARIFE"] = "ALMOXARIFE";
    Role["AUDITOR"] = "AUDITOR";
})(Role || (exports.Role = Role = {}));
var EquipmentStatus;
(function (EquipmentStatus) {
    EquipmentStatus["RECEBIDO"] = "RECEBIDO";
    EquipmentStatus["EM_TRIAGEM"] = "EM_TRIAGEM";
    EquipmentStatus["AGUARDANDO_COMPONENTES"] = "AGUARDANDO_COMPONENTES";
    EquipmentStatus["EM_REPARO"] = "EM_REPARO";
    EquipmentStatus["RECONDICIONADO"] = "RECONDICIONADO";
    EquipmentStatus["DESCARTADO"] = "DESCARTADO";
    EquipmentStatus["DOADO"] = "DOADO";
    EquipmentStatus["VENDIDO"] = "VENDIDO";
})(EquipmentStatus || (exports.EquipmentStatus = EquipmentStatus = {}));
var TransactionType;
(function (TransactionType) {
    TransactionType["RECEBIMENTO"] = "RECEBIMENTO";
    TransactionType["TRIAGEM"] = "TRIAGEM";
    TransactionType["TRANSFERENCIA"] = "TRANSFERENCIA";
    TransactionType["REPARO"] = "REPARO";
    TransactionType["RECONDICIONAMENTO"] = "RECONDICIONAMENTO";
    TransactionType["DESCARTE"] = "DESCARTE";
    TransactionType["DOACAO"] = "DOACAO";
    TransactionType["VENDA"] = "VENDA";
    TransactionType["AJUSTE_ESTOQUE"] = "AJUSTE_ESTOQUE";
})(TransactionType || (exports.TransactionType = TransactionType = {}));
class Validator {
}
exports.Validator = Validator;
class CNPJValidator extends Validator {
    validate(cnpj) {
        const cleaned = cnpj.replace(/\D/g, '');
        if (cleaned.length !== 14) {
            throw new errors_1.AppError("CNPJ inválido: deve conter 14 dígitos.");
        }
        if (/^(\d)\1+$/.test(cleaned)) {
            throw new errors_1.AppError("CNPJ inválido: números repetidos.");
        }
        let length = cleaned.length - 2;
        let numbers = cleaned.substring(0, length);
        const digits = cleaned.substring(length);
        let sum = 0;
        let pos = length - 7;
        for (let i = length; i >= 1; i--) {
            sum += parseInt(numbers.charAt(length - i)) * pos--;
            if (pos < 2)
                pos = 9;
        }
        let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
        if (result !== parseInt(digits.charAt(0))) {
            throw new errors_1.AppError("CNPJ inválido: falha no 1º dígito verificador.");
        }
        length = length + 1;
        numbers = cleaned.substring(0, length);
        sum = 0;
        pos = length - 7;
        for (let i = length; i >= 1; i--) {
            sum += parseInt(numbers.charAt(length - i)) * pos--;
            if (pos < 2)
                pos = 9;
        }
        result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
        if (result !== parseInt(digits.charAt(1))) {
            throw new errors_1.AppError("CNPJ inválido: falha no 2º dígito verificador.");
        }
    }
}
exports.CNPJValidator = CNPJValidator;
class DateValidator extends Validator {
    validate(date) {
        const now = new Date();
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(now.getDate() - 90);
        if (date > now) {
            throw new errors_1.AppError("Data inválida: data não pode ser futura.");
        }
        if (date < ninetyDaysAgo) {
            throw new errors_1.AppError("Data inválida: data não pode ser anterior a 90 dias.");
        }
    }
}
exports.DateValidator = DateValidator;
class Entity {
    constructor(id, createdAt = new Date().toISOString()) {
        this.id = id;
        this.createdAt = createdAt;
    }
}
exports.Entity = Entity;
class User extends Entity {
    constructor(id, name, username, passwordHash, role, active = true, createdAt) {
        super(id, createdAt);
        this.name = name;
        this.username = username;
        this.passwordHash = passwordHash;
        this.role = role;
        this.active = active;
    }
}
exports.User = User;
class Organization extends Entity {
    constructor(id, name, cnpj, type, phone, email, address, active = true, createdAt) {
        super(id, createdAt);
        this.name = name;
        this.cnpj = cnpj;
        this.type = type;
        this.phone = phone;
        this.email = email;
        this.address = address;
        this.active = active;
    }
}
exports.Organization = Organization;
class Equipment extends Entity {
    constructor(id, organizationId, serial, category, brand, model, condition, status, location, receivedAt, notes, createdAt) {
        super(id, createdAt);
        this.organizationId = organizationId;
        this.serial = serial;
        this.category = category;
        this.brand = brand;
        this.model = model;
        this.condition = condition;
        this.status = status;
        this.location = location;
        this.receivedAt = receivedAt;
        this.notes = notes;
    }
}
exports.Equipment = Equipment;
class Lot extends Entity {
    constructor(id, code, equipmentIds, origin, destination, createdBy, status = "ABERTO", createdAt) {
        super(id, createdAt);
        this.code = code;
        this.equipmentIds = equipmentIds;
        this.origin = origin;
        this.destination = destination;
        this.createdBy = createdBy;
        this.status = status;
    }
}
exports.Lot = Lot;
class Transaction extends Entity {
    constructor(id, equipmentId, type, quantity, note, actorId, lotId, fromStatus, toStatus, fromLocation, toLocation, createdAt) {
        super(id, createdAt);
        this.equipmentId = equipmentId;
        this.type = type;
        this.quantity = quantity;
        this.note = note;
        this.actorId = actorId;
        this.lotId = lotId;
        this.fromStatus = fromStatus;
        this.toStatus = toStatus;
        this.fromLocation = fromLocation;
        this.toLocation = toLocation;
    }
}
exports.Transaction = Transaction;
class AuditEvent extends Entity {
    constructor(id, actorId, action, entityName, entityId, details, previousHash, hash, createdAt) {
        super(id, createdAt);
        this.actorId = actorId;
        this.action = action;
        this.entityName = entityName;
        this.entityId = entityId;
        this.details = details;
        this.previousHash = previousHash;
        this.hash = hash;
    }
}
exports.AuditEvent = AuditEvent;
class EntityFactory {
    static generateId() {
        return crypto.randomUUID();
    }
    static createUser(name, username, passwordHash, role) {
        return new User(this.generateId(), name, username, passwordHash, role);
    }
    static createOrganization(name, cnpj, type, phone, email, address) {
        return new Organization(this.generateId(), name, cnpj, type, phone, email, address);
    }
    static createEquipment(organizationId, serial, category, brand, model, condition, location, notes) {
        return new Equipment(this.generateId(), organizationId, serial, category, brand, model, condition, EquipmentStatus.RECEBIDO, location, new Date().toISOString(), notes);
    }
    static createLot(code, origin, destination, createdBy, equipmentIds = []) {
        return new Lot(this.generateId(), code, equipmentIds, origin, destination, createdBy);
    }
    static createTransaction(equipmentId, type, actorId, note, quantity = 1) {
        return new Transaction(this.generateId(), equipmentId, type, quantity, note, actorId);
    }
    static createAuditEvent(actorId, action, entityName, entityId, details, previousHash, hash) {
        return new AuditEvent(this.generateId(), actorId, action, entityName, entityId, details, previousHash, hash);
    }
}
exports.EntityFactory = EntityFactory;
