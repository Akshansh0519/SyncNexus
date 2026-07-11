'use strict'

const { execSync } = require('child_process')
require('dotenv').config()

module.exports = async () => {
  // Derive a test database URL from the development one
  const url = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5433/syncnexus'
  const testUrl = url.replace('/syncnexus', '/syncnexus_test')
  
  // Set it for the child process
  const env = { ...process.env, DATABASE_URL: testUrl }

  console.log('\n[Global Setup] Preparing isolated test database (syncnexus_test)...')
  
  try {
    // Push the current Prisma schema to the test database
    // This will create the database if it doesn't exist
    execSync('npx prisma db push --accept-data-loss', { env, stdio: 'inherit' })
  } catch (err) {
    console.error('Failed to initialize test database:', err.message)
    throw err
  }
}
