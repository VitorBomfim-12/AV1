import { DatabaseState, initialDatabaseState, PersistenceService } from './store';
import { User, Organization, Equipment, Lot, Transaction, Role, EntityFactory, CNPJValidator, DateValidator, EquipmentStatus, TransactionType } from './model';
import { CryptoService, can } from './security';
import { AppError } from './errors';

export class Service {
  private db: DatabaseState;
  private persistence: PersistenceService;
  private conditionRank = ['NOVO', 'OTIMO', 'BOM', 'REGULAR', 'RUIM', 'PESSIMO', 'SUCATA'];

  constructor(persistence: PersistenceService) {
    this.persistence = persistence;
    this.db = this.persistence.read<DatabaseState>('db.json', initialDatabaseState());
  }

  private saveState(action: string, data: any) {
    this.persistence.write('db.json', this.db);
    this.persistence.appendJournal(action, data);
  }

  private requireAccess(actorId: string, action: "user" | "org" | "equipment" | "lot" | "audit"): User {
    const user = this.db.users.find(u => u.id === actorId);
    if (!user) throw new AppError("Usuário não encontrado.");
    if (!user.active) throw new AppError("Usuário inativo.");
    if (!can(user.role, action)) {
      throw new AppError("Permissão negada para esta operação.");
    }
    return user;
  }

  login(username: string, passwordString: string): User {
    const hash = CryptoService.hashPassword(passwordString);
    const user = this.db.users.find(u => u.username === username && u.passwordHash === hash);
    if (!user) throw new AppError("Credenciais inválidas.");
    if (!user.active) throw new AppError("Usuário inativo.");
    return user;
  }

  createUser(actorId: string, name: string, username: string, passwordString: string, role: Role): User {
    this.requireAccess(actorId, "user");
    if (this.db.users.find(u => u.username === username)) {
      throw new AppError("Nome de usuário já existe.");
    }
    const hash = CryptoService.hashPassword(passwordString);
    const user = EntityFactory.createUser(name, username, hash, role);
    this.db.users.push(user);
    this.saveState('createUser', { id: user.id, username });
    return user;
  }

  createOrganization(actorId: string, name: string, cnpj: string, type: string, phone: string, email: string, address: string): Organization {
    this.requireAccess(actorId, "org");
    
    const validator = new CNPJValidator();
    validator.validate(cnpj);

    if (this.db.organizations.find(o => o.cnpj === cnpj)) {
      throw new AppError("Organização com este CNPJ já existe.");
    }

    const org = EntityFactory.createOrganization(name, cnpj, type, phone, email, address);
    this.db.organizations.push(org);
    this.saveState('createOrganization', { id: org.id, cnpj });
    return org;
  }

  createLot(actorId: string, code: string, origin: string, destination: string, dateStr: string = new Date().toISOString(), equipmentIds: string[] = []): Lot {
    this.requireAccess(actorId, "lot");
    
    const dateValidator = new DateValidator();
    dateValidator.validate(new Date(dateStr));

    const lot = EntityFactory.createLot(code, origin, destination, actorId, equipmentIds);
    lot.createdAt = dateStr;
    this.db.lots.push(lot);
    this.saveState('createLot', { id: lot.id, code });
    return lot;
  }

  createEquipment(actorId: string, organizationId: string, serial: string, category: string, brand: string, model: string, condition: string, location: string, notes: string): Equipment {
    this.requireAccess(actorId, "equipment");
    
    const org = this.db.organizations.find(o => o.id === organizationId);
    if (!org) throw new AppError("Organização não encontrada.");

    const eq = EntityFactory.createEquipment(organizationId, serial, category, brand, model, condition, location, notes);
    this.db.equipment.push(eq);
    this.saveState('createEquipment', { id: eq.id, serial });
    return eq;
  }

  updateEquipmentCondition(actorId: string, equipmentId: string, newCondition: string, note: string) {
    this.requireAccess(actorId, "equipment");
    
    const eq = this.db.equipment.find(e => e.id === equipmentId);
    if (!eq) throw new AppError("Equipamento não encontrado.");

    const oldRank = this.conditionRank.indexOf(eq.condition.toUpperCase());
    const newRank = this.conditionRank.indexOf(newCondition.toUpperCase());

    if (oldRank !== -1 && newRank !== -1) {
      if (newRank - oldRank >= 2 && (!note || note.trim().length === 0)) {
        throw new AppError("Justificativa obrigatória para rebaixamento de 2 ou mais categorias de estado.");
      }
    }

    eq.condition = newCondition.toUpperCase();
    
    const tx = EntityFactory.createTransaction(eq.id, TransactionType.TRIAGEM, actorId, note || "Alteração de condição");
    this.db.transactions.push(tx);
    
    this.saveState('updateEquipmentCondition', { id: eq.id, newCondition });
    return eq;
  }

  changeEquipmentStatus(actorId: string, equipmentId: string, newStatus: EquipmentStatus, note: string = "") {
    this.requireAccess(actorId, "equipment");
    const eq = this.db.equipment.find(e => e.id === equipmentId);
    if (!eq) throw new AppError("Equipamento não encontrado.");

    if (newStatus === EquipmentStatus.AGUARDANDO_COMPONENTES && eq.status !== EquipmentStatus.EM_TRIAGEM) {
        throw new AppError("Equipamento só pode ir para desmonte/aguardando componentes após triagem completa.");
    }

    const oldStatus = eq.status;
    eq.status = newStatus;

    const tx = EntityFactory.createTransaction(eq.id, TransactionType.TRANSFERENCIA, actorId, note);
    tx.fromStatus = oldStatus;
    tx.toStatus = newStatus;
    this.db.transactions.push(tx);

    this.saveState('changeEquipmentStatus', { id: eq.id, status: newStatus });
  }

  listOrganizations(actorId: string): Organization[] {
    this.requireAccess(actorId, "audit");
    return this.db.organizations;
  }

  listEquipments(actorId: string): Equipment[] {
    this.requireAccess(actorId, "audit");
    return this.db.equipment;
  }

  getEquipmentHistory(actorId: string, equipmentId: string): Transaction[] {
    this.requireAccess(actorId, "audit");
    return this.db.transactions.filter(t => t.equipmentId === equipmentId);
  }
}
