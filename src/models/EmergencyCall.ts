import pool from '../db/config';

export type CallStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
export type CallType = 'medical' | 'fire' | 'police' | 'other';

export interface EmergencyCall {
  id?: number;
  caller_name?: string;
  caller_phone?: string;
  caller_address?: string;
  call_type: CallType;
  call_status: CallStatus;
  location_type?: string;
  location_details?: string;
  latitude?: number;
  longitude?: number;
  start_time?: Date;
  end_time?: Date;
  duration?: number;
  priority_level?: number;
  description?: string;
  dispatcher_notes?: string;
  response_time?: number;
  responding_unit?: string;
  resolution?: string;
  created_at?: Date;
  updated_at?: Date;
  recording_url?: string;
  transcript_url?: string;
}

export class EmergencyCallModel {
  static async create(call: EmergencyCall): Promise<EmergencyCall> {
    const client = await pool.connect();
    try {
      // Ensure required fields have default values
      const callData = {
        ...call,
        call_type: call.call_type || 'other',
        call_status: call.call_status || 'completed',
        priority_level: call.priority_level || 1
      };

      const result = await client.query(
        `INSERT INTO emergency_calls (
          caller_name, caller_phone, caller_address, call_type, call_status,
          location_type, location_details, latitude, longitude, priority_level,
          description, dispatcher_notes, recording_url, transcript_url,
          start_time, end_time, duration
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        RETURNING *`,
        [
          callData.caller_name,
          callData.caller_phone,
          callData.caller_address,
          callData.call_type,
          callData.call_status,
          callData.location_type,
          callData.location_details,
          callData.latitude,
          callData.longitude,
          callData.priority_level,
          callData.description,
          callData.dispatcher_notes,
          callData.recording_url,
          callData.transcript_url,
          callData.start_time,
          callData.end_time,
          callData.duration
        ]
      );

      return result.rows[0];
    } catch (error) {
      console.error('Error creating emergency call:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  static async findById(id: number): Promise<EmergencyCall | null> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM emergency_calls WHERE id = $1',
        [id]
      );
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  static async update(id: number, call: Partial<EmergencyCall>): Promise<EmergencyCall | null> {
    const client = await pool.connect();
    try {
      const setClause = Object.keys(call)
        .map((key, index) => `${key} = $${index + 2}`)
        .join(', ');
      
      const values = Object.values(call);
      
      const query = `UPDATE emergency_calls SET ${setClause} WHERE id = $1 RETURNING *`;
      const result = await client.query(query, [id, ...values]);
      
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error updating emergency call:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  static async findByStatus(status: CallStatus): Promise<EmergencyCall[]> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM emergency_calls WHERE call_status = $1 ORDER BY created_at DESC',
        [status]
      );
      return result.rows;
    } finally {
      client.release();
    }
  }

  static async findByPhone(phone: string): Promise<EmergencyCall[]> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM emergency_calls WHERE caller_phone = $1 ORDER BY created_at DESC',
        [phone]
      );
      return result.rows;
    } finally {
      client.release();
    }
  }
} 