import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
})

let accessTokenGetter = () => null
let accessTokenSetter = () => {}
let logoutHandler = () => {}
let refreshPromise = null

export function configureAuthBridge({ getAccessToken, setAccessToken, onLogout }) {
  accessTokenGetter = getAccessToken
  accessTokenSetter = setAccessToken
  logoutHandler = onLogout
}

api.interceptors.request.use((config) => {
  const token = accessTokenGetter()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config
    const refreshToken = localStorage.getItem('refreshToken')

    if (error.response?.status !== 401 || original?._retry || !refreshToken) {
      return Promise.reject(error)
    }

    original._retry = true

    try {
      refreshPromise ||= axios
        .post(`${import.meta.env.VITE_API_URL}/api/auth/refresh`, { refreshToken })
        .then((response) => response.data)
        .finally(() => {
          refreshPromise = null
        })

      const session = await refreshPromise
      localStorage.setItem('refreshToken', session.refreshToken)
      accessTokenSetter(session.accessToken, session.user)
      original.headers.Authorization = `Bearer ${session.accessToken}`
      return api(original)
    } catch (refreshError) {
      logoutHandler()
      return Promise.reject(refreshError)
    }
  }
)

export default api
