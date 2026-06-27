import { WebSocketServer } from "ws";
import type { IncomingMessage } from "node:http";
import { verifyRoomTicket, type TicketClaims } from "../auth";
import { logger } from "../infra";
import { WS_CLOSE_UNAUTHORIZED } from "../types";

const PORT = parseInt(process.env.PORT ?? "1234", 10);

export function createWss(): WebSocketServer {
  const wss = new WebSocketServer({
    port: PORT,
    verifyClient(
      info: { req: IncomingMessage },
      callback: (pass: boolean, code?: number, message?: string) => void,
    ) {
      const url = new URL(info.req.url ?? "/", `http://localhost:${PORT}`);
      const ticket = url.searchParams.get("ticket");

      if (!ticket) {
        callback(false, 401, "Missing room ticket");
        return;
      }

      const roomName = url.pathname.replace(/^\//, "") || "default";

      try {
        const claims = verifyRoomTicket(ticket, roomName);
        (info.req as IncomingMessage & { _claims?: TicketClaims })._claims =
          claims;
        callback(true);
      } catch (e) {
        logger.error("Wss", "Failed to verify ticket:", e as Error);
        callback(false, 401, "Invalid or expired ticket");
      }
    },
  });

  return wss;
}
