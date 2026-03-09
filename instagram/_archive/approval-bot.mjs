#!/usr/bin/env node
// approval-bot.mjs — Telegram approval workflow for Instagram posts
// Run: node approval-bot.mjs [--post-id=xxx]
// Sends preview to Lennart, waits for approval via inline buttons

import { readFileSync, existsSync } from 'fs';
import { readJSON, writeJSON, loadEnv, formatBangkokTimestamp, PATHS } from './utils.mjs';

const env = loadEnv();

// Telegram config - bot token from OpenClaw config
const TG_BOT_TOKEN = '8261416147:AAEH8tIatc3KOF99Yozm8kCu-mx3fQgM-x8';
const TG_CHAT_ID = env.TG_CHAT_ID || ''; // Lennart's chat ID - needs to be set

const TG_API = `https://api.telegram.org/bot${TG_BOT_TOKEN}`;

async function sendTelegramPhoto(chatId, photoPath, caption, replyMarkup = null) {
  const formData = new FormData();
  
  // Read image file
  const imageBuffer = readFileSync(photoPath);
  const blob = new Blob([imageBuffer], { type: 'image/png' });
  
  formData.append('chat_id', chatId);
  formData.append('photo', blob, 'preview.png');
  formData.append('caption', caption.substring(0, 1024)); // Telegram caption limit
  formData.append('parse_mode', 'HTML');
  
  if (replyMarkup) {
    formData.append('reply_markup', JSON.stringify(replyMarkup));
  }
  
  const response = await fetch(`${TG_API}/sendPhoto`, {
    method: 'POST',
    body: formData
  });
  
  const data = await response.json();
  if (!data.ok) {
    throw new Error(`Telegram API error: ${data.description}`);
  }
  
  return data.result;
}

async function sendTelegramMessage(chatId, text, replyMarkup = null) {
  const body = {
    chat_id: chatId,
    text: text,
    parse_mode: 'HTML',
    disable_web_page_preview: true
  };
  
  if (replyMarkup) {
    body.reply_markup = replyMarkup;
  }
  
  const response = await fetch(`${TG_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  
  const data = await response.json();
  if (!data.ok) {
    throw new Error(`Telegram API error: ${data.description}`);
  }
  
  return data.result;
}

function buildApprovalButtons(postId) {
  return {
    inline_keyboard: [
      [
        { text: '✅ Approve', callback_data: `ig_approve:${postId}` },
        { text: '❌ Reject', callback_data: `ig_reject:${postId}` }
      ],
      [
        { text: '✏️ Edit Caption', callback_data: `ig_edit:${postId}` },
        { text: '⏭️ Skip (Later)', callback_data: `ig_skip:${postId}` }
      ]
    ]
  };
}

function formatPreviewCaption(post) {
  const lines = [
    `<b>📸 Instagram Post Preview</b>`,
    ``,
    `<b>Pillar:</b> ${post.pillar}`,
    `<b>Slides:</b> ${post.slides?.length || 0}`,
    `<b>Hook:</b> ${post.hook}`,
    ``,
    `<b>Caption preview:</b>`,
    post.caption?.substring(0, 500) + (post.caption?.length > 500 ? '...' : ''),
    ``,
    `<i>Created: ${post.createdAt}</i>`
  ];
  
  return lines.join('\n');
}

async function sendApprovalRequest(post, chatId) {
  console.log(`\n📤 Sending approval request for: ${post.id}`);
  
  // Get first slide image for preview
  const imagePath = post.imagePaths?.[0]?.local;
  
  if (imagePath && existsSync(imagePath)) {
    // Send with image
    const caption = formatPreviewCaption(post);
    const buttons = buildApprovalButtons(post.id);
    
    try {
      const result = await sendTelegramPhoto(chatId, imagePath, caption, buttons);
      console.log(`   ✓ Sent preview with image (message_id: ${result.message_id})`);
      return result;
    } catch (error) {
      console.error(`   ⚠️ Image send failed: ${error.message}`);
      // Fall back to text-only
    }
  }
  
  // Text-only fallback
  const text = formatPreviewCaption(post) + '\n\n(Image preview not available)';
  const buttons = buildApprovalButtons(post.id);
  const result = await sendTelegramMessage(chatId, text, buttons);
  console.log(`   ✓ Sent text preview (message_id: ${result.message_id})`);
  return result;
}

async function processCallbackQuery(update) {
  const callback = update.callback_query;
  if (!callback?.data) return null;
  
  const [action, postId] = callback.data.split(':');
  
  if (!action.startsWith('ig_')) return null;
  
  console.log(`\n📥 Callback: ${action} for ${postId}`);
  
  // Read queue
  const queue = readJSON('content-queue.json');
  if (!queue?.posts) {
    console.error('   ❌ No queue found');
    return;
  }
  
  const post = queue.posts.find(p => p.id === postId);
  if (!post) {
    console.error(`   ❌ Post not found: ${postId}`);
    return;
  }
  
  switch (action) {
    case 'ig_approve':
      post.status = 'approved';
      post.approvedAt = formatBangkokTimestamp();
      console.log(`   ✓ Post approved`);
      break;
      
    case 'ig_reject':
      post.status = 'rejected';
      post.rejectedAt = formatBangkokTimestamp();
      console.log(`   ✓ Post rejected`);
      break;
      
    case 'ig_skip':
      post.status = 'skipped';
      post.skippedAt = formatBangkokTimestamp();
      console.log(`   ✓ Post skipped for later`);
      break;
      
    case 'ig_edit':
      post.status = 'editing';
      post.editRequestedAt = formatBangkokTimestamp();
      console.log(`   ✓ Edit requested — awaiting new caption`);
      // TODO: Implement edit flow with follow-up message
      break;
  }
  
  // Save queue
  writeJSON('content-queue.json', queue);
  
  // Answer callback
  await fetch(`${TG_API}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      callback_query_id: callback.id,
      text: `Post ${action.replace('ig_', '')}ed!`
    })
  });
  
  return { action, postId, post };
}

async function pollForUpdates(lastUpdateId = 0, timeoutSec = 30) {
  const response = await fetch(
    `${TG_API}/getUpdates?offset=${lastUpdateId + 1}&timeout=${timeoutSec}&allowed_updates=["callback_query"]`
  );
  
  const data = await response.json();
  if (!data.ok) {
    throw new Error(`Telegram API error: ${data.description}`);
  }
  
  return data.result;
}

async function main() {
  const args = process.argv.slice(2);
  const postIdArg = args.find(a => a.startsWith('--post-id='));
  const targetPostId = postIdArg ? postIdArg.split('=')[1] : null;
  const pollMode = args.includes('--poll');
  
  console.log('='.repeat(50));
  console.log('📱 APPROVAL BOT - @toolsforbuilders');
  console.log(`🕐 ${formatBangkokTimestamp()}`);
  console.log('='.repeat(50));
  
  // Check for chat ID
  if (!TG_CHAT_ID) {
    console.error('\n❌ TG_CHAT_ID not set in .env.secrets');
    console.error('   Add: TG_CHAT_ID=<your-telegram-chat-id>');
    console.error('   (Send /start to the bot and check the chat ID)');
    process.exit(1);
  }
  
  // Read queue
  const queue = readJSON('content-queue.json');
  if (!queue?.posts) {
    console.error('\n❌ No content queue found. Run generate-content.mjs first.');
    process.exit(1);
  }
  
  // Find posts needing approval
  let postsToApprove;
  if (targetPostId) {
    const post = queue.posts.find(p => p.id === targetPostId);
    if (!post) {
      console.error(`\n❌ Post not found: ${targetPostId}`);
      process.exit(1);
    }
    postsToApprove = [post];
  } else {
    postsToApprove = queue.posts.filter(
      p => p.status === 'pending' && p.imagesGenerated
    );
  }
  
  if (postsToApprove.length === 0) {
    console.log('\nℹ️ No posts pending approval.');
    console.log('   Generate content and images first.');
    return;
  }
  
  console.log(`\n📋 Posts pending approval: ${postsToApprove.length}`);
  
  // Send approval requests
  for (const post of postsToApprove) {
    try {
      post.approvalRequestSentAt = formatBangkokTimestamp();
      post.status = 'awaiting_approval';
      await sendApprovalRequest(post, TG_CHAT_ID);
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
    }
  }
  
  // Save updated queue
  writeJSON('content-queue.json', queue);
  
  if (pollMode) {
    console.log('\n👀 Entering poll mode — waiting for approvals...');
    console.log('   (Press Ctrl+C to exit)\n');
    
    let lastUpdateId = 0;
    
    while (true) {
      try {
        const updates = await pollForUpdates(lastUpdateId);
        
        for (const update of updates) {
          lastUpdateId = Math.max(lastUpdateId, update.update_id);
          await processCallbackQuery(update);
        }
      } catch (error) {
        console.error(`Poll error: ${error.message}`);
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  } else {
    console.log('\n✅ Approval requests sent!');
    console.log('   Lennart can approve/reject via Telegram buttons.');
    console.log('   Run with --poll to wait for responses.');
  }
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
