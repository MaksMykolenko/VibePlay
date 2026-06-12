import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { GamesProvider } from './hooks/useGames';

// Layouts
import { AppShell } from './layouts/AppShell';

// Core Pages
import { LandingPage } from './pages/LandingPage';
import { GamesPage } from './pages/GamesPage';
import { GameDetailPage } from './pages/GameDetailPage';
import { GamePlayerPage } from './pages/GamePlayerPage';
import { LoginPage, RegisterPage, ForgotPasswordPage } from './pages/AuthPages';
import { ProfilePage } from './pages/ProfilePage';
import { SettingsPage } from './pages/SettingsPage';
import { LibraryPage } from './pages/LibraryPage';
import { SearchPage } from './pages/SearchPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { NotFoundPage } from './pages/NotFoundPage';

// Creator Pages
import { CreatorOverview } from './pages/Creator/Overview';
import { MyGames } from './pages/Creator/MyGames';
import { PublishGame } from './pages/Creator/PublishGame';
import { CreatorAnalytics } from './pages/Creator/Analytics';
import { EditGame } from './pages/Creator/EditGame';

// Admin Pages
import { AdminDashboard } from './pages/Admin/Dashboard';
import { AdminModeration } from './pages/Admin/Moderation';
import { AdminUsers } from './pages/Admin/Users';
import { AdminReports } from './pages/Admin/Reports';
import { AdminFeatured } from './pages/Admin/Featured';
import { AdminActivityLog } from './pages/Admin/ActivityLog';
import { ThemeProvider } from './hooks/useTheme';

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <GamesProvider>
          <Routes>
            
            {/* Auth Pages (Bypass AppShell) */}
            <Route path="login" element={<LoginPage />} />
            <Route path="register" element={<RegisterPage />} />
            <Route path="forgot-password" element={<ForgotPasswordPage />} />

            {/* Immersive Play Theatre */}
            <Route path="/play/:slug" element={<GamePlayerPage />} />

            {/* Main Unified AppShell Layout */}
            <Route path="/" element={<AppShell />}>
              <Route index element={<LandingPage />} />
              <Route path="home" element={<LandingPage />} />
              <Route path="discover" element={<LandingPage />} />
              <Route path="games" element={<GamesPage />} />
              <Route path="browse" element={<GamesPage />} />
              <Route path="categories" element={<GamesPage />} />
              <Route path="game/:slug" element={<GameDetailPage />} />
              <Route path="profile/:username" element={<ProfilePage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="library" element={<LibraryPage />} />
              <Route path="library/favorites" element={<LibraryPage />} />
              <Route path="library/liked" element={<LibraryPage />} />
              <Route path="recent" element={<LibraryPage />} />
              <Route path="recently-played" element={<LibraryPage />} />
              <Route path="search" element={<SearchPage />} />
              <Route path="notifications" element={<NotificationsPage />} />
              
              {/* Creator Studio Routes */}
              <Route path="creator" element={<CreatorOverview />} />
              <Route path="creator/my-games" element={<MyGames />} />
              <Route path="creator/publish" element={<PublishGame />} />
              <Route path="creator/analytics" element={<CreatorAnalytics />} />
              <Route path="creator/games/:id/edit" element={<EditGame />} />

              {/* Admin Panel Routes */}
              <Route path="admin" element={<AdminDashboard />} />
              <Route path="admin/moderation" element={<AdminModeration />} />
              <Route path="admin/users" element={<AdminUsers />} />
              <Route path="admin/reports" element={<AdminReports />} />
              <Route path="admin/featured" element={<AdminFeatured />} />
              <Route path="admin/logs" element={<AdminActivityLog />} />

              <Route path="*" element={<NotFoundPage />} />
            </Route>

          </Routes>
        </GamesProvider>
      </AuthProvider>
    </ThemeProvider>
  </BrowserRouter>
);
}

export default App;
