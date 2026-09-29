import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import * as fs from 'fs';
import * as path from 'path';
import { CryptoService } from './security';
import { PersistenceService } from './store';
import { Service } from './service';
import { Role, EquipmentStatus } from './model';
import { AppError } from './errors';

const CONFIG_PATH = path.join(__dirname, '../config.json');
const DATA_DIR = path.join(__dirname, '../data');

const rl = createInterface({ input, output });
let app: Service;
let idleTimer: NodeJS.Timeout | undefined;

const ask = (label: string) => {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    console.log("\nSessão encerrada após 30 minutos sem atividade.");
    rl.close();
    process.exit(0);
  }, 30 * 60_000);
  return rl.question(`${label}: `);
};

const password = async (label: string) => ask(label);

async function boot() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      console.log("=== PROVISIONAMENTO INICIAL ===");
      console.log("Nenhum arquivo de configuração encontrado.");
      const masterKey = CryptoService.generateMasterKey();
      console.log("Chave mestre gerada com sucesso.");
      
      const adminName = await ask("Nome do administrador");
      const adminUser = await ask("Usuário");
      const adminPass = await password("Senha");

      fs.writeFileSync(CONFIG_PATH, JSON.stringify({ masterKey }, null, 2));

      const persistence = new PersistenceService(DATA_DIR, masterKey);
      app = new Service(persistence);
      
      const tempId = "provision";
      (app as any).db.users.push({ id: tempId, username: "temp", role: Role.ADMINISTRADOR, active: true });
      app.createUser(tempId, adminName, adminUser, adminPass, Role.ADMINISTRADOR);
      (app as any).db.users = (app as any).db.users.filter((u: any) => u.id !== tempId);

      console.log("Administrador criado.");
    }

    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    const persistence = new PersistenceService(DATA_DIR, config.masterKey);
    app = new Service(persistence);

    const user = app.login(await ask("Usuário"), await password("Senha"));
    console.log(`\nOlá, ${user.name} (${user.role}).`);
    
    let running = true;
    while (running) {
      const options = [
        { id: "1", label: "Listar organizações", roles: [Role.ADMINISTRADOR, Role.OPERADOR_CADASTRO, Role.AUDITOR] },
        { id: "2", label: "Cadastrar organização", roles: [Role.ADMINISTRADOR, Role.OPERADOR_CADASTRO] },
        { id: "3", label: "Cadastrar equipamento", roles: [Role.ADMINISTRADOR, Role.ALMOXARIFE] },
        { id: "4", label: "Atualizar equipamento (Condição/Status)", roles: [Role.ADMINISTRADOR, Role.ALMOXARIFE] },
        { id: "5", label: "Criar lote", roles: [Role.ADMINISTRADOR, Role.ALMOXARIFE] },
        { id: "6", label: "Listar equipamentos", roles: [Role.ADMINISTRADOR, Role.ALMOXARIFE, Role.AUDITOR] },
        { id: "7", label: "Histórico de equipamento (Rastreabilidade)", roles: [Role.ADMINISTRADOR, Role.AUDITOR] },
        { id: "8", label: "Criar usuário", roles: [Role.ADMINISTRADOR] },
        { id: "0", label: "Sair", roles: [Role.ADMINISTRADOR, Role.OPERADOR_CADASTRO, Role.ALMOXARIFE, Role.AUDITOR] }
      ];

      const allowedOptions = options.filter(opt => opt.roles.includes(user.role as Role));
      
      const menuText = allowedOptions.map(opt => `${opt.id}. ${opt.label}`).join('  ');
      console.log(`\n${menuText}`);
      
      const choice = await ask("Opção");
      
      if (!allowedOptions.find(o => o.id === choice)) {
        console.log("Opção inválida ou acesso negado.");
        continue;
      }

      try {
        switch (choice) {
          case "1": {
            const orgs = app.listOrganizations(user.id);
            console.table(orgs.map(o => ({ ID: o.id, Nome: o.name, CNPJ: o.cnpj })));
            break;
          }
          case "2": {
            const org = app.createOrganization(
              user.id,
              await ask("Nome"),
              await ask("CNPJ"),
              await ask("Tipo"),
              await ask("Telefone"),
              await ask("E-mail"),
              await ask("Endereço")
            );
            console.log(`Organização cadastrada: ${org.id}`);
            break;
          }
          case "3": {
            const e = app.createEquipment(
              user.id,
              await ask("ID da organização"),
              await ask("Número de série"),
              await ask("Categoria"),
              await ask("Marca"),
              await ask("Modelo"),
              await ask("Condição (NOVO, OTIMO, BOM, REGULAR, RUIM, PESSIMO, SUCATA)"),
              await ask("Localização"),
              await ask("Observações")
            );
            console.log(`Equipamento cadastrado: ${e.id}`);
            break;
          }
          case "4": {
            const equipId = await ask("ID do equipamento");
            const opt = await ask("O que deseja atualizar? (1 - Condição Física, 2 - Status de Logística)");
            if (opt === "1") {
               app.updateEquipmentCondition(
                 user.id,
                 equipId,
                 await ask("Nova Condição (NOVO, OTIMO, BOM, REGULAR, RUIM, PESSIMO, SUCATA)"),
                 await ask("Justificativa (obrigatória se cair 2 categorias)")
               );
               console.log("Condição atualizada.");
            } else if (opt === "2") {
               const status = await ask("Novo status (" + Object.values(EquipmentStatus).join(", ") + ")");
               app.changeEquipmentStatus(
                 user.id,
                 equipId,
                 status as EquipmentStatus,
                 await ask("Observação")
               );
               console.log("Status atualizado.");
            } else {
               console.log("Opção inválida.");
            }
            break;
          }
          case "5": {
            const code = await ask("Código do lote");
            const origin = await ask("Origem");
            const dest = await ask("Destino");
            const idsStr = await ask("IDs dos equipamentos (separados por vírgula)");
            const ids = idsStr.split(',').map(i => i.trim()).filter(Boolean);
            
            const lot = app.createLot(user.id, code, origin, dest, new Date().toISOString(), ids);
            console.log(`Lote criado: ${lot.id}`);
            break;
          }
          case "6": {
            const eqs = app.listEquipments(user.id);
            console.table(eqs.map(e => ({ ID: e.id, Serial: e.serial, Status: e.status, Cond: e.condition })));
            break;
          }
          case "7": {
            const hist = app.getEquipmentHistory(user.id, await ask("ID do equipamento"));
            console.table(hist.map(h => ({ Data: h.createdAt, Tipo: h.type, De: h.fromStatus, Para: h.toStatus, Nota: h.note })));
            break;
          }
          case "8": {
            console.log("Perfis disponíveis:");
            console.log("1 - ADMINISTRADOR");
            console.log("2 - OPERADOR_CADASTRO");
            console.log("3 - ALMOXARIFE");
            console.log("4 - AUDITOR");
            let roleInput = await ask("Escolha o perfil (1 a 4)");
            let role: Role;
            
            if (roleInput === "1" || roleInput.toUpperCase() === "ADMINISTRADOR") role = Role.ADMINISTRADOR;
            else if (roleInput === "2" || roleInput.toUpperCase() === "OPERADOR_CADASTRO") role = Role.OPERADOR_CADASTRO;
            else if (roleInput === "3" || roleInput.toUpperCase() === "ALMOXARIFE") role = Role.ALMOXARIFE;
            else if (roleInput === "4" || roleInput.toUpperCase() === "AUDITOR") role = Role.AUDITOR;
            else {
              console.log("Perfil inválido. Operação cancelada.");
              break;
            }

            const created = app.createUser(
              user.id,
              await ask("Nome"),
              await ask("Usuário"),
              await password("Senha"),
              role
            );
            console.log(`Usuário criado: ${created.username}`);
            break;
          }
          case "0":
            running = false;
            break;
        }
      } catch (error: any) {
        console.log(`Erro: ${error.message}`);
      }
    }
  } catch (error: any) {
    console.error(
      `${error instanceof AppError ? "Erro de Negócio" : "Falha"}: ${error.message}`
    );
    process.exitCode = 1;
  } finally {
    if (idleTimer) clearTimeout(idleTimer);
    rl.close();
  }
}

void boot();
