
const fs = require("fs");
const {
  initializeStickers,
  insertScrapeResults,
} = require("../db/database");

async function importLatestScrape() {
  try {
    // Load config first
    const config = JSON.parse(
      fs.readFileSync("../../stickers-config.json", "utf-8")
    );
    await initializeStickers(config);

    // Load and import latest scrape
    const scrapeData = JSON.parse(fs.readFileSync("../../data/latest.json", "utf-8"));
    await insertScrapeResults(scrapeData);

    console.log("✓ Data import complete!");
    process.exit(0);
  } catch (error) {
    console.error("Import failed:", error);
    process.exit(1);
  }
}

importLatestScrape();