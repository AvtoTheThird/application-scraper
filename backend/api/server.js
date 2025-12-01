
const express = require("express");
const cors = require("cors");
const {
  getLatestApplications,
  getStickerHistory,
  calculateGrowthMetrics,
  getTopGrowingStickers,
  pool,
} = require("../db/database");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Get all stickers with latest data
app.get("/api/stickers", async (req, res) => {
  try {
    const data = await getLatestApplications();

    // Group by sticker
    const grouped = {};
    data.forEach((row) => {
      if (!grouped[row.sticker_id]) {
        grouped[row.sticker_id] = {
          id: row.sticker_id,
          name: row.name,
          collection: row.collection,
          rarity: row.rarity,
          applications: {},
        };
      }
      if (row.application_type) {
        grouped[row.sticker_id].applications[row.application_type] = {
          count: row.count,
          scraped_at: row.scraped_at,
        };
      }
    });

    res.json(Object.values(grouped));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Database error" });
  }
});

// Receive scraped data
app.post("/api/upload", async (req, res) => {
  try {
    const results = req.body;

    if (!Array.isArray(results)) {
      return res.status(400).json({ error: "Invalid data format. Expected array of results." });
    }

    console.log(`\n📥 Received upload of ${results.length} items`);

    // Insert into database
    const { insertScrapeResults } = require("../db/database");
    await insertScrapeResults(results);

    res.json({ success: true, count: results.length });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Failed to process upload" });
  }
});

// Get history for specific sticker
app.get("/api/stickers/:id/history", async (req, res) => {
  try {
    const { id } = req.params;
    const days = parseInt(req.query.days) || 30;

    const history = await getStickerHistory(id, days);

    // Group by application type
    const grouped = {};
    history.forEach((row) => {
      if (!grouped[row.application_type]) {
        grouped[row.application_type] = [];
      }
      grouped[row.application_type].push({
        count: row.count,
        timestamp: row.scraped_at,
      });
    });

    res.json(grouped);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Database error" });
  }
});

// Get growth metrics for specific sticker
app.get("/api/stickers/:id/metrics", async (req, res) => {
  try {
    const { id } = req.params;
    const metrics = await calculateGrowthMetrics(id);
    res.json(metrics);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Database error" });
  }
});

// Get top growing stickers
app.get("/api/trending", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const trending = await getTopGrowingStickers(limit);
    res.json(trending);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Database error" });
  }
});

// Get stickers by collection
app.get("/api/collections/:collection", async (req, res) => {
  try {
    const { collection } = req.params;
    const result = await pool.query(
      `SELECT s.*, 
        (SELECT json_object_agg(application_type, count)
         FROM (
           SELECT DISTINCT ON (application_type) application_type, count
           FROM application_snapshots
           WHERE sticker_id = s.sticker_id
           ORDER BY application_type, scraped_at DESC
         ) sub
        ) as applications
       FROM stickers s
       WHERE collection = $1
       ORDER BY rarity, name`,
      [collection]
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Database error" });
  }
});

app.listen(PORT, () => {
  console.log(`✓ API server running on http://localhost:${PORT}`);
});