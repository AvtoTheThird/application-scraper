const { Pool } = require("pg");

const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "sticker_tracker",
  password: process.env.DB_PASSWORD || "mari",
  port: process.env.DB_PORT || 5432,
});

// Initialize stickers from config
async function initializeStickers(stickersConfig) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const [collectionName, rarities] of Object.entries(
      stickersConfig.collections
    )) {
      for (const [rarity, items] of Object.entries(rarities)) {
        for (const sticker of items) {
          await client.query(
            `INSERT INTO stickers (sticker_id, name, collection, rarity, image_url)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (sticker_id) DO UPDATE 
             SET name = EXCLUDED.name, 
                 collection = EXCLUDED.collection,
                 rarity = EXCLUDED.rarity,
                 image_url = EXCLUDED.image_url`,
            [sticker.id, sticker.name, collectionName, rarity, sticker.imageUrl]
          );
        }
      }
    }

    await client.query("COMMIT");
    console.log("✓ Stickers initialized in database");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// Insert scrape results
async function insertScrapeResults(results) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const result of results) {
      for (const [appType, rawCount] of Object.entries(result.applications)) {
        let count = rawCount;

        // Check if value is null or non-numeric
        if (count === null || isNaN(count)) {
          console.log(`⚠️ Invalid value for ${result.sticker} (${appType}): ${count}. Fetching previous value...`);

          // Get latest value from database
          const prevResult = await client.query(
            `SELECT count FROM application_snapshots 
             WHERE sticker_id = $1 AND application_type = $2 
             ORDER BY scraped_at DESC 
             LIMIT 1`,
            [result.stickerId, appType]
          );

          if (prevResult.rows.length > 0) {
            count = prevResult.rows[0].count;
            console.log(`  ✓ Using previous value: ${count}`);
          } else {
            console.log(`  ✗ No previous value found. Skipping.`);
            continue; // Skip if no previous value exists
          }
        }

        await client.query(
          `INSERT INTO application_snapshots (sticker_id, application_type, count, scraped_at)
           VALUES ($1, $2, $3, $4)`,
          [result.stickerId, appType, count, result.timestamp]
        );
      }
    }

    await client.query("COMMIT");
    console.log(`✓ Inserted ${results.length} scrape results`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// Get latest data for all stickers
async function getLatestApplications() {
  const query = `
    SELECT 
      s.sticker_id,
      s.name,
      s.collection,
      s.rarity,
      a.application_type,
      a.count,
      a.scraped_at
    FROM stickers s
    LEFT JOIN LATERAL (
      SELECT application_type, count, scraped_at
      FROM application_snapshots
      WHERE sticker_id = s.sticker_id
      ORDER BY scraped_at DESC
      LIMIT 4
    ) a ON true
    ORDER BY s.collection, s.rarity, s.name, a.application_type
  `;

  const result = await pool.query(query);
  return result.rows;
}

// Get historical data for a specific sticker
async function getStickerHistory(stickerId, days = 30) {
  const query = `
    SELECT 
      application_type,
      count,
      scraped_at
    FROM application_snapshots
    WHERE sticker_id = $1
      AND scraped_at >= NOW() - INTERVAL '${days} days'
    ORDER BY scraped_at ASC, application_type
  `;

  const result = await pool.query(query, [stickerId]);
  return result.rows;
}

// Calculate growth metrics
async function calculateGrowthMetrics(stickerId) {
  const query = `
    WITH latest AS (
      SELECT application_type, count, scraped_at
      FROM application_snapshots
      WHERE sticker_id = $1
      ORDER BY scraped_at DESC
      LIMIT 4
    ),
    previous AS (
      SELECT application_type, count, scraped_at
      FROM application_snapshots
      WHERE sticker_id = $1
        AND scraped_at < (SELECT MIN(scraped_at) FROM latest)
      ORDER BY scraped_at DESC
      LIMIT 4
    )
    SELECT 
      l.application_type,
      l.count as current_count,
      p.count as previous_count,
      l.count - COALESCE(p.count, 0) as growth,
      CASE 
        WHEN p.count > 0 THEN 
          ((l.count - p.count)::DECIMAL / p.count * 100)
        ELSE NULL
      END as growth_rate
    FROM latest l
    LEFT JOIN previous p ON l.application_type = p.application_type
    ORDER BY l.application_type
  `;

  const result = await pool.query(query, [stickerId]);
  return result.rows;
}

// Get top growing stickers
async function getTopGrowingStickers(limit = 20) {
  const query = `
    WITH latest AS (
      SELECT DISTINCT ON (sticker_id, application_type)
        sticker_id,
        application_type,
        count,
        scraped_at
      FROM application_snapshots
      ORDER BY sticker_id, application_type, scraped_at DESC
    ),
    previous AS (
      SELECT DISTINCT ON (sticker_id, application_type)
        sticker_id,
        application_type,
        count
      FROM application_snapshots
      WHERE scraped_at < (SELECT MAX(scraped_at) FROM latest)
      ORDER BY sticker_id, application_type, scraped_at DESC
    ),
    growth_calc AS (
      SELECT 
        l.sticker_id,
        l.application_type,
        l.count - COALESCE(p.count, 0) as growth,
        CASE 
          WHEN p.count > 0 THEN 
            ((l.count - p.count)::DECIMAL / p.count * 100)
          ELSE NULL
        END as growth_rate
      FROM latest l
      LEFT JOIN previous p 
        ON l.sticker_id = p.sticker_id 
        AND l.application_type = p.application_type
      WHERE l.application_type = '1x'
    )
    SELECT 
      s.sticker_id,
      s.name,
      s.collection,
      s.rarity,
      g.growth,
      g.growth_rate
    FROM growth_calc g
    JOIN stickers s ON g.sticker_id = s.sticker_id
    WHERE g.growth > 0
    ORDER BY g.growth_rate DESC NULLS LAST
    LIMIT $1
  `;

  const result = await pool.query(query, [limit]);
  return result.rows;
}

module.exports = {
  pool,
  initializeStickers,
  insertScrapeResults,
  getLatestApplications,
  getStickerHistory,
  calculateGrowthMetrics,
  getTopGrowingStickers,
};