import { readFileSync } from "node:fs";
import net, { type Socket } from "node:net";
import tls, { type TLSSocket } from "node:tls";
import {
  ingestTeltonikaPacket,
  resolveTrackerGatewayBinding,
} from "../../src/lib/novacore/tracker-gateway-service";
import {
  parseTeltonikaImeiHandshake,
  teltonikaImeiResponse,
} from "../../src/lib/novacore/teltonika-codec8e";

const MAX_PACKET_DATA_BYTES = 256 * 1024;
const MAX_BUFFER_BYTES = MAX_PACKET_DATA_BYTES * 2;
const IDLE_TIMEOUT_MS = 3 * 60 * 1000;

type GatewaySocket = Socket | TLSSocket;

function portFromEnv() {
  const value = Number(process.env.TRACKER_GATEWAY_PORT ?? 5027);
  if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error("TRACKER_GATEWAY_PORT must be a valid TCP port.");
  return value;
}

function closeSilently(socket: GatewaySocket) {
  if (!socket.destroyed) socket.destroy();
}

function attachConnection(socket: GatewaySocket) {
  let buffer = Buffer.alloc(0);
  let imei: string | null = null;
  let processing = false;
  let closed = false;

  socket.setNoDelay(true);
  socket.setKeepAlive(true, 30_000);
  socket.setTimeout(IDLE_TIMEOUT_MS, () => closeSilently(socket));

  const processBuffer = async () => {
    if (processing || closed || socket.destroyed) return;
    processing = true;
    socket.pause();
    try {
      while (!closed && !socket.destroyed) {
        if (!imei) {
          if (buffer.length < 2) break;
          const imeiLength = buffer.readUInt16BE(0);
          if (imeiLength < 14 || imeiLength > 20) throw new Error("Rejected invalid IMEI frame length.");
          const frameLength = imeiLength + 2;
          if (buffer.length < frameLength) break;
          const frame = buffer.subarray(0, frameLength);
          buffer = buffer.subarray(frameLength);
          const candidate = parseTeltonikaImeiHandshake(frame);
          const binding = await resolveTrackerGatewayBinding(candidate);
          if (!binding) {
            socket.write(teltonikaImeiResponse(false));
            socket.end();
            closed = true;
            return;
          }
          imei = candidate;
          socket.write(teltonikaImeiResponse(true));
          continue;
        }

        if (buffer.length < 8) break;
        if (buffer.readUInt32BE(0) !== 0) throw new Error("Rejected invalid Teltonika packet preamble.");
        const dataLength = buffer.readUInt32BE(4);
        if (dataLength < 3 || dataLength > MAX_PACKET_DATA_BYTES) throw new Error("Rejected invalid Teltonika packet size.");
        const packetLength = 8 + dataLength + 4;
        if (buffer.length < packetLength) break;
        const packet = Buffer.from(buffer.subarray(0, packetLength));
        buffer = buffer.subarray(packetLength);

        // ACK only after the packet has been decoded and durably handled inside the tenant transaction.
        // If ingestion throws, the connection is closed without an ACK so the tracker can retry its records.
        const result = await ingestTeltonikaPacket(imei, packet);
        socket.write(result.acknowledgement);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tracker gateway protocol failure.";
      console.error(`[tracker-gateway] connection rejected: ${message}`);
      closeSilently(socket);
      closed = true;
    } finally {
      processing = false;
      if (!closed && !socket.destroyed) {
        socket.resume();
        if (buffer.length > 0) queueMicrotask(() => void processBuffer());
      }
    }
  };

  socket.on("data", (chunk: Buffer) => {
    if (closed) return;
    if (buffer.length + chunk.length > MAX_BUFFER_BYTES) {
      console.error("[tracker-gateway] connection rejected: receive buffer exceeded the safety limit.");
      closeSilently(socket);
      closed = true;
      return;
    }
    buffer = Buffer.concat([buffer, chunk]);
    void processBuffer();
  });
  socket.on("error", () => { closed = true; });
  socket.on("close", () => { closed = true; buffer = Buffer.alloc(0); imei = null; });
}

function createGatewayServer() {
  const certFile = process.env.TRACKER_GATEWAY_TLS_CERT_FILE?.trim();
  const keyFile = process.env.TRACKER_GATEWAY_TLS_KEY_FILE?.trim();
  const allowPlaintext = process.env.TRACKER_GATEWAY_ALLOW_PLAINTEXT === "true";

  if (certFile || keyFile) {
    if (!certFile || !keyFile) throw new Error("Both TRACKER_GATEWAY_TLS_CERT_FILE and TRACKER_GATEWAY_TLS_KEY_FILE are required.");
    return tls.createServer({
      cert: readFileSync(certFile),
      key: readFileSync(keyFile),
      minVersion: "TLSv1.2",
      requestCert: false,
    }, attachConnection);
  }

  if (!allowPlaintext) {
    throw new Error("Tracker Gateway refuses plaintext TCP. Configure TLS certificate/key files or explicitly set TRACKER_GATEWAY_ALLOW_PLAINTEXT=true for an isolated development test.");
  }
  return net.createServer(attachConnection);
}

const host = process.env.TRACKER_GATEWAY_HOST?.trim() || "0.0.0.0";
const port = portFromEnv();
const server = createGatewayServer();

server.on("error", (error) => {
  console.error(`[tracker-gateway] fatal server error: ${error.message}`);
  process.exitCode = 1;
});
server.listen(port, host, () => {
  const tlsEnabled = Boolean(process.env.TRACKER_GATEWAY_TLS_CERT_FILE && process.env.TRACKER_GATEWAY_TLS_KEY_FILE);
  console.log(`[tracker-gateway] listening on ${host}:${port} (${tlsEnabled ? "TLS" : "development plaintext"})`);
});

async function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
