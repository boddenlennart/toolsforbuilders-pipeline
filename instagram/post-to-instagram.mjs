#!/usr/bin/env node
// post-to-instagram.mjs — Post carousels and images to Instagram
// Run: node post-to-instagram.mjs [--post-id=xxx] [--dry-run]
// API: graph.instagram.com/v21.0

import { readJSON, writeJSON, loadEnv, formatBangkokTimestamp, retry, PATHS } from './utils.mjs';

const env = loadEnv();
const IG_USER_ID = env.IG_USER_ID;
const IG_ACCESS_TOKEN = env.IG_ACCESS_TOKEN;
const API_BASE = 'https://graph.instagram.com/v22.0';

if (!IG_ACCESS_TOKEN) {
  console.error('❌ IG_ACCESS_TOKEN not found in .env.secrets');
  process.exit(1);
}

async function igApiCall(endpoint, method = 'GET', body = null) {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  
  if (body && method === 'POST') {
    options.body = JSON.stringify(body);
  }
  
  const response = await fetch(url, options);
  const data = await response.json();
  
  if (data.error) {
    throw new Error(`Instagram API: ${data.error.message} (code: ${data.error.code})`);
  }
  
  return data;
}

async function createImageContainer(imageUrl) {
  // Create a container for a single image (part of carousel)
  const endpoint = `/${IG_USER_ID}/media?access_token=${IG_ACCESS_TOKEN}&image_url=${encodeURIComponent(imageUrl)}&is_carousel_item=true`;
  
  return retry(async () => {
    console.log(`   📤 Creating container for: ${imageUrl.split('/').pop()}`);
    const result = await igApiCall(endpoint, 'POST');
    console.log(`   ✓ Container ID: ${result.id}`);
    return result.id;
  });
}

async function createCarouselContainer(containerIds, caption) {
  // Create a carousel container from individual image containers
  const childrenParam = containerIds.join(',');
  const endpoint = `/${IG_USER_ID}/media?access_token=${IG_ACCESS_TOKEN}&media_type=CAROUSEL&children=${childrenParam}&caption=${encodeURIComponent(caption)}`;
  
  return retry(async () => {
    console.log('   📦 Creating carousel container...');
    const result = await igApiCall(endpoint, 'POST');
    console.log(`   ✓ Carousel ID: ${result.id}`);
    return result.id;
  });
}

async function createSingleImagePost(imageUrl, caption) {
  // Create a single image post (not carousel)
  const endpoint = `/${IG_USER_ID}/media?access_token=${IG_ACCESS_TOKEN}&image_url=${encodeURIComponent(imageUrl)}&caption=${encodeURIComponent(caption)}`;
  
  return retry(async () => {
    console.log('   📤 Creating single image post...');
    const result = await igApiCall(endpoint, 'POST');
    console.log(`   ✓ Media ID: ${result.id}`);
    return result.id;
  });
}

async function publishMedia(containerId) {
  // Publish a media container (carousel or single image)
  const endpoint = `/${IG_USER_ID}/media_publish?access_token=${IG_ACCESS_TOKEN}&creation_id=${containerId}`;
  
  return retry(async () => {
    console.log('   🚀 Publishing...');
    const result = await igApiCall(endpoint, 'POST');
    console.log(`   ✓ Published! Media ID: ${result.id}`);
    return result.id;
  });
}

async function checkContainerStatus(containerId) {
  // Check if container is ready for publishing
  const endpoint = `/${containerId}?access_token=${IG_ACCESS_TOKEN}&fields=status_code,status`;
  const result = await igApiCall(endpoint);
  return result;
}

async function waitForContainerReady(containerId, maxWaitMs = 60000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitMs) {
    const status = await checkContainerStatus(containerId);
    
    if (status.status_code === 'FINISHED') {
      return true;
    }
    
    if (status.status_code === 'ERROR') {
      throw new Error(`Container processing failed: ${status.status}`);
    }
    
    console.log(`   ⏳ Container status: ${status.status_code}. Waiting...`);
    await new Promise(r => setTimeout(r, 3000));
  }
  
  throw new Error('Container processing timed out');
}

async function postCarousel(post) {
  console.log('\n🎠 Posting carousel...');
  
  const imagePaths = post.imagePaths || [];
  if (imagePaths.length < 2) {
    throw new Error('Carousel requires at least 2 images');
  }
  
  if (imagePaths.length > 10) {
    throw new Error('Carousel maximum is 10 images');
  }
  
  // Step 1: Create containers for each image
  const containerIds = [];
  for (const img of imagePaths) {
    const containerId = await createImageContainer(img.url);
    containerIds.push(containerId);
    
    // Small delay between API calls
    await new Promise(r => setTimeout(r, 1000));
  }
  
  // Step 2: Wait for all containers to be ready
  console.log('   ⏳ Waiting for image processing...');
  for (const containerId of containerIds) {
    await waitForContainerReady(containerId);
  }
  
  // Step 3: Create carousel container
  const carouselId = await createCarouselContainer(containerIds, post.caption);
  
  // Step 4: Wait for carousel to be ready
  await waitForContainerReady(carouselId);
  
  // Step 5: Publish
  const publishedId = await publishMedia(carouselId);
  
  return publishedId;
}

async function postSingleImage(post) {
  console.log('\n🖼️ Posting single image...');
  
  const imagePaths = post.imagePaths || [];
  if (imagePaths.length === 0) {
    throw new Error('No images found for post');
  }
  
  // Use first image
  const imageUrl = imagePaths[0].url;
  
  // Step 1: Create media container
  const mediaId = await createSingleImagePost(imageUrl, post.caption);
  
  // Step 2: Wait for processing
  await waitForContainerReady(mediaId);
  
  // Step 3: Publish
  const publishedId = await publishMedia(mediaId);
  
  return publishedId;
}

function logPost(post, publishedId, success, error = null) {
  const log = readJSON('post-log.json') || { posts: [] };
  
  log.posts.push({
    postId: post.id,
    publishedId: publishedId,
    success: success,
    error: error?.message || null,
    postedAt: formatBangkokTimestamp(),
    caption: post.caption?.substring(0, 100) + '...',
    slideCount: post.slides?.length || 0
  });
  
  writeJSON('post-log.json', log);
}

// ── Reels posting (used by post-approved-reel.mjs) ───────────────────────────

/**
 * Post a Reel video to Instagram.
 * @param {string} videoUrl - Public HTTPS URL to the video (R2 or similar)
 * @param {string} caption  - Post caption
 * @returns {Promise<{status: string, mediaId: string}>}
 */
export async function postToInstagram(videoUrl, caption) {
  // HARD GUARD: Hashtags must be in the original caption at post time.
  // Instagram does NOT index hashtags added retroactively — algorithm won't pick up the post.
  const hashtagCount = (caption.match(/#\w+/g) || []).length;
  if (hashtagCount < 3) {
    throw new Error(
      `BLOCKED: Caption contains only ${hashtagCount} hashtag(s). ` +
      `Hashtags MUST be included in the original caption before posting — ` +
      `retroactive hashtag edits are NOT indexed by the Instagram algorithm. ` +
      `Add hashtags to generateCaption() and retry.`
    );
  }

  console.log('   📹 Creating Reels container...');

  // Step 1: Create the REELS media container
  const createEndpoint = `/${IG_USER_ID}/media` +
    `?access_token=${IG_ACCESS_TOKEN}` +
    `&media_type=REELS` +
    `&video_url=${encodeURIComponent(videoUrl)}` +
    `&caption=${encodeURIComponent(caption)}` +
    `&share_to_feed=true`;

  const container = await retry(async () => {
    const result = await igApiCall(createEndpoint, 'POST');
    if (!result.id) throw new Error('No container ID returned from IG API');
    console.log(`   ✓ Container created: ${result.id}`);
    return result;
  });

  const containerId = container.id;

  // Step 2: Wait for video processing (REELS need longer than images)
  console.log('   ⏳ Waiting for video processing...');
  await waitForContainerReady(containerId, 120000); // 2 min timeout for video

  // Step 3: Publish
  const publishedId = await publishMedia(containerId);

  return { status: 'ok', mediaId: publishedId };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const postIdArg = args.find(a => a.startsWith('--post-id='));
  const targetPostId = postIdArg ? postIdArg.split('=')[1] : null;
  
  console.log('='.repeat(50));
  console.log('📸 INSTAGRAM POSTER - @toolsforbuilders');
  console.log(`🕐 ${formatBangkokTimestamp()}`);
  if (dryRun) console.log('🔍 DRY RUN MODE - No actual posting');
  console.log('='.repeat(50));
  
  // Read queue
  const queue = readJSON('content-queue.json');
  if (!queue || !queue.posts) {
    console.error('❌ No content queue found.');
    process.exit(1);
  }
  
  // Find post to publish
  let post;
  if (targetPostId) {
    post = queue.posts.find(p => p.id === targetPostId);
    if (!post) {
      console.error(`❌ Post not found: ${targetPostId}`);
      process.exit(1);
    }
  } else {
    // Get next approved post
    post = queue.posts.find(p => p.status === 'approved' && p.imagesGenerated);
    if (!post) {
      console.log('ℹ️ No approved posts ready to publish.');
      console.log('   Posts need to be approved via approval-bot.mjs first.');
      return;
    }
  }
  
  console.log(`\n📝 Post: ${post.hook?.substring(0, 50)}...`);
  console.log(`   Pillar: ${post.pillar}`);
  console.log(`   Slides: ${post.slides?.length || 0}`);
  
  if (!post.imagesGenerated) {
    console.error('❌ Images not generated for this post. Run generate-images.mjs first.');
    process.exit(1);
  }
  
  if (dryRun) {
    console.log('\n🔍 DRY RUN - Would post:');
    console.log(`   Images: ${post.imagePaths?.length || 0}`);
    console.log(`   Caption: ${post.caption?.substring(0, 100)}...`);
    return;
  }
  
  try {
    let publishedId;
    
    if (post.slides?.length >= 2) {
      publishedId = await postCarousel(post);
    } else {
      publishedId = await postSingleImage(post);
    }
    
    // Update post status
    post.status = 'published';
    post.publishedId = publishedId;
    post.publishedAt = formatBangkokTimestamp();
    
    // Log success
    logPost(post, publishedId, true);
    
    // Save queue
    writeJSON('content-queue.json', queue);
    
    console.log('\n✅ Posted successfully!');
    console.log(`   Instagram Media ID: ${publishedId}`);
    
  } catch (error) {
    console.error(`\n❌ Posting failed: ${error.message}`);
    
    // Update post status
    post.status = 'failed';
    post.lastError = error.message;
    post.lastAttempt = formatBangkokTimestamp();
    
    // Log failure
    logPost(post, null, false, error);
    
    // Save queue
    writeJSON('content-queue.json', queue);
    
    process.exit(1);
  }
}

// Only run main() when executed directly (not when imported as a module)
const isMain = import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  main().catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  });
}
