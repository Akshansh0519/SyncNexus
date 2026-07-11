'use strict'

// Set NODE_ENV before any module is loaded — this is the first file Jest runs.
// This ensures:
//  1. Rate limiter is bypassed (tests share 127.0.0.1 IP — would exhaust the counter)
//  2. Pino uses JSON mode (no pretty-print noise in test output)
process.env.NODE_ENV = 'test'
require('dotenv').config()

// Ensure tests use the isolated test database, NOT the development database
const url = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5433/syncnexus'
process.env.DATABASE_URL = url.replace('/syncnexus', '/syncnexus_test')
