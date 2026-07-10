import api from './axios.js'

export async function listRoomsRequest() {
  const { data } = await api.get('/api/rooms', { params: { limit: 50 } })
  return data.rooms ?? []
}

export async function createRoomRequest(name, isPrivate = false) {
  const { data } = await api.post('/api/rooms', { name, isPrivate })
  return data
}

export async function listPublicRoomsRequest() {
  const { data } = await api.get('/api/rooms/public', { params: { limit: 50 } })
  return data.rooms ?? []
}

export async function joinRoomRequest(roomId) {
  await api.post(`/api/rooms/${roomId}/join`)
}

export async function getRoomRequest(roomId) {
  const { data } = await api.get(`/api/rooms/${roomId}`)
  return data
}

export async function getMessagesRequest(roomId, cursor, limit = 50) {
  const { data } = await api.get(`/api/rooms/${roomId}/messages`, {
    params: { cursor, limit },
  })
  return data
}
