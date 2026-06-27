import { createEventBus } from "./infra/eventBus.js";
import { createConnectionManager } from "./ws/connectionManager.js";
import { createWss } from "./ws/wss.js";
import { createProtocolHandler } from "./modules/protocol/protocolHandler.js";
import { createYjsService } from "./modules/crdt/yjsService.js";
import { createPresenceService } from "./modules/presence/presenceService.js";
import { createPermissionService } from "./modules/permission/permissionService.js";
import { createRoomManager } from "./modules/room/roomManager.js";
import { createSnapshotHydrator } from "./modules/persistence/snapshotHydrator.js";
import { createDeltaScheduler } from "./modules/persistence/deltaScheduler.js";
import { createCompactionWorker } from "./modules/persistence/compactionWorker.js";
import { createRedisEventBridge } from "./infra/redisEventBridge.js";
import { logger } from "./infra/logger.js";

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
