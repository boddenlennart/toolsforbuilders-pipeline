#!/usr/bin/env node
// generate-reel.mjs — Generate Instagram Reel videos from content slides
// Professional agency-quality design — March 2026 redesign
// Run: node generate-reel.mjs [--post-id=xxx] [--test]

import { createCanvas, registerFont } from 'canvas';
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'fs';
import { readJSON, writeJSON, loadEnv, formatBangkokTimestamp, BRAND, PATHS } from './utils.mjs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const env = loadEnv();
const ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;
const ELEVENLABS_API_KEY = env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = env.ELEVENLABS_VOICE_ID || 'cjVigY5qzO86Huf0OWal';

if (!ANTHROPIC_API_KEY) {
  console.error('❌ ANTHROPIC_API_KEY not found in .env.secrets');
  process.exit(1);
}
if (!ELEVENLABS_API_KEY) {
  console.error('❌ ELEVENLABS_API_KEY not found in .env.secrets');
  process.exit(1);
}

// Video dimensions (vertical Reels format)
const WIDTH = 1080;
const HEIGHT = 1920;
const PADDING = 60; // side padding
const TOP_BAR_HEIGHT = 12; // blue accent bar height

// Safe zones for Reels (Instagram UI overlay)
const SAFE_TOP = 290;    // Y start of safe content area
const SAFE_BOTTOM = 1630; // Y end of safe content area
const SAFE_HEIGHT = SAFE_BOTTOM - SAFE_TOP;

// Typography scale (px)
const TYPOGRAPHY = {
  HOOK_HEADLINE: { size: 64, weight: 'bold', lineHeight: 80, color: BRAND.cream },
  CONTENT_HEADLINE: { size: 56, weight: 'bold', lineHeight: 64, color: BRAND.charcoal },
  BODY_TEXT: { size: 42, weight: 'regular', lineHeight: 56, color: BRAND.charcoal },
  ACCOUNT_HANDLE: { size: 72, weight: 'bold', lineHeight: 80, color: BRAND.cream },
  CTA_TEXT: { size: 48, weight: 'bold', lineHeight: 56, color: BRAND.cream },
  SLIDE_COUNTER: { size: 32, weight: 'bold', lineHeight: 32, color: BRAND.cream },
  WATERMARK: { size: 24, weight: 'regular', lineHeight: 28, color: BRAND.charcoal, opacity: 0.5 }
};

const WATERMARK = '@toolsforbuilders';

// Font loading with priority
function loadFonts() {
  const fontPaths = [
    { path: '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', family: 'Sans', weight: 'bold' },
    { path: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', family: 'Sans', weight: 'regular' },
    { path: '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf', family: 'Sans', weight: 'bold' },
    { path: '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf', family: 'Sans', weight: 'regular' },
    { path: '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf', family: 'Sans', weight: 'bold' },
    { path: '/usr/share/fonts/truetype/freefont/FreeSans.ttf', family: 'Sans', weight: 'regular' }
  ];
  
  for (const font of fontPaths) {
    if (existsSync(font.path)) {
      try {
        registerFont(font.path, { family: font.family, weight: font.weight });
        console.log(`✓ Loaded font: ${font.path} (${font.weight})`);
      } catch (e) {
        console.log(`Note: Could not load ${font.path}`);
      }
    }
  }
}

// Text wrapping helper
function wrapText(ctx, text, maxWidth, fontSize, fontWeight = 'regular') {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';
  
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    ctx.font = `${fontWeight} ${fontSize}px Sans`;
    const metrics = ctx.measureText(testLine);
    
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

// Measure text width
function measureText(ctx, text, fontSize, fontWeight = 'regular') {
  ctx.font = `${fontWeight} ${fontSize}px Sans`;
  return ctx.measureText(text).width;
}

// Draw rounded rectangle (pill)
function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

// Draw hook slide (slide 1)
function drawHookSlide(ctx, slide) {
  // Cream background
  ctx.fillStyle = BRAND.cream;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  
  // Blue accent bar at top (12px full width)
  ctx.fillStyle = BRAND.blue;
  ctx.fillRect(0, 0, WIDTH, TOP_BAR_HEIGHT);
  
  // Blue rectangle box centered in safe zone
  const boxWidth = 960;
  const boxPadding = 40;
  const boxRadius = 16;
  const maxTextWidth = boxWidth - boxPadding * 2;
  
  // Calculate box height based on text
  const headlineLines = wrapText(ctx, slide.headline, maxTextWidth, TYPOGRAPHY.HOOK_HEADLINE.size, 'bold');
  const lineHeight = TYPOGRAPHY.HOOK_HEADLINE.lineHeight;
  const textHeight = headlineLines.length * lineHeight;
  const boxHeight = textHeight + boxPadding * 2;
  
  // Center box vertically in safe zone
  const boxX = (WIDTH - boxWidth) / 2;
  const boxY = SAFE_TOP + (SAFE_HEIGHT - boxHeight) / 2;
  
  // Draw box
  ctx.fillStyle = BRAND.blue;
  drawRoundedRect(ctx, boxX, boxY, boxWidth, boxHeight, boxRadius);
  ctx.fill();
  
  // Headline text inside box
  ctx.fillStyle = TYPOGRAPHY.HOOK_HEADLINE.color;
  ctx.font = `bold ${TYPOGRAPHY.HOOK_HEADLINE.size}px Sans`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  
  const startY = boxY + boxPadding;
  headlineLines.forEach((line, i) => {
    ctx.fillText(line, WIDTH / 2, startY + i * lineHeight);
  });
  
  // No slide counter, no watermark on hook slide
}

// Draw content slide (slides 2 to N-1)
function drawContentSlide(ctx, slide, totalSlides) {
  // Cream background
  ctx.fillStyle = BRAND.cream;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  
  // Blue accent bar at top (12px full width)
  ctx.fillStyle = BRAND.blue;
  ctx.fillRect(0, 0, WIDTH, TOP_BAR_HEIGHT);
  
  // Slide counter pill (right-aligned, X:1020px, Y:320px, 40px inset from right)
  const pillText = `${slide.num}/${totalSlides}`;
  ctx.font = `bold ${TYPOGRAPHY.SLIDE_COUNTER.size}px Sans`;
  const textWidth = measureText(ctx, pillText, TYPOGRAPHY.SLIDE_COUNTER.size, 'bold');
  const pillPaddingX = 20;
  const pillPaddingY = 12;
  const pillWidth = textWidth + pillPaddingX * 2;
  const pillHeight = TYPOGRAPHY.SLIDE_COUNTER.lineHeight + pillPaddingY * 2;
  const pillRadius = pillHeight / 2;
  
  // Position: right edge at 1080 - 40 = 1040, left edge at 1040 - pillWidth
  // But spec says X:1020px right-aligned, Y:320px. X:1020 likely is left edge?
  // Let's interpret as left edge at 1020, Y at 320.
  const pillX = 1020 - pillWidth; // right-aligned? Actually X:1020 is right edge? Let's assume X:1020 is left edge.
  // According to spec: pill at X:1020px right-aligned, Y:320px, 40px inset from right.
  // If inset from right is 40px, then right edge at WIDTH - 40 = 1040. So left edge at 1040 - pillWidth = X.
  // That's X = 1040 - pillWidth. That's not 1020. Let's compute using inset.
  const COUNTER_INSET = 40;
  const pillX2 = WIDTH - COUNTER_INSET - pillWidth; // right edge at 1080-40
  const pillY = 320;
  
  // Pill background
  ctx.fillStyle = BRAND.blue;
  drawRoundedRect(ctx, pillX2, pillY, pillWidth, pillHeight, pillRadius);
  ctx.fill();
  
  // Pill text
  ctx.fillStyle = TYPOGRAPHY.SLIDE_COUNTER.color;
  ctx.font = `bold ${TYPOGRAPHY.SLIDE_COUNTER.size}px Sans`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(pillText, pillX2 + pillWidth / 2, pillY + pillHeight / 2);
  ctx.textBaseline = 'alphabetic';
  
  // Headline (bold 56px, charcoal, X:60px, Y:360px)
  let y = 360;
  ctx.fillStyle = TYPOGRAPHY.CONTENT_HEADLINE.color;
  ctx.font = `bold ${TYPOGRAPHY.CONTENT_HEADLINE.size}px Sans`;
  ctx.textAlign = 'left';
  
  const headlineLines = wrapText(ctx, slide.headline, WIDTH - PADDING * 2, TYPOGRAPHY.CONTENT_HEADLINE.size, 'bold');
  headlineLines.forEach((line, i) => {
    ctx.fillText(line, PADDING, y + i * TYPOGRAPHY.CONTENT_HEADLINE.lineHeight);
  });
  
  // Update Y position after headline
  y += headlineLines.length * TYPOGRAPHY.CONTENT_HEADLINE.lineHeight + 20;
  
  // Blue accent line (100px × 5px, under headline)
  ctx.fillStyle = BRAND.blue;
  ctx.fillRect(PADDING, y, 100, 5);
  
  y += 80; // space before bullets
  
  // Bullet points (max 4)
  const bullets = slide.bullets || [];
  const bulletGap = 90; // baseline-to-baseline gap
  const bulletRadius = 7; // 14px diameter
  const bulletTextX = PADDING + 50; // X:110px (bullet at X:60 + 50? Actually spec: bullet circle 14px Blue, text X:110px)
  const bulletCircleX = PADDING + 25; // center at X:60 + 25 = 85? Need bullet at X:? Let's compute: bullet circle 14px diameter, center at X: PADDING + 7? Let's follow spec: bullet circle 14px Blue, text X:110px. So bullet center at X:? 110 - 40 = 70? Let's set bullet circle at X: PADDING + 20 = 80. Actually spec says bullet filled circle 14px Blue, text X:110px. So bullet center at X:110 - 40 = 70? Let's assume bullet center at X: 70, text at X:110. We'll set bulletCircleX = 70.
  // Since PADDING=60, bulletCircleX = 70 (10px from padding). bulletTextX = 110.
  const bulletCircleX2 = 70;
  const bulletTextX2 = 110;
  
  ctx.fillStyle = BRAND.charcoal;
  ctx.font = `regular ${TYPOGRAPHY.BODY_TEXT.size}px Sans`;
  ctx.textAlign = 'left';
  
  for (let i = 0; i < bullets.length && i < 4; i++) {
    // Bullet circle
    ctx.fillStyle = BRAND.blue;
    ctx.beginPath();
    ctx.arc(bulletCircleX2, y + bulletRadius + 20, bulletRadius, 0, Math.PI * 2);
    ctx.fill();
    
    // Bullet text
    ctx.fillStyle = BRAND.charcoal;
    const bulletLines = wrapText(ctx, bullets[i], WIDTH - bulletTextX2 - PADDING, TYPOGRAPHY.BODY_TEXT.size, 'regular');
    bulletLines.forEach((line, j) => {
      ctx.fillText(line, bulletTextX2, y + j * TYPOGRAPHY.BODY_TEXT.lineHeight);
    });
    
    // Move Y down by gap
    y += bulletGap;
  }
  
  // Watermark bottom-right (just above unsafe zone)
  ctx.fillStyle = BRAND.charcoal;
  ctx.globalAlpha = TYPOGRAPHY.WATERMARK.opacity;
  ctx.font = `regular ${TYPOGRAPHY.WATERMARK.size}px Sans`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(WATERMARK, WIDTH - PADDING, SAFE_BOTTOM - 20);
  ctx.globalAlpha = 1;
}

// Draw CTA slide (last slide)
function drawCtaSlide(ctx, slide) {
  // Full Blue background
  ctx.fillStyle = BRAND.blue;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  
  // Account handle "@toolsforbuilders": Bold 72px, Cream, centered, Y:880px
  ctx.fillStyle = TYPOGRAPHY.ACCOUNT_HANDLE.color;
  ctx.font = `bold ${TYPOGRAPHY.ACCOUNT_HANDLE.size}px Sans`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(WATERMARK, WIDTH / 2, 880);
  
  // "Follow for daily AI tools": Bold 48px, Cream, centered, Y:980px
  const ctaText = slide.headline || 'Follow for daily AI tools';
  ctx.fillStyle = TYPOGRAPHY.CTA_TEXT.color;
  ctx.font = `bold ${TYPOGRAPHY.CTA_TEXT.size}px Sans`;
  
  const ctaLines = wrapText(ctx, ctaText, WIDTH - PADDING * 2, TYPOGRAPHY.CTA_TEXT.size, 'bold');
  const ctaStartY = 980;
  ctaLines.forEach((line, i) => {
    ctx.fillText(line, WIDTH / 2, ctaStartY + i * TYPOGRAPHY.CTA_TEXT.lineHeight);
  });
  
  // Cream horizontal line: 200x6px, centered, Y:1100px
  ctx.fillStyle = BRAND.cream;
  ctx.fillRect(WIDTH / 2 - 100, 1100, 200, 6);
  
  // No watermark, no slide counter
}

// Main slide drawing function
function drawReelSlide(slide, totalSlides) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  
  // Enable anti-aliasing
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.textBaseline = 'alphabetic';
  
  // Determine slide type
  if (slide.num === 1) {
    drawHookSlide(ctx, slide);
  } else if (slide.num === totalSlides) {
    drawCtaSlide(ctx, slide);
  } else {
    drawContentSlide(ctx, slide, totalSlides);
  }
  
  return canvas;
}

async function generateScriptFromSlides(slides) {
  const prompt = `You are a scriptwriter for @toolsforbuilders Instagram Reels. Create a 20-30 second voiceover script for a Reel based on these slides. The voiceover should be conversational, sound like a trustworthy friend (Eric voice), and follow these rules:

- Hook in the first 3 seconds
- Conversational tone, avoid robotic language
- Cover key points from each slide briefly
- End with a soft CTA (follow for more tips)
- Total length: 20-30 seconds, approx 50-80 words
- Write as a single paragraph, no timestamps

Slides:
${JSON.stringify(slides, null, 2)}

Return ONLY the script text, nothing else.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: 'You are a scriptwriter for Instagram Reels.',
      messages: [{ role: 'user', content: prompt }]
    })
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${error}`);
  }
  
  const data = await response.json();
  return data.content[0].text.trim();
}

async function generateTTS(script, outputPath) {
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': ELEVENLABS_API_KEY
    },
    body: JSON.stringify({
      text: script,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.40,
        similarity_boost: 0.78,
        style: 0.15,
        use_speaker_boost: true
      }
    })
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs API error: ${response.status} - ${error}`);
  }
  
  const audioBuffer = await response.arrayBuffer();
  writeFileSync(outputPath, Buffer.from(audioBuffer));
  console.log(`✓ TTS audio saved to ${outputPath}`);
}

async function createVideoFromSlides(slideImages, audioPath, outputPath) {
  // Create a temporary file list for ffmpeg concat
  const listPath = '/tmp/slides.txt';
  
  // Calculate duration per slide based on audio length
  let audioDuration = 25; // fallback
  try {
    const { execSync } = await import('child_process');
    audioDuration = parseFloat(execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${audioPath}"`).toString().trim());
  } catch(e) {
    console.log(`Could not detect audio duration, using fallback: ${e.message}`);
  }
  
  const slideCount = slideImages.length;
  const secPerSlide = Math.max(1.5, audioDuration / slideCount); // min 1.5 seconds per slide
  const listContent = slideImages.map(img => `file '${img}'\nduration ${secPerSlide.toFixed(2)}`).join('\n');
  writeFileSync(listPath, listContent);
  
  // Build ffmpeg command: concatenate images with NO fade-in, fade-out only
  const totalDuration = audioDuration || (slideCount * secPerSlide);
  const fadeDuration = 0.5;
  
  // Critical fixes: NO fade-in, NO -shortest flag, use -map 0:v -map 1:a
  const cmd = `ffmpeg -y -loglevel error \
    -f concat -safe 0 -i ${listPath} \
    -i ${audioPath} \
    -vf "fade=t=out:st=${totalDuration - fadeDuration}:d=${fadeDuration}" \
    -c:v libx264 -pix_fmt yuv420p -preset fast -crf 23 \
    -r 25 \
    -c:a aac -b:a 128k \
    -map 0:v -map 1:a \
    ${outputPath}`;
  
  console.log(`Running ffmpeg: ${cmd.substring(0, 100)}...`);
  await execAsync(cmd);
  console.log(`✓ Video saved to ${outputPath}`);
}

async function generateReelForPost(post, outputDir) {
  console.log(`\n🎬 Generating Reel for post: ${post.hook?.substring(0, 40)}...`);
  
  // Create output directory
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
  
  // Load fonts
  loadFonts();
  
  // Step 1: Generate script (optional, can reuse existing audio)
  const scriptPath = `${outputDir}/script.txt`;
  let audioPath = `${outputDir}/audio.mp3`;
  
  // Check if we should generate new TTS or reuse existing audio
  const existingAudio = post.audioPath || `${outputDir}/audio.mp3`;
  if (existsSync(existingAudio) && post.reuseAudio) {
    console.log('  1. Reusing existing audio...');
    audioPath = existingAudio;
    copyFileSync(existingAudio, audioPath);
  } else {
    console.log('  1. Generating voiceover script...');
    const script = await generateScriptFromSlides(post.slides);
    writeFileSync(scriptPath, script);
    console.log(`     Script length: ${script.split(' ').length} words`);
    
    // Step 2: Generate TTS audio
    console.log('  2. Generating TTS audio...');
    await generateTTS(script, audioPath);
  }
  
  // Step 3: Generate slide images for video
  console.log('  3. Generating slide images...');
  const slideImages = [];
  for (const slide of post.slides) {
    const canvas = drawReelSlide(slide, post.slides.length);
    const filename = `slide-${slide.num}.png`;
    const imagePath = `${outputDir}/${filename}`;
    const buffer = canvas.toBuffer('image/png');
    writeFileSync(imagePath, buffer);
    slideImages.push(imagePath);
    console.log(`     Generated slide ${slide.num}/${post.slides.length}`);
  }
  
  // Step 4: Assemble video
  console.log('  4. Assembling video with ffmpeg...');
  const videoPath = `${outputDir}/reel.mp4`;
  await createVideoFromSlides(slideImages, audioPath, videoPath);
  
  // Step 5: Generate caption
  const caption = `${post.hook}\n\n${post.script || 'Follow for more AI tools & automation tips.'}\n\n#AI #solopreneur #automation #toolsforbuilders`;
  const captionPath = `${outputDir}/caption.txt`;
  writeFileSync(captionPath, caption);
  
  console.log(`✅ Reel generation complete!`);
  console.log(`   Video: ${videoPath}`);
  console.log(`   Caption: ${captionPath}`);
  console.log(`   Audio: ${audioPath}`);
  
  return {
    videoPath,
    captionPath,
    scriptPath: existsSync(scriptPath) ? scriptPath : null,
    audioPath,
    slideImages
  };
}

async function main() {
  const args = process.argv.slice(2);
  
  // Test mode
  if (args.includes('--test')) {
    console.log('🧪 Testing reel generation with sample slides...');
    const testSlides = [
      { num: 1, type: 'hook', headline: 'Stop Using ChatGPT Wrong', bullets: [] },
      { num: 2, type: 'content', headline: 'The Problem', bullets: ['Most people just type questions', 'No structure, no system'] },
      { num: 3, type: 'content', headline: 'The Fix', bullets: ['Use custom instructions', 'Build prompt templates'] },
      { num: 4, type: 'cta', headline: 'Follow for more AI tips', bullets: [] }
    ];
    const testPost = {
      hook: 'Stop Using ChatGPT Wrong',
      slides: testSlides
    };
    const outputDir = `${PATHS.data}/samples/reels/test`;
    await generateReelForPost(testPost, outputDir);
    console.log('\n✅ Test complete! Check output files.');
    return;
  }
  
  // Read content queue
  const queue = readJSON('content-queue.json');
  if (!queue || !queue.posts) {
    console.error('❌ No content queue found. Run generate-content.mjs first.');
    process.exit(1);
  }
  
  // Filter posts that need reels
  const postsNeedingReels = queue.posts.filter(p => p.status === 'pending' && !p.reelGenerated);
  
  if (postsNeedingReels.length === 0) {
    console.log('✓ All pending posts have reels generated.');
    return;
  }
  
  console.log('='.repeat(50));
  console.log('🎬 REEL GENERATION - @toolsforbuilders (V2 Redesign)');
  console.log(`🕐 ${formatBangkokTimestamp()}`);
  console.log('='.repeat(50));
  
  console.log(`\n📹 Generating reels for ${postsNeedingReels.length} posts...`);
  
  for (const post of postsNeedingReels) {
    const dateDir = formatBangkokTimestamp().split(' ')[0];
    const outputDir = `${PATHS.posts}/${dateDir}/reel-${post.id}`;
    
    try {
      await generateReelForPost(post, outputDir);
      post.reelGenerated = true;
      post.reelGeneratedAt = formatBangkokTimestamp();
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
    }
  }
  
  // Save updated queue
  writeJSON('content-queue.json', queue);
  
  console.log('\n✅ Reel generation complete!');
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});