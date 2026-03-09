import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { readFileSync, existsSync } from 'fs';
import { basename, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load .env.secrets from current working directory first,
// fallback to script directory (where this module lives).
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPaths = [
  '.env.secrets',
  join(__dirname, '.env.secrets'),
];
for (const envPath of envPaths) {
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}

const client = new S3Client({
  region: 'auto',
  endpoint: `https://afe99febd94143a34deea0d688a5aa27.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CF_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.CF_R2_SECRET_ACCESS_KEY,
  },
});

export async function uploadToR2(filePath, key) {
  const body = readFileSync(filePath);
  const ext = filePath.split('.').pop().toLowerCase();
  const contentType = ext === 'mp4' ? 'video/mp4' :
                     ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
                     ext === 'png' ? 'image/png' :
                     'application/octet-stream';
  const cmd = new PutObjectCommand({
    Bucket: process.env.CF_R2_BUCKET,
    Key: key || basename(filePath),
    Body: body,
    ContentType: contentType,
    ACL: 'public-read',
  });
  await client.send(cmd);
  return `${process.env.CF_R2_PUBLIC_URL}/${key || basename(filePath)}`;
}

// Test if run directly
if (process.argv[2] === '--test') {
  import('./generate-images.mjs').then(async ({ generateTestImage }) => {
    console.log('Generating test image...');
    const testPath = '/tmp/r2-test.png';
    await generateTestImage(testPath);
    console.log('Uploading to R2...');
    const url = await uploadToR2(testPath, 'test/r2-test.png');
    console.log('✅ Public URL:', url);
  }).catch(async () => {
    // Fallback: use existing test image if available
    const { execSync } = await import('child_process');
    const testImg = execSync('find data/posts -name "*.png" | head -1').toString().trim();
    if (testImg) {
      console.log('Uploading existing image:', testImg);
      const url = await uploadToR2(testImg, 'test/r2-test.png');
      console.log('✅ Public URL:', url);
    } else {
      console.log('No test image found. Run generate-images.mjs first.');
    }
  });
}
