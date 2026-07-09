import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { configureAuthBridge } from '../api/axios.js'
import { loginRequest, logoutRequest, refreshRequest, registerRequest } from '../api/auth.api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [accessToken, setAccessToken] = useState(null)
  const [bootstrapping, setBootstrapping] = useState(true)
  const accessTokenRef = useRef(null)

  const setSession = useCallback((token, nextUser) => {
    accessTokenRef.current = token
    setAccessToken(token)
    setUser(nextUser)
  }, [])

  const clearSession = useCallback(() => {
    accessTokenRef.current = null
    setAccessToken(null)
    setUser(null)
    localStorage.removeItem('refreshToken')
  }, [])

  useEffect(() => {
    configureAuthBridge({
      getAccessToken: () => accessTokenRef.current,
      setAccessToken: setSession,
      onLogout: clearSession,
    })
  }, [clearSession, setSession])

  const login = useCallback(async (email, password) => {
    const session = await loginRequest(email, password)
    localStorage.setItem('refreshToken', session.refreshToken)
    setSession(session.accessToken, session.user)
    return session.user
  }, [setSession])

  const register = useCallback(async (email, username, password) => {
    const session = await registerRequest(email, username, password)
    localStorage.setItem('refreshToken', session.refreshToken)
    setSession(session.accessToken, session.user)
    return session.user
  }, [setSession])

  const refreshSession = useCallback(async () => {
    const refreshToken = localStorage.getItem('refreshToken')
    if (!refreshToken) return null

    const session = await refreshRequest(refreshToken)
    localStorage.setItem('refreshToken', session.refreshToken)
    setSession(session.accessToken, session.user)
    return session.user
  }, [setSession])

  const logout = useCallback(async () => {
    try {
      if (accessTokenRef.current) {
        await logoutRequest()
      }
    } finally {
      clearSession()
    }
  }, [clearSession])

  useEffect(() => {
    refreshSession()
      .catch(clearSession)
      .finally(() => setBootstrapping(false))
  }, [clearSession, refreshSession])

  return (
    <AuthContext.Provider value={{ user, accessToken, bootstrapping, login, register, logout, refreshSession, setSession }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
