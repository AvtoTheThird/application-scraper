CREATE TABLE stickers (
    id SERIAL PRIMARY KEY,
    sticker_id VARCHAR(10) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    collection VARCHAR(100) NOT NULL,
    rarity VARCHAR(50) NOT NULL,
    image_url TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE application_snapshots (
    id SERIAL PRIMARY KEY,
    sticker_id VARCHAR(10) REFERENCES stickers(sticker_id) ON DELETE CASCADE,
    application_type VARCHAR(10) NOT NULL, -- '1x', '2x', '3x', '4x'
    count INTEGER NOT NULL,
    scraped_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_sticker_app_time ON application_snapshots(sticker_id, application_type, scraped_at);

CREATE TABLE daily_metrics (
    id SERIAL PRIMARY KEY,
    sticker_id VARCHAR(10) REFERENCES stickers(sticker_id) ON DELETE CASCADE,
    date DATE NOT NULL,
    application_type VARCHAR(10) NOT NULL,
    count_start INTEGER,
    count_end INTEGER,
    daily_growth INTEGER,
    growth_rate DECIMAL(10,2),
    UNIQUE(sticker_id, date, application_type)
);

CREATE INDEX idx_sticker_metrics ON daily_metrics(sticker_id, date, application_type);