import { CustomDataStreamWriter } from './streaming';

/**
 * Enhanced DataStreamWriter that coordinates tool execution with content streaming
 * Addresses the root cause of stream context isolation in tool execution
 */
export class CoordinatedDataStreamWriter extends CustomDataStreamWriter {
  private toolExecutionState: 'idle' | 'executing' | 'streaming' = 'idle';
  private currentToolId: string | null = null;
  private eventLog: Array<{ type: string; data: any; timestamp: number }> = [];

  /**
   * Signal the start of a tool execution
   */
  writeToolStart(toolId: string, toolName: string) {
    this.toolExecutionState = 'executing';
    this.currentToolId = toolId;

    const event = {
      type: 'tool-start',
      data: { id: toolId, name: toolName },
    };

    this.logEvent(event);
    this.writeData(event);
  }

  /**
   * Stream content delta from tool execution
   * This replaces the isolated streaming context in tool handlers
   */
  writeToolContentDelta(content: string) {
    this.toolExecutionState = 'streaming';

    const event = {
      type: 'text-delta',
      content: content,
    };

    this.logEvent(event);
    this.writeData(event);
  }

  /**
   * Signal tool execution completion
   */
  writeToolComplete(toolId: string, result: any) {
    this.toolExecutionState = 'idle';
    this.currentToolId = null;

    const event = {
      type: 'tool-complete',
      data: { id: toolId, result },
    };

    this.logEvent(event);
    this.writeData(event);
  }

  /**
   * Handle tool execution errors
   */
  writeToolError(toolId: string, error: string) {
    this.toolExecutionState = 'idle';
    this.currentToolId = null;

    const event = {
      type: 'tool-error',
      data: { id: toolId, error },
    };

    this.logEvent(event);
    this.writeData(event);
  }

  /**
   * Get current tool execution state
   */
  getToolExecutionState(): 'idle' | 'executing' | 'streaming' {
    return this.toolExecutionState;
  }

  /**
   * Get currently executing tool ID
   */
  getCurrentToolId(): string | null {
    return this.currentToolId;
  }

  /**
   * Get all logged events (for debugging and testing)
   */
  getAllEvents(): Array<{ type: string; data: any; timestamp: number }> {
    return [...this.eventLog];
  }

  /**
   * Clear event log (useful for testing)
   */
  clearEventLog(): void {
    this.eventLog = [];
  }

  /**
   * Override writeData to ensure consistent event logging
   */
  writeData(data: any) {
    // Call parent implementation
    super.writeData(data);

    // Log for debugging if not already logged
    if (
      !this.eventLog.some(
        (e) => e.data === data && Math.abs(e.timestamp - Date.now()) < 10,
      )
    ) {
      this.logEvent(data);
    }
  }

  /**
   * Private method to log events for debugging and testing
   */
  private logEvent(event: any): void {
    this.eventLog.push({
      type: event.type || 'unknown',
      data: event,
      timestamp: Date.now(),
    });
  }
}

/**
 * Factory function to create a coordinated stream writer
 */
export function createCoordinatedStreamWriter(
  controller: ReadableStreamDefaultController<Uint8Array>,
): CoordinatedDataStreamWriter {
  return new CoordinatedDataStreamWriter(controller);
}
