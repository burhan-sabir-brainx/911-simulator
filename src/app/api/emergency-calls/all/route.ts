import { NextResponse } from "next/server";

export async function GET() {
  try {
    // Use a raw SQL query since EmergencyCallModel does not have findAll
    const client = await (await import('@/db/config')).default.connect();
    try {
      const result = await client.query(
        'SELECT * FROM emergency_calls ORDER BY created_at DESC'
      );      
      // Add cache control headers to prevent stale data
      const response = NextResponse.json(result.rows);
      response.headers.set('Cache-Control', 'no-store, must-revalidate');
      response.headers.set('Pragma', 'no-cache');
      response.headers.set('Expires', '0');
      
      return response;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Failed to fetch calls:", error);
    return NextResponse.json({ error: "Failed to fetch calls" }, { status: 500 });
  }
} 