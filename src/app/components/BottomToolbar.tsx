import React from "react";
import { SessionStatus } from "@/app/types";

interface BottomToolbarProps {
  sessionStatus: SessionStatus;
  onToggleConnection: () => Promise<void>;
  isDisconnecting?: boolean;
}

function BottomToolbar({
  sessionStatus,
  onToggleConnection,
  isDisconnecting = false,
}: BottomToolbarProps) {
  const isConnected = sessionStatus === "CONNECTED";
  const isConnecting = sessionStatus === "CONNECTING";

  function getConnectionButtonLabel() {
    if (isDisconnecting) return "Disconnecting...";
    if (isConnected) return "Disconnect";
    if (isConnecting) return "Connecting...";
    return "Connect";
  }

  function getConnectionButtonClasses() {
    const baseClasses = "text-white text-base p-2 w-36 rounded-md h-full font-semibold";
    const cursorClass = (isConnecting || isDisconnecting) ? "cursor-not-allowed" : "cursor-pointer";

    if (isConnected && !isDisconnecting) {
      // Connected -> label "Disconnect" -> orange
      return `bg-reality-orange hover:bg-reality-amber ${cursorClass} ${baseClasses}`;
    }
    // Disconnected, connecting, or disconnecting -> dark gray
    return `bg-reality-gray hover:bg-secondary text-white ${cursorClass} ${baseClasses}`;
  }

  const handleDisconnect = async () => {
    try {
      await onToggleConnection();
    } catch (error) {
      console.error('Error during disconnection:', error);
    }
  };

  return (
    <div className="p-4 flex flex-row items-center justify-center bg-background text-foreground border-t border-border">
      <button
        onClick={handleDisconnect}
        className={getConnectionButtonClasses()}
        disabled={isConnecting || isDisconnecting}
      >
        {isDisconnecting && (
          <span className="inline-block mr-2">
            <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </span>
        )}
        {getConnectionButtonLabel()}
      </button>
    </div>
  );
}

export default BottomToolbar;
