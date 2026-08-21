import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import { AdminPage } from "./pages/AdminPage";
import { BackgroundRemovalPage } from "./pages/BackgroundRemovalPage";
import { BatchRepresentativeImagePage } from "./pages/BatchRepresentativeImagePage";
import { BatchGiftImagePage } from "./pages/BatchGiftImagePage";
import { GiftImagePage } from "./pages/GiftImagePage";
import { GuidePage } from "./pages/GuidePage";
import { RepresentativeImagePage } from "./pages/RepresentativeImagePage";

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/representative" replace />} />
        <Route path="/representative" element={<RepresentativeImagePage />} />
        <Route path="/batch" element={<BatchRepresentativeImagePage />} />
        <Route path="/gift" element={<GiftImagePage />} />
        <Route path="/gift-batch" element={<BatchGiftImagePage />} />
        <Route path="/cutout" element={<BackgroundRemovalPage />} />
        <Route path="/guide" element={<GuidePage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Route>
    </Routes>
  );
}
