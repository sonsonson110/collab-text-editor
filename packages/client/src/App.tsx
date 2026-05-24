import { BrowserRouter, Route, Routes } from "react-router-dom";
import { LandingPage } from "@/pages/LandingPage";
import { RoomPage } from "@/pages/RoomPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/room/:roomId" element={<RoomPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
