import { ConnectionIndicator } from "@/ui/components";
import { EditorSetup } from "@/ui/EditorSetup";
import { EditorView } from "@/ui/EditorView";
import { useCollaborativeEditor } from "@/hooks/useCollaborativeEditor";

function EditorInstance() {
  const { viewModel, status } = useCollaborativeEditor();

  if (!viewModel) return <ConnectionIndicator status={status} />;

  return (
    <>
      <EditorView viewModel={viewModel} />
      <ConnectionIndicator status={status} />
    </>
  );
}

function App() {
  return (
    <EditorSetup>
      <EditorInstance />
    </EditorSetup>
  );
}

export default App;
