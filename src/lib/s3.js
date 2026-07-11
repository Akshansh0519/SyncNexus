'use strict'

const {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')

const endpointUrl = process.env.MINIO_ENDPOINT || 'http://localhost:9005'
const isCloudEndpoint = endpointUrl.includes('filebase.com') ||
  endpointUrl.includes('cloudflarestorage.com') ||
  endpointUrl.includes('amazonaws.com') ||
  endpointUrl.includes('supabase.co')

const forcePathStyle = process.env.MINIO_FORCE_PATH_STYLE !== undefined
  ? process.env.MINIO_FORCE_PATH_STYLE === 'true'
  : !isCloudEndpoint

const s3 = new S3Client({
  endpoint: endpointUrl,
  forcePathStyle,
  region: process.env.MINIO_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY,
    secretAccessKey: process.env.MINIO_SECRET_KEY,
  },
})

const s3Public = new S3Client({
  endpoint: process.env.MINIO_PUBLIC_ENDPOINT || endpointUrl,
  forcePathStyle,
  region: process.env.MINIO_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY,
    secretAccessKey: process.env.MINIO_SECRET_KEY,
  },
})

async function ensureBucket(bucket) {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }))
  } catch (err) {
    const statusCode = err.$metadata?.httpStatusCode
    if (
      statusCode === 404 ||
      !statusCode ||
      err.name === 'NotFound' ||
      err.name === 'NoSuchBucket' ||
      (err.message && err.message.toLowerCase().includes('does not exist'))
    ) {
      try {
        await s3.send(new CreateBucketCommand({ Bucket: bucket }))
      } catch (createErr) {
        // If create fails because bucket already exists or cloud provider restricts API bucket creation, ignore safely
        if (
          createErr.name !== 'BucketAlreadyExists' &&
          createErr.name !== 'BucketAlreadyOwnedByYou' &&
          !(createErr.message && createErr.message.toLowerCase().includes('already exists'))
        ) {
          throw createErr
        }
      }
    } else {
      throw err
    }
  }
}

async function generateUploadUrl(bucket, key, contentType, contentLength) {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
    ContentLength: contentLength,
  })

  return await getSignedUrl(s3Public, command, { expiresIn: 300 })
}

async function generateDownloadUrl(bucket, key) {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  })

  return await getSignedUrl(s3Public, command, { expiresIn: 3600 })
}

async function getObjectBuffer(bucket, key) {
  const response = await s3.send(new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  }))

  const chunks = []
  for await (const chunk of response.Body) {
    chunks.push(Buffer.from(chunk))
  }

  return Buffer.concat(chunks)
}

module.exports = {
  s3,
  ensureBucket,
  generateUploadUrl,
  generateDownloadUrl,
  getObjectBuffer,
}
