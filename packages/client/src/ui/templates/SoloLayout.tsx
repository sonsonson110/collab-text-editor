import { useSoloEditor } from "@/hooks/useSoloEditor";
import { EditorView } from "@/ui/EditorView";
import { Spinner } from "@/components/ui/spinner";

/**
 * Template layout for a solo (offline) editing session.
 *
 * Renders a full-screen {@link EditorView} without any collaboration chrome
 * (presence bar, connection indicator). The editor is bootstrapped by the
 * {@link useSoloEditor} hook using a local document and history manager.
 */
export function SoloLayout() {
  const { viewModel } = useSoloEditor();

  if (!viewModel) {
    return (
      <div className="flex flex-col h-screen">
        <div className="flex-1 flex items-center justify-center gap-2 text-muted-foreground font-mono text-sm">
          <Spinner className="size-4" />
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0">
        <EditorView viewModel={viewModel} />
      </div>
    </div>
  );
}
