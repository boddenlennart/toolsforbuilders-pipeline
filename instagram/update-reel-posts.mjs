import { readFileSync, writeFileSync } from 'fs';
const queuePath = './data/content-queue.json';
const queue = JSON.parse(readFileSync(queuePath, 'utf-8'));

const targetIds = ['reel-1-free-tools', 'reel-2-agents'];
for (const post of queue.posts) {
  if (targetIds.includes(post.id)) {
    post.imagesGenerated = false;
    post.reelGenerated = false;
    post.reuseAudio = true;
    post.audioPath = `./data/samples/reels/${post.id}/audio.mp3`;
    delete post.imagePaths;
    delete post.imageGeneratedAt;
    delete post.reelGeneratedAt;
    console.log(`Updated ${post.id} for reel regeneration`);
  }
}

writeFileSync(queuePath, JSON.stringify(queue, null, 2));
console.log('Updated queue for reel samples');