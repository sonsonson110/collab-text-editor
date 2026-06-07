import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { LandingPage } from "@/pages/LandingPage";
import { RoomPage } from "@/pages/RoomPage";
import { RoomsPage } from "@/pages/RoomsPage";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { TooltipProvider } from "@/components/ui/tooltip";

function App() {
  return (
    <ThemeProvider defaultTheme="system">
      <TooltipProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/room/:roomId" element={<RoomPage />} />
            <Route path="/rooms" element={<RoomsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  );
}

export default App;
