import { createEventBus } from "./infra";
import { createConnectionManager } from "./ws";
import { createWss } from "./ws";
import { createProtocolHandler } from "./modules/protocol";
import { createYjsService } from "./modules/crdt";
import { createPresenceService } from "./modules/presence";
import { createPermissionService } from "./modules/permission";
import { createRoomManager } from "./modules/room";
import { createSnapshotHydrator } from "./modules/persistence";
import { createDeltaScheduler } from "./modules/persistence";
import { createCompactionWorker } from "./modules/persistence";
import { createRedisEventBridge } from "./infra";
import { logger } from "./infra";

const PORT = parseInt(process.env.PORT ?? "1234", 10);

const bus = createEventBus();

// Infrastructure
createRedisEventBridge(bus);

// Transport
const wss = createWss();
createConnectionManager(bus, wss);

// Domain
createRoomManager(bus);
createProtocolHandler(bus);
createPermissionService(bus);
createYjsService(bus);
createPresenceService(bus);

// Persistence
createSnapshotHydrator(bus);
createDeltaScheduler(bus);
createCompactionWorker(bus);

logger.info("Server", `Collaboration server running on ws://localhost:${PORT}`);
