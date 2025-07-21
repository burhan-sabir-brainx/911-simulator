import { NextResponse } from 'next/server';
import { processCallTranscript } from '@/services/transcriptProcessor';

export async function POST(
  request: Request,
) {
  try {
    // Get the call ID from the URL instead of params
    const url = new URL(request.url);
    const callId = url.pathname.split('/').pop();
    
    if (!callId) {
      console.error('Missing call ID in URL');
      return NextResponse.json(
        { error: 'Call ID is required' },
        { status: 400 }
      );
    }
    
    const result = await processCallTranscript(callId);
    
    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error('Error in transcript processing:', error);
    return NextResponse.json(
      { error: 'Failed to process transcript', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}