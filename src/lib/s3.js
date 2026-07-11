'use strict'

const {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')

function normalizeEndpoint(url) {
  if (!url) return 'http://localhost:9005'
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return `https://${url}`
  }
  return url.replace(/\/+$/, '')
}

const endpointUrl = normalizeEndpoint(process.env.MINIO_ENDPOINT)
const isCloudEndpoint = endpointUrl.includes('filebase.com') ||
  endpointUrl.includes('cloudflarestorage.com') ||
  endpointUrl.includes('amazonaws.com') ||
  endpointUrl.includes('supabase.co') ||
  endpointUrl.includes('googleapis.com') ||
  endpointUrl.includes('digitaloceanspaces.com') ||
  endpointUrl.includes('backblazeb2.com') ||
  endpointUrl.includes('wasabisys.com')

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
  endpoint: normalizeEndpoint(process.env.MINIO_PUBLIC_ENDPOINT || endpointUrl),
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
        if (
          createErr.name !== 'BucketAlreadyExists' &&
          createErr.name !== 'BucketAlreadyOwnedByYou' &&
          !(createErr.message && createErr.message.toLowerCase().includes('already exists'))
        ) {
          if (isCloudEndpoint) return
          throw createErr
        }
      }
    } else {
      if (isCloudEndpoint) return
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
  try {
    const response = await s3.send(new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }))

    const chunks = []
    for await (const chunk of response.Body) {
      chunks.push(Buffer.from(chunk))
    }

    return Buffer.concat(chunks)
  } catch (err) {
    const { AppError } = require('./errors')
    throw new AppError(
      `S3 Storage Error (${err.name || 'GetObject'}): ${err.message || 'Failed to read file from cloud storage'}.`,
      502,
      'S3_DOWNLOAD_ERROR'
    )
  }
}

async function putObject(bucket, key, buffer, contentType) {
  try {
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ContentLength: buffer.length,
    }))
  } catch (err) {
    if (
      err.name === 'NotFound' ||
      err.name === 'NoSuchBucket' ||
      (err.message && err.message.toLowerCase().includes('does not exist')) ||
      err.$metadata?.httpStatusCode === 404
    ) {
      try {
        await s3.send(new CreateBucketCommand({ Bucket: bucket })).catch(() => {})
        await s3.send(new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: buffer,
          ContentType: contentType,
          ContentLength: buffer.length,
        }))
        return
      } catch (retryErr) {
        err = retryErr
      }
    }

    const { AppError } = require('./errors')
    throw new AppError(
      `S3 Storage Error (${err.name || 'PutObject'}): ${err.message || 'Failed to upload file to cloud storage'}. Verify MINIO_BUCKET (${bucket}) and storage credentials.`,
      502,
      'S3_UPLOAD_ERROR'
    )
  }
}

module.exports = {
  s3,
  ensureBucket,
  generateUploadUrl,
  generateDownloadUrl,
  getObjectBuffer,
  putObject,
}
