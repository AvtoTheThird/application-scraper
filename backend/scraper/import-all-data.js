
const fs = require("fs");
const path = require("path");
const {
    pool,
    initializeStickers,
    insertScrapeResults,
} = require("../db/database");

async function importAllData() {
    const client = await pool.connect();
    try {
        console.log("⚠️  Starting full data import...");

        // 1. Clear existing data
        console.log("🗑️  Clearing existing database tables...");
        await client.query("TRUNCATE TABLE daily_metrics, application_snapshots, stickers CASCADE");
        console.log("✓ Database cleared");

        // 2. Initialize stickers
        console.log("📝 Initializing stickers from config...");
        const configPath = path.join(__dirname, "../../stickers-config.json");
        const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        await initializeStickers(config);

        // 3. Get all raw data files
        const rawDataDir = path.join(__dirname, "../../data/raw");
        const files = fs.readdirSync(rawDataDir).filter(file => file.endsWith(".json"));

        // 4. Sort files chronologically
        // Filename format: scrape-YYYY-MM-DDTHH-mm-ss.json
        files.sort();

        console.log(`Found ${files.length} data files to import.`);

        // 5. Import each file
        for (const file of files) {
            console.log(`\n📦 Importing ${file}...`);
            const filePath = path.join(rawDataDir, file);
            const scrapeData = JSON.parse(fs.readFileSync(filePath, "utf-8"));

            await insertScrapeResults(scrapeData);
        }

        console.log("\n✨ All data imported successfully!");
        process.exit(0);

    } catch (error) {
        console.error("\n❌ Import failed:", error);
        process.exit(1);
    } finally {
        client.release();
    }
}

importAllData();
