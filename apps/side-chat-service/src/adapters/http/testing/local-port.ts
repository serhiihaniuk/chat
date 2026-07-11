import { createConnection, createServer } from "node:net";

export function availableLocalPort(): Promise<number> {
  return new Promise<number>((resolvePort, rejectPort) => {
    const server = createServer();
    server.once("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        rejectPort(new Error("Failed to allocate a service port"));
        return;
      }
      server.close(() => resolvePort(address.port));
    });
  });
}

export function localPortAcceptsConnections(port: number): Promise<boolean> {
  return new Promise((resolveConnection) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolveConnection(true);
    });
    socket.once("error", () => resolveConnection(false));
  });
}
