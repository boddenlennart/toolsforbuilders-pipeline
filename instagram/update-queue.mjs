import { readFileSync, writeFileSync } from 'fs';
const queuePath = './data/content-queue.json';
const queue = JSON.parse(readFileSync(queuePath, 'utf-8'));

const targetIds = ['carousel-1-free-stack', 'carousel-2-comparison', 'carousel-3-autopilot'];
for (const post of queue.posts) {
  if (targetIds.includes(post.id)) {
    post.imagesGenerated = false;
    post.reelGenerated = false;
    delete post.imagePaths;
    delete post.imageGeneratedAt;
    delete post.reelGeneratedAt;
    console.log(`Reset ${post.id}`);
  }
}

writeFileSync(queuePath, JSON.stringify(queue, null, 2));
console.log('Updated queue');