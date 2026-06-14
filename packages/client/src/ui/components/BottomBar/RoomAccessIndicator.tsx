import { useState } from "react";
import { Lock, Globe, Eye } from "lucide-react";
import { useEditorStore } from "@/store/editorStore";
import { BottomBarItem } from "./BottomBarItem";
import { ShareModal } from "../ShareModal";

/**
 * An indicator in the status BottomBar showing the current room's access mode.
 * If the active user is the OWNER of the room, clicking this indicator
 * opens the ShareModal to manage access settings.
 */
export function RoomAccessIndicator() {
  const room = useEditorStore((state) => state.room);
  const effectiveRole = useEditorStore((state) => state.effectiveRole);
  const [showShareModal, setShowShareModal] = useState(false);

  if (!room) {
    return null;
  }

  const isOwner = effectiveRole === "OWNER";
  
  let icon = <Lock className="w-3.5 h-3.5" />;
  let label = "Restricted";
  
  if (room.accessMode === "PUBLIC_EDIT") {
    icon = <Globe className="w-3.5 h-3.5" />;
    label = "Public (Edit)";
  } else if (room.accessMode === "PUBLIC_VIEW") {
    icon = <Eye className="w-3.5 h-3.5" />;
    label = "Public (View)";
  }

  return (
    <>
      {isOwner ? (
        <BottomBarItem
          onClick={() => setShowShareModal(true)}
          title="Click to share and manage room access"
        >
          {icon}
          <span>{label}</span>
        </BottomBarItem>
      ) : (
        <BottomBarItem
          as="div"
          className="cursor-default hover:bg-transparent dark:hover:bg-transparent hover:text-muted-foreground"
          title="Room access mode (Only owner can modify)"
        >
          {icon}
          <span>{label}</span>
        </BottomBarItem>
      )}

      {showShareModal && (
        <ShareModal room={room} onClose={() => setShowShareModal(false)} />
      )}
    </>
  );
}
