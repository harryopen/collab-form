import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { getRole } from "../permissions/getRole.js";
import { createAccess, setAccess } from "./access.js";
import {
  MAX_HTTP_BUFFER_SIZE,
  roomOf,
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
  setAccess(createAccess(io, { registry: deps.registry, getRole: deps.getRole }))
  // Awareness changes fan out to the document's room, skipping the socket that made the change.
  deps.registry.setAwarenessSink((documentId, update, exceptSocketId) => {
    const room = io.to(roomOf(documentId))
    ;(exceptSocketId ? room.except(exceptSocketId) : room).emit('doc:awareness', { documentId, update })
  })
  io.use(authenticate);
  io.on("connection", (socket) => {
    console.log("a user connected", socket.id);
    return registerHandlers(io, socket, deps);
  });
  return io;
}
