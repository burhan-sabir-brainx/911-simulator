CREATE TABLE IF NOT EXISTS emergency_calls (
    id SERIAL PRIMARY KEY,
    caller_name VARCHAR(255),
    caller_phone VARCHAR(20),
    caller_address TEXT,
    call_type VARCHAR(50),
    call_status VARCHAR(20),
    location_type VARCHAR(20),
    location_details TEXT,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    duration INTEGER,
    priority_level INTEGER,
    description TEXT,
    dispatcher_notes TEXT,
    response_time INTEGER,
    responding_unit VARCHAR(100),
    resolution TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    recording_url TEXT,
    transcript_url TEXT
);

CREATE INDEX IF NOT EXISTS idx_emergency_calls_call_type ON emergency_calls(call_type);
CREATE INDEX IF NOT EXISTS idx_emergency_calls_call_status ON emergency_calls(call_status);
CREATE INDEX IF NOT EXISTS idx_emergency_calls_start_time ON emergency_calls(start_time);
CREATE INDEX IF NOT EXISTS idx_emergency_calls_priority_level ON emergency_calls(priority_level); 