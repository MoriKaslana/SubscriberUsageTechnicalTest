-- Q3 queries. Run in order, after 01_schema.sql and 02_seed.sql.

-- 1. Insert a new subscriber: Fajar, Basic plan, activated 24 January 2024
-- Expected: 1 row inserted
INSERT INTO subscribers (id, name, plan, activation_date)
VALUES ('SUB07', 'Fajar', 'Basic', '2024-01-24');

-- 2. Update Fajar's plan to Premium
-- Expected: 1 row updated
UPDATE subscribers
SET plan = 'Premium'
WHERE id = 'SUB07';

-- 3. Total data usage across all snapshots for Premium subscribers
-- Expected: 16800
SELECT COALESCE(SUM(u.data_usage_mb), 0) AS total_premium_data_mb
FROM subscribers s
JOIN usage u ON u.subscriber_id = s.id
WHERE s.plan = 'Premium';

-- 4. Top 3 subscribers by total data usage across all snapshots
-- Expected: SUB02 Sari 11800, SUB04 Dewi 9000, SUB05 Rian 5000
SELECT s.id, s.name, SUM(u.data_usage_mb) AS total_data_mb
FROM subscribers s
JOIN usage u ON u.subscriber_id = s.id
GROUP BY s.id, s.name
ORDER BY total_data_mb DESC, s.id
LIMIT 3;

-- 5. Subscribers whose average call minutes per snapshot is <= 30 (subquery)
-- Expected: SUB03 Budi, SUB06 Nia
SELECT id, name, plan
FROM subscribers
WHERE id IN (
    SELECT subscriber_id
    FROM usage
    GROUP BY subscriber_id
    HAVING AVG(call_minutes) <= 30
);
