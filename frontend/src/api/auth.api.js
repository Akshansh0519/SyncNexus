import api from './axios.js'

export async function loginRequest(email, password) {
  const { data } = await api.post('/api/auth/login', { email, password })
  return data
}

export async function registerRequest(email, username, password) {
  const { data } = await api.post('/api/auth/register', { email, username, password })
  return data
}

export async function refreshRequest(refreshToken) {
  const { data } = await api.post('/api/auth/refresh', { refreshToken })
  return data
}

export async function logoutRequest() {
  await api.post('/api/auth/logout')
}
