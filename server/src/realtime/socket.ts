import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { getRole } from "../permissions/getRole.js";
import {
  MAX_HTTP_BUFFER_SIZE,
  registerHandlers,
  type HandlerDeps,
} from "./handlers.js";
import { authenticate, isAllowedOrigin } from "./handshake.js";
import { appendUpdate } from "./persistence.js";
import { registry } from "./registry.js";

export function createSocketServer(
  httpServer: HttpServer,
  overrides: Partial<HandlerDeps> = {},
) {
  const deps: HandlerDeps = { registry, appendUpdate, getRole, ...overrides };

  const io = new Server(httpServer, {
    maxHttpBufferSize: MAX_HTTP_BUFFER_SIZE,
    allowRequest: (req, callback) => callback(null, isAllowedOrigin(req)),
  });
  io.use(authenticate);
  io.on("connection", (socket) => {
    console.log("a user connected", socket.id);
    return registerHandlers(io, socket, deps);
  });
  return io;
}
