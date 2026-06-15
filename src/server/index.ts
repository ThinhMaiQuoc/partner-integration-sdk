import { createServer } from "node:http";
import { createServerApp } from "./app";
import { loadServerConfig } from "./config";

const config = loadServerConfig();
const app = createServerApp({ config });
const server = createServer(app);

server.listen(config.port, config.host, () => {
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : config.port;
  const publicHost = config.host === "0.0.0.0" ? "localhost" : config.host;
  const baseUrl = `http://${publicHost}:${port}`;

  console.log(`Mock API server listening on ${baseUrl}`);
  console.log(`Health check available at ${baseUrl}/health`);
});

function shutdown(signal: NodeJS.Signals): void {
  console.log(`Received ${signal}; shutting down mock API server.`);
  server.close(() => {
    process.exit(0);
  });

  setTimeout(() => {
    process.exit(1);
  }, 5000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
