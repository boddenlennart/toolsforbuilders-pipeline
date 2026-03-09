import { readFileSync, writeFileSync } from 'fs';
const queuePath = './data/content-queue.json';
const queue = JSON.parse(readFileSync(queuePath, 'utf-8'));

const carouselIds = ['carousel-1-free-stack', 'carousel-2-comparison', 'carousel-3-autopilot'];
for (const post of queue.posts) {
  if (carouselIds.includes(post.id)) {
    post.reelGenerated = true; // don't generate reels for carousels
    console.log(`Set reelGenerated true for ${post.id}`);
  }
}

writeFileSync(queuePath, JSON.stringify(queue, null, 2));
console.log('Updated queue');