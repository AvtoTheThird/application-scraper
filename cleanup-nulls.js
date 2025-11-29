// FILE: cleanup-nulls.js
// Standalone script to find and fix null values in scrape progress

const fs = require("fs");

function loadProgress() {
  if (!fs.existsSync("scrape-progress.json")) {
    console.log("❌ No scrape-progress.json found");
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync("scrape-progress.json", "utf-8"));
}

function findStickersWithNulls(progress) {
  const issues = [];
  
  progress.results.forEach(result => {
    const nullApps = Object.entries(result.applications)
      .filter(([key, val]) => val === null)
      .map(([key]) => key);
    
    if (nullApps.length > 0) {
      issues.push({
        stickerId: result.stickerId,
        name: result.sticker,
        collection: result.collection,
        rarity: result.rarity,
        nullApplications: nullApps,
        allApplications: result.applications
      });
    }
  });
  
  return issues;
}

function removeStickersFromProgress(progress, stickerIds) {
  progress.completedStickers = progress.completedStickers.filter(
    id => !stickerIds.includes(id)
  );
  progress.results = progress.results.filter(
    r => !stickerIds.includes(r.stickerId)
  );
  return progress;
}

function main() {
  console.log("=== Null Value Cleanup Tool ===\n");
  
  const progress = loadProgress();
  const issues = findStickersWithNulls(progress);
  
  if (issues.length === 0) {
    console.log("✅ No null values found! All data is clean.\n");
    process.exit(0);
  }
  
  console.log(`Found ${issues.length} stickers with NULL values:\n`);
  
  // Display detailed report
  issues.forEach((issue, index) => {
    console.log(`${index + 1}. ${issue.name} (${issue.stickerId})`);
    console.log(`   Collection: ${issue.collection} - ${issue.rarity}`);
    console.log(`   NULL values in: ${issue.nullApplications.join(", ")}`);
    console.log(`   Current data:`);
    Object.entries(issue.allApplications).forEach(([key, val]) => {
      const status = val === null ? "❌ NULL" : val === 0 ? "⚠️  0" : `✅ ${val.toLocaleString()}`;
      console.log(`     ${key}: ${status}`);
    });
    console.log("");
  });
  
  console.log("=== Options ===");
  console.log("1. Mark ALL for re-scraping (remove from progress)");
  console.log("2. Mark specific stickers for re-scraping");
  console.log("3. Convert all NULL values to 0 (assume no results)");
  console.log("4. Exit without changes\n");
  
  process.stdout.write("Choose option (1-4): ");
  
  process.stdin.once("data", (data) => {
    const choice = data.toString().trim();
    
    if (choice === "1") {
      // Remove all stickers with nulls from progress
      const stickerIds = issues.map(i => i.stickerId);
      const updated = removeStickersFromProgress(progress, stickerIds);
      fs.writeFileSync("scrape-progress.json", JSON.stringify(updated, null, 2));
      
      console.log(`\n✅ Marked ${issues.length} stickers for re-scraping`);
      console.log("Run scraper.js to re-scrape these stickers\n");
      
    } else if (choice === "2") {
      console.log("\nEnter sticker numbers to re-scrape (comma-separated, e.g., 1,3,5):");
      process.stdin.once("data", (data) => {
        const numbers = data.toString().trim().split(",").map(n => parseInt(n.trim()) - 1);
        const stickerIds = numbers
          .filter(n => n >= 0 && n < issues.length)
          .map(n => issues[n].stickerId);
        
        if (stickerIds.length === 0) {
          console.log("No valid sticker numbers provided");
          process.exit(0);
        }
        
        const updated = removeStickersFromProgress(progress, stickerIds);
        fs.writeFileSync("scrape-progress.json", JSON.stringify(updated, null, 2));
        
        console.log(`\n✅ Marked ${stickerIds.length} stickers for re-scraping`);
        console.log("Run scraper.js to re-scrape these stickers\n");
        process.exit(0);
      });
      
    } else if (choice === "3") {
      // Convert all null to 0
      progress.results.forEach(result => {
        Object.keys(result.applications).forEach(key => {
          if (result.applications[key] === null) {
            result.applications[key] = 0;
          }
        });
      });
      
      fs.writeFileSync("scrape-progress.json", JSON.stringify(progress, null, 2));
      
      // Also update latest.json
      if (fs.existsSync("data/latest.json")) {
        fs.writeFileSync("data/latest.json", JSON.stringify(progress.results, null, 2));
      }
      
      console.log(`\n✅ Converted all NULL values to 0`);
      console.log("Updated: scrape-progress.json and data/latest.json\n");
      process.exit(0);
      
    } else {
      console.log("\nNo changes made");
      process.exit(0);
    }
  });
}

main();