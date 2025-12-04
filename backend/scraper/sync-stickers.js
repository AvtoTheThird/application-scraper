
const fs = require("fs");
const path = require("path");
const { pool, initializeStickers } = require("../db/database");

async function syncStickers() {
    const client = await pool.connect();
    try {
        console.log("📝 Loading stickers config...");
        const configPath = path.join(__dirname, "../../stickers-config.json");

        if (!fs.existsSync(configPath)) {
            throw new Error(`Config file not found at ${configPath}`);
        }

        const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

        console.log("🔄 Syncing stickers to database...");
        await initializeStickers(config);

        console.log("✨ Stickers synced successfully!");
        process.exit(0);
    } catch (error) {
        console.error("❌ Sync failed:", error);
        process.exit(1);
    } finally {
        client.release();
    }
}

syncStickers();
