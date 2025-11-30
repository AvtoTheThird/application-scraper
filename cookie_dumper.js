const { chromium } = require("playwright");
const fs = require("fs");
const readline = require("readline");

// Simple async question wrapper
function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer));
  });
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function dumpCookies() {
  console.log("=== CSFloat Cookie Dumper ===\n");

  // Ask for filename
  let filename = await ask("Save cookies as (e.g., auth.json): ");
  if (!filename.endsWith(".json")) filename += ".json";

  console.log(`\nWill save cookies to: ${filename}\n`);

  // Launch browser
  const browser = await chromium.launch({
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    viewport: { width: 1920, height: 1080 },
  });

  const page = await context.newPage();

  console.log("🌐 Opening CSFloat…\n");
  await page.goto("https://csfloat.com");

  console.log("====================================");
  console.log(" PLEASE LOG IN WITH STEAM");
  console.log("====================================");
  console.log("1. Click 'Login with Steam'");
  console.log("2. Complete authentication");
  console.log("3. Wait for CSFloat to load");
  console.log("4. Press ENTER here when done");
  console.log("====================================\n");

  await ask(""); // wait for ENTER

  // Save cookies
  console.log("\n💾 Saving cookies...");
  const state = await context.storageState();
  fs.writeFileSync(filename, JSON.stringify(state, null, 2));

  console.log(`\n✅ Cookies saved to: ${filename}`);
  console.log(`🍪 Cookies captured: ${state.cookies.length}`);
  console.log(`📂 Origins found: ${state.origins.length}`);

  if (state.cookies.length > 0) {
    console.log(`\nYou can now use this file with your scraper:`);
    console.log(`   const AUTH_FILES = ["${filename}"];`);
  } else {
    console.log(`⚠️ No cookies detected — maybe login failed?`);
  }

  await browser.close();
  rl.close();
  console.log("\nDone!\n");
}

dumpCookies().catch((err) => {
  console.error("❌ Error:", err);
  try {
    rl.close();
  } catch {}
  process.exit(1);
});
