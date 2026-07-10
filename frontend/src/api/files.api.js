import axios from 'axios'
import api from './axios.js'

export async function listDocumentsRequest(roomId) {
  const { data } = await api.get(`/api/rooms/${roomId}/documents`)
  return data
}

export async function presignUploadRequest(roomId, file) {
  const { data } = await api.post(`/api/rooms/${roomId}/files/presign`, {
    filename: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
  })
  return data
}

export async function uploadToPresignedUrl(uploadUrl, file, onUploadProgress) {
  await axios.put(uploadUrl, file, {
    headers: {
      'Content-Type': file.type,
      'Content-Length': file.size,
    },
    onUploadProgress,
  })
}

export async function confirmUploadRequest(roomId, upload, file) {
  const { data } = await api.post(`/api/rooms/${roomId}/files/confirm`, {
    storageKey: upload.storageKey,
    filename: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
  })
  return data
}

export async function getDownloadUrlRequest(roomId, docId) {
  const { data } = await api.get(`/api/rooms/${roomId}/documents/${docId}/download`)
  return data
}
