const { chromium } = require("playwright");
const fs = require("fs");

// Configuration
const AUTH_FILE = "auth.json";
const INITIAL_COOLDOWN = 630000; // 6 minutes in milliseconds
const MAX_COOLDOWN = 1800000; // 30 minutes max
const COOLDOWN_MULTIPLIER = 1.5; // Increase cooldown by 50% each time
const REQUEST_DELAY = 8000; // 8 seconds between requests (increased from 3)
const BATCH_SIZE = 20;
const BATCH_SLEEP_DURATION = 600000; // 3 minutes in milliseconds

let currentCooldown = INITIAL_COOLDOWN;
let consecutiveRateLimits = 0;

// Load stickers from config file
function loadStickers() {
  const config = JSON.parse(fs.readFileSync("stickers-config.json", "utf-8"));
  const stickers = [];

  for (const [collectionName, rarities] of Object.entries(config.collections)) {
    for (const [rarity, items] of Object.entries(rarities)) {
      items.forEach((sticker) => {
        stickers.push({
          ...sticker,
          collection: collectionName,
          rarity: rarity,
        });
      });
    }
  }

  return stickers;
}

// Load progress from file (resume capability)
function loadProgress() {
  try {
    if (fs.existsSync("scrape-progress.json")) {
      return JSON.parse(fs.readFileSync("scrape-progress.json", "utf-8"));
    }
  } catch (e) {
    console.log("Could not load progress, starting fresh");
  }
  return { completedStickers: [], results: [] };
}

// Save progress
function saveProgress(progress) {
  fs.writeFileSync("scrape-progress.json", JSON.stringify(progress, null, 2));
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

// Check if we hit rate limit - now checks page content too
async function isRateLimited(page, error) {
  // Check error message
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

  // Check for CSFloat's specific rate limit message in page content
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
async function isNoResults(page) {
  // Try to detect the "Found No Items" message directly
  const foundNoItems = await page
    .locator("text=Found No Items")
    .isVisible({ timeout: 2000 })
    .catch(() => false);

  if (foundNoItems) return true;

  // Backup check: detect the sub-text
  const impossibleText = await page
    .locator("text=impossible")
    .isVisible({ timeout: 2000 })
    .catch(() => false);

  if (impossibleText) return true;

  return false;
}

// Handle rate limit with exponential backoff
async function handleRateLimit(browser, context) {
  consecutiveRateLimits++;

  console.log(`\n⚠️  RATE LIMIT DETECTED (Attempt #${consecutiveRateLimits})`);
  console.log(`⚠️  CSFloat is rate limiting by IP address, not by account`);
  console.log(
    `⏰ Current cooldown: ${Math.round(currentCooldown / 1000)} seconds`
  );

  // Close current context
  await context.close();

  // Wait with exponential backoff
  console.log(`\n🕐 Waiting ${Math.round(currentCooldown / 1000)} seconds...`);

  // Show countdown
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

  // Increase cooldown for next time (exponential backoff)
  currentCooldown = Math.min(
    currentCooldown * COOLDOWN_MULTIPLIER,
    MAX_COOLDOWN
  );

  console.log(`✓ Cooldown complete`);
  if (consecutiveRateLimits > 2) {
    console.log(
      `⚠️  Next cooldown will be: ${Math.round(currentCooldown / 1000)} seconds`
    );
  }

  // Restart browser session
  console.log(`🔄 Restarting session...`);

  // Close and restart browser
  await browser.close();
  const newBrowser = await chromium.launch({
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const newContext = await createContext(newBrowser, AUTH_FILE);
  const newPage = await newContext.newPage();

  return { browser: newBrowser, context: newContext, page: newPage };
}

// Main scraping function with account rotation
async function scrapeCSFloat(stickers, maxApplications = 5) {
  const progress = loadProgress();

  // 1. Identify completely new stickers to scrape
  const remainingStickers = stickers.filter(
    (s) => !progress.completedStickers.includes(s.id)
  );

  console.log(`\n=== Resuming Scrape ===`);
  console.log(`Total stickers: ${stickers.length}`);
  console.log(`Already completed: ${progress.completedStickers.length}`);
  console.log(`Remaining new: ${remainingStickers.length}\n`);

  // State object to be shared
  const state = {
    browser: null,
    context: null,
    page: null,
  };

  try {
    // Initialize first browser
    state.browser = await chromium.launch({
      headless: false,
      args: ["--disable-blink-features=AutomationControlled"],
    });

    // Ensure auth file exists (or prompt for login)
    if (!fs.existsSync(AUTH_FILE)) {
      await handleLogin(state.browser, AUTH_FILE);
    }

    // Start with account
    state.context = await createContext(state.browser, AUTH_FILE);
    state.page = await state.context.newPage();

    // PHASE 1: Process remaining new stickers
    if (remainingStickers.length > 0) {
      console.log("\n--- Phase 1: Scraping New Stickers ---");
      for (let i = 0; i < remainingStickers.length; i++) {
        const sticker = remainingStickers[i];
        console.log(
          `[${progress.completedStickers.length + 1}/${stickers.length}]`
        );

        // Scrape all application counts (1x to 5x)
        const appCounts = Array.from(
          { length: maxApplications },
          (_, i) => i + 1
        );

        // We need to handle the retry logic for rate limits inside the loop properly.
        // Since I refactored processSticker to take a list, let's use that.
        // But wait, the original code had retry logic inside the loop.
        // My processSticker implementation above has a flaw: it doesn't retry the current item on rate limit properly because it's a for..of loop.
        // Let's fix that by calling a robust version of processSticker or handling it here.
        // Actually, let's just use a robust loop inside processSticker.

        // Let's fix processSticker logic first.
        // I will inline the fix in the next tool call or just rewrite this block to be correct.
        // For now, let's assume I'll fix the loop logic in processSticker in a follow-up or rewrite it now.
        // I'll rewrite the processSticker function to be robust before using it here.

        await processStickerWithRetry(sticker, appCounts, state, progress);

        // Mark sticker as completed
        if (!progress.completedStickers.includes(sticker.id)) {
          progress.completedStickers.push(sticker.id);
          saveProgress(progress);
        }

        // Sleep after every BATCH_SIZE stickers
        if ((i + 1) % BATCH_SIZE === 0 && i + 1 < remainingStickers.length) {
          console.log(
            `\n💤 Sleeping for ${
              BATCH_SLEEP_DURATION / 1000
            } seconds after ${BATCH_SIZE} stickers...`
          );
          await new Promise((resolve) =>
            setTimeout(resolve, BATCH_SLEEP_DURATION)
          );
          console.log("✓ Resuming scrape...\n");
        }
      }
    } else {
      console.log("✓ All stickers already scraped!");
    }

    // PHASE 2: Re-scrape null values
    console.log("\n--- Phase 2: Checking for Null Values to Re-scrape ---");
    let stickersWithNulls = [];

    // Find stickers that have null values
    for (const result of progress.results) {
      const nullApps = [];
      if (result.applications) {
        for (const [app, count] of Object.entries(result.applications)) {
          if (count === null) {
            // Extract number from "1x", "2x" etc
            const appCount = parseInt(app.replace("x", ""));
            if (!isNaN(appCount)) {
              nullApps.push(appCount);
            }
          }
        }
      }

      if (nullApps.length > 0) {
        stickersWithNulls.push({
          id: result.stickerId,
          name: result.sticker,
          collection: result.collection,
          rarity: result.rarity,
          nullApps: nullApps,
        });
      }
    }

    console.log(`Found ${stickersWithNulls.length} stickers with null values.`);

    for (let i = 0; i < stickersWithNulls.length; i++) {
      const item = stickersWithNulls[i];
      console.log(
        `\n[${i + 1}/${stickersWithNulls.length}] Re-scraping nulls for ${
          item.name
        }...`
      );
      console.log(`  Missing counts: ${item.nullApps.join(", ")}x`);

      await processStickerWithRetry(item, item.nullApps, state, progress);
    }

    await state.browser.close();
    return progress.results;
  } catch (error) {
    console.error("\n❌ Fatal error:", error);
    if (state.browser) await state.browser.close();
    throw error;
  }
}

// Robust sticker processor with retry logic
async function processStickerWithRetry(sticker, appCounts, state, progress) {
  // Find or create result object
  let stickerResults = progress.results.find((r) => r.stickerId === sticker.id);
  if (!stickerResults) {
    stickerResults = {
      timestamp: new Date().toISOString(),
      sticker: sticker.name,
      stickerId: sticker.id,
      collection: sticker.collection,
      rarity: sticker.rarity,
      applications: {},
    };
    progress.results.push(stickerResults);
  }
  if (!stickerResults.applications) stickerResults.applications = {};

  for (let i = 0; i < appCounts.length; i++) {
    const appCount = appCounts[i];
    let success = false;
    let localRetries = 0;

    while (!success && localRetries < 3) {
      // Retry a few times for this specific count if needed
      const stickerArray = Array(appCount).fill({ i: sticker.id });
      const stickerParam = encodeURIComponent(JSON.stringify(stickerArray));
      const url = `https://csfloat.com/db?min=0&max=1&stickers=${stickerParam}`;

      console.log(`  Checking ${appCount}x applications...`);

      try {
        await state.page.goto(url, { timeout: 60000 });
        await state.page.waitForTimeout(3000);

        if (await isRateLimited(state.page)) {
          throw new Error("Rate limit detected");
        }

        const noResults = await isNoResults(state.page);
        if (noResults) {
          console.log(`    ✓ No items (0)`);
          stickerResults.applications[`${appCount}x`] = 0;
          success = true;
        } else {
          const countText = await state.page
            .locator(".count.ng-star-inserted")
            .textContent({ timeout: 30000 });
          const match = countText.match(/[\d,]+/);
          const count = match ? parseInt(match[0].replace(/,/g, "")) : 0;

          stickerResults.applications[`${appCount}x`] = count;
          console.log(`    ✓ ${count.toLocaleString()} items`);
          success = true;
        }

        // Success cleanup
        consecutiveRateLimits = 0;
        if (currentCooldown > INITIAL_COOLDOWN)
          currentCooldown = INITIAL_COOLDOWN;

        // Save
        saveProgress(progress);
        saveIncrementalResults(progress.results);

        await state.page.waitForTimeout(REQUEST_DELAY);
      } catch (error) {
        console.log(`    ✗ Error: ${error.message}`);

        const rateLimited = await isRateLimited(state.page, error);
        if (rateLimited) {
          const result = await handleRateLimit(state.browser, state.context);
          state.browser = result.browser;
          state.context = result.context;
          state.page = result.page;
          // Don't increment localRetries for rate limits, just retry indefinitely (or until max global retries)
          // But we should be careful not to loop forever.
          // handleRateLimit handles the waiting. We just loop back.
        } else {
          // Non-rate limit error
          // Check for "no results" one last time
          const noResults = await isNoResults(state.page);
          if (noResults) {
            console.log(`    ✓ Detected "no results" after error`);
            stickerResults.applications[`${appCount}x`] = 0;
            success = true;
            saveProgress(progress);
            saveIncrementalResults(progress.results);
          } else {
            localRetries++;
            if (localRetries >= 3) {
              stickerResults.applications[`${appCount}x`] = null;
              stickerResults.error = error.message;
            }
          }
        }
      }
    }
  }
}

// Save results incrementally to latest.json
function saveIncrementalResults(results) {
  try {
    // Ensure directories exist
    if (!fs.existsSync("data")) fs.mkdirSync("data");
    if (!fs.existsSync("data/raw")) fs.mkdirSync("data/raw");

    // Save to latest.json
    fs.writeFileSync("data/latest.json", JSON.stringify(results, null, 2));
  } catch (error) {
    console.error("Failed to save incremental results:", error.message);
  }
}

// Save results to timestamped file
function saveResults(results) {
  const timestamp = new Date().toISOString().replace(/:/g, "-").split(".")[0];
  const filename = `data/raw/scrape-${timestamp}.json`;

  // Ensure directories exist
  if (!fs.existsSync("data")) fs.mkdirSync("data");
  if (!fs.existsSync("data/raw")) fs.mkdirSync("data/raw");

  fs.writeFileSync(filename, JSON.stringify(results, null, 2));
  console.log(`\n✓ Results saved to ${filename}`);

  // Also save to "latest.json" for easy access
  fs.writeFileSync("data/latest.json", JSON.stringify(results, null, 2));
  console.log(`✓ Latest results saved to data/latest.json`);

  // Clean up progress file
  if (fs.existsSync("scrape-progress.json")) {
    fs.unlinkSync("scrape-progress.json");
    console.log(`✓ Progress file cleaned up`);
  }

  return filename;
}

// Run the scraper
async function main() {
  console.log("=== CS:GO Sticker Application Scraper ===");
  console.log("=== Single Account Mode ===\n");

  const stickers = loadStickers();
  console.log(`Loaded ${stickers.length} stickers from config\n`);

  const MAX_APPLICATIONS = 5;

  const results = await scrapeCSFloat(stickers, MAX_APPLICATIONS);

  console.log("\n=== Scraping Complete ===");
  console.log(`Total stickers scraped: ${results.length}`);

  saveResults(results);

  // Print summary
  console.log("\n=== Summary ===");
  results.slice(0, 5).forEach((r) => {
    console.log(`\n${r.sticker}:`);
    Object.entries(r.applications).forEach(([key, value]) => {
      console.log(`  ${key}: ${value ? value.toLocaleString() : "N/A"}`);
    });
  });

  console.log("\n... and more. Check the JSON file for complete data.");
}

main().catch(console.error);
