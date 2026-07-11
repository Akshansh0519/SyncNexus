'use strict'

function getClientOrigins() {
  const configured = process.env.CLIENT_URL
    ? process.env.CLIENT_URL.split(',').map((origin) => origin.trim()).filter(Boolean)
    : []

  return [
    ...new Set([
      ...configured,
      'http://localhost:3001',
      'http://127.0.0.1:3001',
    ]),
  ]
}

module.exports = { getClientOrigins }
