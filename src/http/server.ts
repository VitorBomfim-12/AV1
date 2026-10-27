import { env } from '../config/env';
import { buildApp } from './app';

async function startServer(): Promise<void> {
  const app = await buildApp({ logger: true });
  let shuttingDown = false;

  const gracefulShutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;

    app.log.info(`Sinal ${signal} recebido. Iniciando graceful shutdown...`);
    try {
      await app.close();
      app.log.info('Conexões HTTP e banco de dados encerrados com sucesso.');
      process.exit(0);
    } catch (err) {
      app.log.error(err, 'Erro durante o encerramento do servidor.');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));

  try {
    const address = await app.listen({
      port: env.PORT,
      host: env.HOST,
    });
    app.log.info(`Servidor GreenCode AV2 iniciado em ${address}`);
    app.log.info(`Documentação interativa OpenAPI disponível em ${address}/docs`);
  } catch (err) {
    app.log.error(err, 'Falha ao iniciar o servidor HTTP.');
    process.exit(1);
  }
}

void startServer();
