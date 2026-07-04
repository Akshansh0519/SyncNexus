'use strict'

const { GoogleGenAI } = require('@google/genai')

const geminiClient = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null

module.exports = { geminiClient }
