'use strict';

const express = require('express');

const app = express();
app.use(express.json());

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------
const records = [];
let nextId = 1;

// ---------------------------------------------------------------------------
// Validation helper
// Returns an array of error strings; empty array means valid.
// ---------------------------------------------------------------------------
function validateUsageBody(body) {
  const errors = [];

  // subscriberId: required, non-empty string
  if (typeof body.subscriberId !== 'string' || body.subscriberId.trim() === '') {
    errors.push('subscriberId must be a non-empty string');
  }

  // Numeric fields: must be finite, non-negative numbers
  const numericFields = ['callMinutes', 'smsCount', 'dataUsageMB'];
  for (const field of numericFields) {
    const val = body[field];
    if (typeof val !== 'number' || !Number.isFinite(val) || val < 0) {
      errors.push(`${field} must be a finite, non-negative number`);
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// POST /api/usage — record a new usage entry
// ---------------------------------------------------------------------------
app.post('/api/usage', (req, res) => {
  const errors = validateUsageBody(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  const record = {
    id: nextId++,
    subscriberId: req.body.subscriberId.trim(),
    callMinutes: req.body.callMinutes,
    smsCount: req.body.smsCount,
    dataUsageMB: req.body.dataUsageMB,
    timestamp: new Date().toISOString(), // UTC ISO 8601
  };

  records.push(record);
  return res.status(201).json(record);
});

// ---------------------------------------------------------------------------
// GET /api/usage — list all records, with optional ?subscriberId= filter
// ---------------------------------------------------------------------------
app.get('/api/usage', (req, res) => {
  const { subscriberId } = req.query;

  const data = subscriberId
    ? records.filter((r) => r.subscriberId === subscriberId)
    : records.slice(); // copy so callers can't mutate the store

  return res.json({ count: data.length, data });
});

// ---------------------------------------------------------------------------
// GET /api/usage/:subscriberId — list one subscriber's records
// Returns 404 if no records exist for that subscriber
// ---------------------------------------------------------------------------
app.get('/api/usage/:subscriberId', (req, res) => {
  const { subscriberId } = req.params;
  const data = records.filter((r) => r.subscriberId === subscriberId);

  if (data.length === 0) {
    return res.status(404).json({
      error: `No records found for subscriber "${subscriberId}"`,
    });
  }

  return res.json({ count: data.length, data });
});

module.exports = { app, records }; // export records so tests can inspect/reset
