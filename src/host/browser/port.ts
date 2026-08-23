import net from "node:net";

export async function allocateRandomPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : null;
      srv.close((err) => {
        if (err) return reject(err);
        if (!port) return reject(new Error("Failed to obtain ephemeral port"));
        resolve(port);
      });
    });
  });
}
