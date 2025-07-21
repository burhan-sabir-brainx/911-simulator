import React, { Suspense } from "react";
import { TranscriptProvider } from "@/app/contexts/TranscriptContext";
import { EventProvider } from "@/app/contexts/EventContext";
import EmergencyCallSimulator from './components/EmergencyCallSimulator';

export default function Home() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <TranscriptProvider>
        <EventProvider>
          <EmergencyCallSimulator />
        </EventProvider>
      </TranscriptProvider>
    </Suspense>
  );
}
