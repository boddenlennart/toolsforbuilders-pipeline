#!/usr/bin/env node
import { readJSON, writeJSON, PATHS } from './utils.mjs';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';

const queue = readJSON('content-queue.json');
if (!queue || !queue.posts) {
  console.error('❌ No content queue found.');
  process.exit(1);
}

const sampleDir = `${PATHS.data}/samples`;
const carouselDir = `${sampleDir}/carousels`;
const reelDir = `${sampleDir}/reels`;

// Ensure directories exist
mkdirSync(carouselDir, { recursive: true });
mkdirSync(reelDir, { recursive: true });

// Helper to copy slides
function copySlides(post, type) {
  const prefix = post.id;
  const targetDir = type === 'carousel' ? `${carouselDir}/${post.id}` : `${reelDir}/${post.id}`;
  mkdirSync(targetDir, { recursive: true });
  
  // Copy slides from publicImages
  const slides = post.slides || [];
  slides.forEach(slide => {
    const src = `${PATHS.publicImages}/${prefix}-slide-${slide.num}.png`;
    const dst = `${targetDir}/slide-${slide.num}.png`;
    if (existsSync(src)) {
      copyFileSync(src, dst);
      console.log(`   Copied ${src} -> ${dst}`);
    } else {
      console.log(`   Missing ${src}`);
    }
  });
  
  // Write caption.txt
  const captionPath = `${targetDir}/caption.txt`;
  writeFileSync(captionPath, post.caption || '');
  console.log(`   Wrote caption.txt`);
  
  // For reels, also copy reel.mp4, script.txt, audio.mp3 if exists
  if (type === 'reel') {
    const reelBase = `${PATHS.posts}/2026-03-03/reel-${post.id}`;
    if (existsSync(`${reelBase}/reel.mp4`)) {
      copyFileSync(`${reelBase}/reel.mp4`, `${targetDir}/reel.mp4`);
      console.log(`   Copied reel.mp4`);
    }
    if (existsSync(`${reelBase}/script.txt`)) {
      copyFileSync(`${reelBase}/script.txt`, `${targetDir}/script.txt`);
    }
    if (existsSync(`${reelBase}/audio.mp3`)) {
      copyFileSync(`${reelBase}/audio.mp3`, `${targetDir}/audio.mp3`);
    }
  }
}

console.log('📁 Organizing sample content...');

// Process carousels (first three posts)
const carouselPosts = queue.posts.filter(p => p.id.startsWith('carousel-'));
carouselPosts.forEach(post => {
  console.log(`\n📦 Carousel: ${post.id}`);
  copySlides(post, 'carousel');
});

// Process reels (last three posts)
const reelPosts = queue.posts.filter(p => p.id.startsWith('reel-'));
reelPosts.forEach(post => {
  console.log(`\n🎬 Reel: ${post.id}`);
  copySlides(post, 'reel');
});

console.log('\n✅ Sample content organized!');
console.log(`   Carousels: ${carouselDir}/`);
console.log(`   Reels: ${reelDir}/`);