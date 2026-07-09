import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx'
import { SocketProvider } from './contexts/SocketContext.jsx'
import { ThemeProvider } from './contexts/ThemeContext.jsx'
import AppPage from './pages/AppPage/AppPage.jsx'
import LoginPage from './pages/LoginPage/LoginPage.jsx'
import RegisterPage from './pages/RegisterPage/RegisterPage.jsx'
import Spinner from './components/ui/Spinner.jsx'

function ProtectedRoute() {
  const { accessToken, bootstrapping } = useAuth()

  if (bootstrapping) {
    return <Spinner fullPage />
  }

  return accessToken ? <AppPage /> : <Navigate to="/login" replace />
}

function GuestRoute({ children }) {
  const { accessToken, bootstrapping } = useAuth()

  if (bootstrapping) {
    return <Spinner fullPage />
  }

  return accessToken ? <Navigate to="/rooms" replace /> : children
}

export default function App() {
  return (
    <Router>
      <ThemeProvider>
        <AuthProvider>
          <SocketProvider>
            <Routes>
              <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
              <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />
              <Route path="/rooms" element={<ProtectedRoute />} />
              <Route path="/rooms/:roomId" element={<ProtectedRoute />} />
              <Route path="*" element={<Navigate to="/rooms" replace />} />
            </Routes>
          </SocketProvider>
        </AuthProvider>
      </ThemeProvider>
    </Router>
  )
}
