const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
// const axios = require("axios"); // You might need to install axios or use fetch

// Configuration
const AUTH_FILE = "auth.json";
const INITIAL_COOLDOWN = 630000; // 6 minutes in milliseconds
const MAX_COOLDOWN = 1800000; // 30 minutes max
const COOLDOWN_MULTIPLIER = 1.5; // Increase cooldown by 50% each time
const REQUEST_DELAY = 8000; // 8 seconds between requests
const BATCH_SLEEP_DURATION = 180000; // 3 minutes in milliseconds
const BACKEND_URL = "http://158.220.103.189:3001/api/upload";

let currentCooldown = INITIAL_COOLDOWN;
let consecutiveRateLimits = 0;

// Load config
function loadConfig() {
  return JSON.parse(fs.readFileSync("sticker-config-1.json", "utf-8"));
}

// Create browser context with specific auth file
async function createContext(browser, authFile) {
  if (fs.existsSync(authFile)) {
    console.log(`✓ Loading session from ${authFile}...`);
    return await browser.newContext({
      storageState: authFile,
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      viewport: { width: 1920, height: 1080 },
    });
  } else {
    console.log(`${authFile} not found - needs login`);
    return null;
  }
}

// Handle login for new account
async function handleLogin(browser, authFile) {
  console.log(`\n====================================`);
  console.log(`PLEASE LOG IN WITH STEAM FOR: ${authFile}`);
  console.log(`====================================\n`);

  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    viewport: { width: 1920, height: 1080 },
  });

  const page = await context.newPage();
  await page.goto("https://csfloat.com");

  console.log("After logging in, press ENTER here...");
  await new Promise((resolve) => {
    process.stdin.once("data", () => resolve());
  });

  // Save session
  const state = await context.storageState();
  fs.writeFileSync(authFile, JSON.stringify(state, null, 2));
  console.log(`✓ Session saved to ${authFile}!\n`);

  await context.close();
}

// Check if we hit rate limit
async function isRateLimited(page, error) {
  if (error) {
    const errorMsg = error.message || error.toString();
    if (
      errorMsg.includes("429") ||
      errorMsg.includes("rate limit") ||
      errorMsg.includes("too many requests")
    ) {
      return true;
    }
  }

  try {
    const rateLimitIndicators = [
      '.header:has-text("Failed to fetch items")',
      '.sub-text:has-text("making a lot of searches")',
      'span:has-text("Woah, you\'ve been making a lot of searches")',
      'mat-icon:has-text("error")',
    ];

    for (const selector of rateLimitIndicators) {
      const element = await page.locator(selector).first();
      if (await element.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log(`  Detected rate limit message: "${selector}"`);
        return true;
      }
    }
  } catch (e) {
    // Page check failed, not rate limited
  }

  return false;
}

// Check if the combination doesn't exist
async function isNoResults(page, timeout = 10000) {
  // Wait longer for elements to load since they take time to appear
  // Check 1: Standard text check
  const foundNoItems = await page
    .locator("text=Found No Items")
    .isVisible({ timeout })
    .catch(() => false);

  if (foundNoItems) return true;

  // Check 2: "Impossible" text check
  const impossibleText = await page
    .locator("text=impossible")
    .isVisible({ timeout })
    .catch(() => false);

  if (impossibleText) return true;

  // Check 3: Specific header structure (Redundancy)
  const headerNoItems = await page
    .locator('.header span:has-text("Found No Items")')
    .isVisible({ timeout })
    .catch(() => false);

  if (headerNoItems) return true;

  // Check 4: Specific sub-text structure (Redundancy)
  const subTextImpossible = await page
    .locator('.sub-text:has-text("impossible")')
    .isVisible({ timeout })
    .catch(() => false);

  if (subTextImpossible) return true;

  // Check 5: app-error element (most reliable)
  const appError = await page
    .locator('app-error .container .header span:has-text("Found No Items")')
    .isVisible({ timeout })
    .catch(() => false);

  if (appError) return true;

  return false;
}

// Handle rate limit with exponential backoff
async function handleRateLimit(browser, context) {
  consecutiveRateLimits++;

  console.log(`\n⚠️  RATE LIMIT DETECTED (Attempt #${consecutiveRateLimits})`);
  console.log(`⏰ Current cooldown: ${Math.round(currentCooldown / 1000)} seconds`);

  await context.close();

  console.log(`\n🕐 Waiting ${Math.round(currentCooldown / 1000)} seconds...`);

  const startTime = Date.now();
  const countdownInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const remaining = Math.round((currentCooldown - elapsed) / 1000);
    if (remaining > 0 && remaining % 30 === 0) {
      console.log(`   ⏳ ${remaining} seconds remaining...`);
    }
  }, 1000);

  await new Promise((resolve) => setTimeout(resolve, currentCooldown));
  clearInterval(countdownInterval);

  currentCooldown = Math.min(
    currentCooldown * COOLDOWN_MULTIPLIER,
    MAX_COOLDOWN
  );

  console.log(`✓ Cooldown complete`);
  console.log(`🔄 Restarting session...`);

  await browser.close();
  const newBrowser = await chromium.launch({
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const newContext = await createContext(newBrowser, AUTH_FILE);
  const newPage = await newContext.newPage();

  return { browser: newBrowser, context: newContext, page: newPage };
}

// Robust sticker processor with retry logic
async function processStickerWithRetry(sticker, appCounts, state) {
  const result = {
    timestamp: new Date().toISOString(),
    sticker: sticker.name,
    stickerId: sticker.id,
    collection: sticker.collection,
    rarity: sticker.rarity,
    applications: {},
    uploadedToServer: false,
  };

  for (let i = 0; i < appCounts.length; i++) {
    const appCount = appCounts[i];
    let success = false;
    let localRetries = 0;

    while (!success && localRetries < 3) {
      const stickerArray = Array(appCount).fill({ i: sticker.id });
      const stickerParam = encodeURIComponent(JSON.stringify(stickerArray));

      let urlParams = `min=0&max=1&stickers=${stickerParam}`;
      if (sticker.name.includes("(Gold)")) {
        urlParams = `category=1&${urlParams}`;
      }
      const url = `https://csfloat.com/db?${urlParams}`;

      console.log(`  Checking ${appCount}x applications...`);

      try {
        await state.page.goto(url, { timeout: 60000 });
        await state.page.waitForTimeout(3000);

        if (await isRateLimited(state.page)) {
          throw new Error("Rate limit detected");
        }

        // Wait for either the count element OR the no results element to appear
        // This prevents waiting 30 seconds when there are no results
        const noResults = await isNoResults(state.page, 10000);
        if (noResults) {
          console.log(`    ✓ No items (0) - Stopping sticker scrape`);
          result.applications[`${appCount}x`] = 0;

          // Fill remaining with 0
          for (let j = i + 1; j < appCounts.length; j++) {
            result.applications[`${appCounts[j]}x`] = 0;
          }
          return result;
        }

        // If we get here, there should be results - try to get the count
        const countText = await state.page
          .locator(".count.ng-star-inserted")
          .textContent({ timeout: 15000 });
        const match = countText.match(/[\d,]+/);
        const count = match ? parseInt(match[0].replace(/,/g, "")) : 0;

        result.applications[`${appCount}x`] = count;
        console.log(`    ✓ ${count.toLocaleString()} items`);
        success = true;

        // Optimization: If count is 0, don't check higher crafts
        if (count === 0) {
          console.log(`    ✓ Count is 0, skipping higher crafts...`);
          // Fill remaining with 0
          for (let j = i + 1; j < appCounts.length; j++) {
            result.applications[`${appCounts[j]}x`] = 0;
          }
          return result;
        }

        consecutiveRateLimits = 0;
        if (currentCooldown > INITIAL_COOLDOWN)
          currentCooldown = INITIAL_COOLDOWN;

        await state.page.waitForTimeout(REQUEST_DELAY);
      } catch (error) {
        console.log(`    ✗ Error: ${error.message}`);

        const rateLimited = await isRateLimited(state.page, error);
        if (rateLimited) {
          const res = await handleRateLimit(state.browser, state.context);
          state.browser = res.browser;
          state.context = res.context;
          state.page = res.page;
        } else {
          // Check for no results with a quick timeout since we already waited
          const noResults = await isNoResults(state.page, 2000);
          if (noResults) {
            console.log(`    ✓ Detected "no results" - Stopping sticker scrape`);
            result.applications[`${appCount}x`] = 0;

            // Fill remaining with 0 and stop scraping this sticker
            for (let j = i + 1; j < appCounts.length; j++) {
              result.applications[`${appCounts[j]}x`] = 0;
            }
            return result;
          } else {
            localRetries++;
            if (localRetries >= 3) {
              result.applications[`${appCount}x`] = null;
              result.error = error.message;
            }
          }
        }
      }
    }
  }
  return result;
}

// Save results to date-stamped folder
function saveBatchResults(results, collection, rarity) {
  const dateStr = new Date().toISOString().split('T')[0];
  const dir = `data/${dateStr}`;

  if (!fs.existsSync("data")) fs.mkdirSync("data");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);

  const safeCollection = collection.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const filename = `${dir}/${safeCollection}_${rarity}.json`;

  fs.writeFileSync(filename, JSON.stringify(results, null, 2));
  console.log(`✓ Saved batch to ${filename}`);
  return filename;
}

// Upload results to backend
async function uploadResults(results) {
  try {
    console.log("📤 Uploading results to backend...", results);
    // Use dynamic import for fetch if node version supports it, or just use axios if available.
    // Since I don't want to mess with dependencies, I'll use the built-in fetch (Node 18+) or assume axios is there.
    // The user has `npm run dev` running, so likely a modern node env.
    // Let's try native fetch first.

    const response = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(results),
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`✓ Upload successful: ${data.count} items processed`);
      return true;
    } else {
      console.error(`✗ Upload failed: ${response.status} ${response.statusText}`);
      const text = await response.text();
      console.error(`  Response: ${text}`);
      return false;
    }
  } catch (error) {
    console.error(`✗ Upload error: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log("=== CS:GO Sticker Application Scraper (Batch Mode) ===");

  const config = loadConfig();
  const state = {
    browser: null,
    context: null,
    page: null,
  };

  let stickersProcessed = 0;

  try {
    state.browser = await chromium.launch({
      headless: false,
      args: ["--disable-blink-features=AutomationControlled"],
    });

    if (!fs.existsSync(AUTH_FILE)) {
      await handleLogin(state.browser, AUTH_FILE);
    }

    state.context = await createContext(state.browser, AUTH_FILE);
    state.page = await state.context.newPage();

    for (const [collectionName, rarities] of Object.entries(config.collections)) {
      console.log(`\n📦 Collection: ${collectionName}`);

      for (const [rarity, items] of Object.entries(rarities)) {
        console.log(`  💎 Rarity: ${rarity} (${items.length} items)`);

        // Check if batch already exists
        const dateStr = new Date().toISOString().split('T')[0];
        const safeCollection = collectionName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const filename = `data/${dateStr}/${safeCollection}_${rarity}.json`;

        // Load existing results (partial or complete)
        let existingResults = [];
        let scrapedStickerIds = new Set();

        if (fs.existsSync(filename)) {
          existingResults = JSON.parse(fs.readFileSync(filename, "utf-8"));
          scrapedStickerIds = new Set(existingResults.map(r => r.stickerId));

          // Check if batch is complete
          if (existingResults.length === items.length) {
            const allUploaded = existingResults.every(r => r.uploadedToServer);
            if (allUploaded) {
              console.log(`  ✓ Batch complete and uploaded (${existingResults.length}/${items.length}). Skipping.`);
              continue;
            } else {
              console.log(`  ⚠️  Batch complete but not uploaded. Re-uploading...`);
              const uploadSuccess = await uploadResults(existingResults);
              if (uploadSuccess) {
                console.log("  ✓ Marking items as uploaded...");
                existingResults.forEach(r => r.uploadedToServer = true);
                saveBatchResults(existingResults, collectionName, rarity);
              }
              continue;
            }
          } else {
            // Partial batch - resume from where we left off
            console.log(`  📋 Found partial batch: ${existingResults.length}/${items.length} stickers completed. Resuming...`);
          }
        }

        const batchResults = [];

        for (let i = 0; i < items.length; i++) {
          const sticker = items[i];

          // Skip already-scraped stickers
          if (scrapedStickerIds.has(sticker.id)) {
            console.log(`\n    [${i + 1}/${items.length}] ⏭️  Skipping (already scraped): ${sticker.name}`);
            continue;
          }

          console.log(`\n    [${i + 1}/${items.length}] Scraping: ${sticker.name}`);

          const stickerWithMeta = { ...sticker, collection: collectionName, rarity };
          const result = await processStickerWithRetry(stickerWithMeta, [1, 2, 3, 4, 5], state);
          batchResults.push(result);

          // Save incrementally (merge with existing and save after each sticker)
          const allResults = [...existingResults, ...batchResults];
          saveBatchResults(allResults, collectionName, rarity);

          stickersProcessed++;
          if (stickersProcessed % 10 === 0) {
            console.log(`\n💤 Processed ${stickersProcessed} stickers. Sleeping for 10 minutes...`);
            await new Promise(resolve => setTimeout(resolve, 600000));
            console.log("✓ Resuming scrape...\n");
          }
        }

        // Final merge and save
        const allResults = [...existingResults, ...batchResults];
        saveBatchResults(allResults, collectionName, rarity);

        console.log(`Debug: batchResults type: ${typeof batchResults}, isArray: ${Array.isArray(batchResults)}, length: ${batchResults ? batchResults.length : 'N/A'}`);

        // Upload complete batch (only newly scraped items)
        if (batchResults.length > 0) {
          const uploadSuccess = await uploadResults(batchResults);

          // Mark as uploaded in the saved file
          if (uploadSuccess) {
            console.log("Marking items as uploaded...");
            batchResults.forEach(r => r.uploadedToServer = true);

            // Save with all results merged
            const allResults = [...existingResults, ...batchResults];
            saveBatchResults(allResults, collectionName, rarity);
          }
        } else {
          console.log("  ℹ️  No new stickers scraped in this batch.");
        }

        // Timeout between batches
        // console.log(`\n💤 Batch complete. Sleeping for ${BATCH_SLEEP_DURATION / 1000} seconds...`);
        // await new Promise(resolve => setTimeout(resolve, BATCH_SLEEP_DURATION));
      }
    }

    console.log("\n=== All Collections Scraped ===");
    await state.browser.close();

  } catch (error) {
    console.error("\n❌ Fatal error:", error);
    if (state.browser) await state.browser.close();
  }
}

main().catch(console.error);