import { NextResponse } from 'next/server';
import pool from '@/db/config';

export async function GET() {
  try {
    const result = await pool.query(
      'SELECT * FROM emergency_calls ORDER BY created_at DESC LIMIT 1'
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'No calls found' 
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      call: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching latest call:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      },
      { status: 500 }
    );
  }
} 