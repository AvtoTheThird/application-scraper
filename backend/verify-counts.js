
const { pool } = require("./db/database");

async function checkCounts() {
    try {
        const resStickers = await pool.query("SELECT COUNT(*) FROM stickers");
        const resSnapshots = await pool.query("SELECT COUNT(*) FROM application_snapshots");

        console.log(`Stickers: ${resStickers.rows[0].count}`);
        console.log(`Snapshots: ${resSnapshots.rows[0].count}`);

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

checkCounts();
