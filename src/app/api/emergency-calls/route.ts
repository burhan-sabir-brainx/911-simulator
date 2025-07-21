import { NextResponse } from 'next/server';
import { EmergencyCallModel } from '@/models/EmergencyCall';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Create a new emergency call
    const emergencyCall = await EmergencyCallModel.create({
      call_type: body.call_type,
      call_status: 'pending',
      caller_name: body.caller_name,
      caller_phone: body.caller_phone,
      caller_address: body.caller_address,
      description: body.description,
      priority_level: body.priority_level || 3,
    });

    return NextResponse.json(emergencyCall, { status: 201 });
  } catch (error) {
    console.error('Error creating emergency call:', error);
    return NextResponse.json(
      { error: 'Failed to create emergency call' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    // Get all pending calls
    const pendingCalls = await EmergencyCallModel.findByStatus('pending');
    return NextResponse.json(pendingCalls);
  } catch (error) {
    console.error('Error fetching emergency calls:', error);
    return NextResponse.json(
      { error: 'Failed to fetch emergency calls' },
      { status: 500 }
    );
  }
} 