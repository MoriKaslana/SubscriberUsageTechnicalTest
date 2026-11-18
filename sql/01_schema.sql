-- Q3 schema (PostgreSQL). Safe to re-run: drops and recreates the tables.
DROP TABLE IF EXISTS usage CASCADE;
DROP TABLE IF EXISTS subscribers CASCADE;

CREATE TABLE subscribers (
    id              VARCHAR(10)  PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    plan            VARCHAR(20)  NOT NULL CHECK (plan IN ('Basic', 'Premium', 'Family')),
    activation_date DATE         NOT NULL
);

CREATE TABLE usage (
    id            SERIAL      PRIMARY KEY,
    subscriber_id VARCHAR(10) NOT NULL REFERENCES subscribers(id),
    call_minutes  INT         NOT NULL,
    sms_count     INT         NOT NULL,
    data_usage_mb INT         NOT NULL,
    recorded_at   TIMESTAMP   NOT NULL  -- not named "timestamp" to avoid the type-name clash
);

CREATE INDEX idx_usage_subscriber_id ON usage(subscriber_id);
