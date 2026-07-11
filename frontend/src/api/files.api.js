import api from './axios.js'

export async function listDocumentsRequest(roomId) {
  const { data } = await api.get(`/api/rooms/${roomId}/documents`)
  return data
}

/**
 * Upload a file via the backend (server proxies to S3, no browser CORS needed).
 * onProgress(percent: number) is called with 0-100 as the upload proceeds.
 */
export async function uploadFileRequest(roomId, file, onProgress) {
  const formData = new FormData()
  formData.append('file', file)

  const { data } = await api.post(`/api/rooms/${roomId}/files/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (event) => {
      if (onProgress && event.total) {
        onProgress(Math.round((event.loaded / event.total) * 100))
      }
    },
  })
  return data
}

export async function getDownloadUrlRequest(roomId, docId) {
  const { data } = await api.get(`/api/rooms/${roomId}/documents/${docId}/download`)
  return data
}
