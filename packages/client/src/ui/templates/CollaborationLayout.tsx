import { useCollaborativeEditor } from "@/hooks/useCollaborativeEditor";
import { EditorView } from "@/ui/EditorView";
import { UserPresenceBar } from "@/ui/components";
import { LINE_HEIGHT } from "@/constants";

/**
 * Template layout for a collaborative editing session.
 *
 * Owns the collaboration hook and renders collaboration-specific chrome
 * (presence bar, connection indicator) around a pure {@link EditorView}.
 * The editor itself has no knowledge of the surrounding layout.
 *
 * This separation supports future scenarios such as split-editor views —
 * multiple {@link EditorView} instances can be rendered inside a single
 * layout without any changes to the editor component itself.
 */
export function CollaborationLayout() {
  const { viewModel, status, users } = useCollaborativeEditor();

  if (!viewModel) {
    return (
      <div className="flex flex-col h-full">
        <UserPresenceBar users={users} connectionStatus={status} />
        <div className="flex-1 flex items-center justify-center text-neutral-500 font-mono text-sm">
          Connecting…
        </div>
      </div>
    );
  }

  // Reserve space above line 0 equal to a remote-cursor label height so that
  // labels on line 0 are never clipped. Increase this constant when adding
  // top chrome (e.g. search bar, replace box) to the collaboration layout.
  viewModel.setTopPadding(LINE_HEIGHT);

  return (
    <div className="flex flex-col h-full">
      <UserPresenceBar users={users} connectionStatus={status} />
      <div className="flex-1 min-h-0">
        <EditorView viewModel={viewModel} />
      </div>
    </div>
  );
}
