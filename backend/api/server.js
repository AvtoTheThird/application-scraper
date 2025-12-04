
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

// Scraper Control
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

let scraperProcess = null;
let scraperStatus = {
  status: "stopped", // stopped, running, error
  message: "Ready to start",
  currentSticker: null,
  progress: 0,
  total: 0,
  logs: [],
};

// Helper to add log
function addLog(message) {
  const timestamp = new Date().toLocaleTimeString();
  scraperStatus.logs.unshift(`[${timestamp}] ${message}`);
  if (scraperStatus.logs.length > 100) scraperStatus.logs.pop();
}

// Get available collections
app.get("/api/collections", (req, res) => {
  try {
    const configPath = path.join(__dirname, "../../stickers-config.json");
    if (!fs.existsSync(configPath)) {
      return res.status(404).json({ error: "Config file not found" });
    }
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const collections = Object.keys(config.collections);
    res.json(collections);
  } catch (error) {
    console.error("Error reading config:", error);
    res.status(500).json({ error: "Failed to load collections" });
  }
});

// Start scraper
app.post("/api/scraper/start", (req, res) => {
  if (scraperProcess) {
    return res.status(400).json({ error: "Scraper is already running" });
  }

  const { collections } = req.body; // Array of collection names

  scraperStatus = {
    status: "running",
    message: "Starting scraper...",
    currentSticker: null,
    progress: 0,
    total: 0,
    logs: [],
  };
  addLog("Starting scraper process...");

  const scraperPath = path.join(__dirname, "../../scraper.js");
  const args = [];

  if (collections && collections.length > 0) {
    args.push(`--collections=${collections.join(",")}`);
  }

  scraperProcess = spawn("node", [scraperPath, ...args], {
    cwd: path.join(__dirname, "../../"),
    stdio: ["ignore", "pipe", "pipe"],
  });

  scraperProcess.stdout.on("data", (data) => {
    const output = data.toString().trim();
    console.log(`[Scraper] ${output}`);
    // Parse output for logs if needed, but we rely on API calls for status
    if (output) addLog(output);
  });

  scraperProcess.stderr.on("data", (data) => {
    const output = data.toString().trim();
    console.error(`[Scraper Error] ${output}`);
    addLog(`Error: ${output}`);
  });

  scraperProcess.on("close", (code) => {
    console.log(`[Scraper] Process exited with code ${code}`);
    scraperProcess = null;
    scraperStatus.status = code === 0 ? "stopped" : "error";
    scraperStatus.message = code === 0 ? "Scraper finished successfully" : "Scraper exited with error";
    addLog(`Scraper finished (Exit code: ${code})`);
  });

  res.json({ success: true, message: "Scraper started" });
});

// Stop scraper
app.post("/api/scraper/stop", (req, res) => {
  if (!scraperProcess) {
    return res.status(400).json({ error: "Scraper is not running" });
  }

  addLog("Stopping scraper...");
  scraperProcess.kill("SIGTERM");
  // Force kill if it doesn't stop in 5 seconds
  setTimeout(() => {
    if (scraperProcess) {
      addLog("Force killing scraper...");
      scraperProcess.kill("SIGKILL");
    }
  }, 5000);

  res.json({ success: true, message: "Stop signal sent" });
});

// Get scraper status
app.get("/api/scraper/status", (req, res) => {
  res.json(scraperStatus);
});

// Report progress (called by scraper)
app.post("/api/scraper/progress", (req, res) => {
  const { message, currentSticker, progress, total } = req.body;

  if (message) scraperStatus.message = message;
  if (currentSticker) scraperStatus.currentSticker = currentSticker;
  if (progress !== undefined) scraperStatus.progress = progress;
  if (total !== undefined) scraperStatus.total = total;

  res.json({ success: true });
});

// Data Management Endpoints

// Get list of date folders
app.get("/api/data", (req, res) => {
  try {
    const dataPath = path.join(__dirname, "../../data");
    if (!fs.existsSync(dataPath)) {
      return res.json([]);
    }

    const folders = fs.readdirSync(dataPath)
      .filter(file => fs.statSync(path.join(dataPath, file)).isDirectory())
      .sort()
      .reverse(); // Newest first

    res.json(folders);
  } catch (error) {
    console.error("Error listing data folders:", error);
    res.status(500).json({ error: "Failed to list data folders" });
  }
});

// Get files in a date folder with status
app.get("/api/data/:date", (req, res) => {
  try {
    const { date } = req.params;
    const folderPath = path.join(__dirname, "../../data", date);

    if (!fs.existsSync(folderPath)) {
      return res.status(404).json({ error: "Folder not found" });
    }

    const files = fs.readdirSync(folderPath)
      .filter(file => file.endsWith(".json"))
      .map(file => {
        const filePath = path.join(folderPath, file);
        try {
          const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
          const totalItems = Array.isArray(content) ? content.length : 0;
          const uploadedCount = Array.isArray(content) ? content.filter(i => i.uploadedToServer).length : 0;

          let status = "pending";
          if (totalItems > 0) {
            if (uploadedCount === totalItems) status = "uploaded";
            else if (uploadedCount > 0) status = "partial";
          }

          return {
            filename: file,
            totalItems,
            uploadedCount,
            status
          };
        } catch (e) {
          return {
            filename: file,
            totalItems: 0,
            uploadedCount: 0,
            status: "error",
            error: "Invalid JSON"
          };
        }
      });

    res.json(files);
  } catch (error) {
    console.error("Error listing data files:", error);
    res.status(500).json({ error: "Failed to list data files" });
  }
});

// Manually upload a file
app.post("/api/data/upload", async (req, res) => {
  try {
    const { date, filename } = req.body;
    const filePath = path.join(__dirname, "../../data", date, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File not found" });
    }

    const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    if (!Array.isArray(content)) {
      return res.status(400).json({ error: "Invalid file format" });
    }

    // Filter items that are NOT uploaded yet
    // Actually, for manual upload, we might want to re-upload everything or just missing ones.
    // Let's just upload everything to be safe, the DB should handle duplicates (upsert).
    // But to be efficient, let's filter if possible.
    // The user request implies "manually upload if they are not uploaded".

    console.log(`\n📥 Manual upload request for ${filename} (${content.length} items)`);

    // Insert into database
    // const { insertScrapeResults } = require("../db/database");
    // await insertScrapeResults(content);

    // Forward to remote server
    const REMOTE_API_URL = "https://api.cs2stickertracker.com/api/upload";
    console.log(`Forwarding upload to ${REMOTE_API_URL}...`);

    const response = await fetch(REMOTE_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(content),
    });

    if (!response.ok) {
      throw new Error(`Remote upload failed: ${response.status} ${response.statusText}`);
    }

    const remoteData = await response.json();
    console.log(`✓ Remote upload successful: ${remoteData.count} items`);

    // Mark all as uploaded
    content.forEach(r => r.uploadedToServer = true);
    fs.writeFileSync(filePath, JSON.stringify(content, null, 2));

    res.json({ success: true, count: content.length });
  } catch (error) {
    console.error("Manual upload error:", error);
    res.status(500).json({ error: "Failed to process upload" });
  }
});

app.listen(PORT, () => {
  console.log(`✓ API server running on http://localhost:${PORT}`);
});