# AV1


## Requisitos e Ambiente

O projeto foi construído e validado nas seguintes versões:
- Node.js (v24.19.0)
- NPM (11.17.0)
- TypeScript (v5.9.3)

## Como instalar e rodar

1. **Baixe as dependências e compile o código:**
   No terminal da pasta do projeto, rode:
   npm install
   npm run build


2. **Inicie o sistema:**

   npm start

## Primeiro acesso

Na primeira vez que você rodar o sistema, ele não vai encontrar o arquivo de configuração ou a base de dados (`data/db.json`). Por causa disso, ele vai iniciar o provisionamento automático e pedir para você cadastrar um Administrador (nome, usuário e senha).

Logo depois de criar, ele vai pedir o login. Basta entrar com os dados que você acabou de cadastrar.

## Fluxo básico (Testando na mão)

Ao logar como administrador, você tem acesso a todas as opções do menu. Um fluxo básico para validar o trabalho seria:

1. Digitar a opção para cadastrar organização (informe um CNPJ válido).
2. Cadastrar um equipamento informando o ID da organização criada.
3. Modificar o estado ou status logístico do equipamento.
4. Puxar o histórico (rastreabilidade) informando o ID do equipamento para ver todas as alterações registradas.

*Obs: A sessão cai automaticamente depois de 30 minutos de inatividade.*

## Simulação automatizada

Deixei pronto um script que roda o ciclo completo de uma vez só pra facilitar a correção. Se quiser ver tudo rodando sozinho sem precisar usar o menu, é só rodar:

```bash
npm test
```

Esse comando aciona o arquivo `simulate.js`. Ele já cria os usuários com perfis diferentes (Operador, Almoxarife, Auditor), gera as movimentações no sistema e por fim imprime a tabela de rastreabilidade.

