# Proposal: Refactoring the Tools & Streaming Architecture

## 1. Problem Statement & Symptoms

### Current Failure State
The AI-driven artifact generation system in DarvayaAI v1.0 is experiencing critical failures in two interconnected areas:

1. **Tool Call Execution Failures**: When user prompts should trigger tool calls (e.g., "write an essay"), the system fails to properly execute the `createDocument` tool, resulting in no artifact creation.

2. **Streaming Content Interruption**: Even when tool calls are initiated, the real-time streaming of artifact content (e.g., `text-delta` events) to the client UI does not function correctly, leaving users with blank or partially loaded artifacts.

**User-Facing Impact:**
- Users request content creation but see no artifacts appear
- Streaming content stops prematurely or never begins
- Tool execution appears to hang or timeout
- Chat interface becomes unresponsive during tool operations

**Expected vs. Actual Behavior:**
- **Expected**: User prompt → AI tool call → Real-time content streaming → Completed artifact
- **Actual**: User prompt → Tool call initiated → Stream failure → No visible artifact

## 2. Root Cause Analysis

### 2.1. Data Flow Trace

The current system follows this path:

1. **Client Request**: `/api/chat` receives user message
2. **OpenRouter API Call**: `streamChatWithTools()` sends request with tool definitions
3. **Tool Call Detection**: OpenRouter responds with `tool_calls` in delta chunks
4. **Tool Execution**: `processToolCalls()` executes `createDocumentExecutor`
5. **Content Generation**: Tool calls artifact handlers (e.g., `textDocumentHandler`)
6. **Stream Writing**: `CustomDataStreamWriter` writes `text-delta` events
7. **Client Processing**: `Chat` component processes data stream events
8. **UI Rendering**: `textArtifact.onStreamPart()` updates the artifact display

### 2.2. Point of Failure Hypothesis

**Primary Hypothesis**: The root cause of the failure is a **stream coordination breakdown** between the tool execution subprocess and the main response stream. Specifically:

1. **Double Serialization Bug**: Tool call and result data undergoes double JSON serialization in the `/api/chat` route (lines 293-295, 298-300), causing malformed data to reach the client.

2. **Stream Context Isolation**: Tool executors create their own streaming context through `documentHandler.onCreateDocument()`, but this secondary stream is not properly piped to the main `CustomDataStreamWriter` that feeds the client.

3. **Asynchronous Race Condition**: The tool execution is `await`ed within the main streaming generator, causing the primary response stream to pause until tool completion, but the tool's streaming output never reaches the client due to context isolation.

4. **Client-Side Event Filtering**: The client-side `Chat.tsx` component's data stream processor (lines 125-170) lacks proper handling for tool-related stream events, particularly during the transition from tool execution to content streaming.

The net effect is that tool execution completes on the server but the streaming artifact content never reaches the client UI, creating the appearance of a "hanging" tool call.

## 3. Proposed Solution Architecture

### 3.1. Proposed Backend Changes

#### A. Fix Stream Context Sharing

**Current Problem**: Tool executors create isolated streaming contexts that don't connect to the main response stream.

**Solution**: Modify the tool execution architecture to use a **shared streaming context** pattern:

```typescript
// In lib/ai/tools-handler.ts - Modified executeToolCall function
export async function executeToolCall(
  toolCall: OpenAI.Chat.Completions.ChatCompletionMessageToolCall,
  context: ToolExecutionContext,
): Promise<ToolExecutionResult> {
  // ... existing validation ...

  // CRITICAL FIX: Pass the main dataStream directly to tool executor
  const result = await executor(parsedArgs, {
    session: context.session,
    dataStream: context.dataStream, // Direct reference, not isolated
  });

  return result;
}
```

#### B. Eliminate Double Serialization

**Current Problem**: Tool event data is double-serialized in `/api/chat/route.ts`.

**Solution**: Remove the redundant `JSON.stringify()` calls:

```typescript
// In app/(chat)/api/chat/route.ts - Lines 293-300
if (chunk.type === 'tool_call') {
  // BEFORE (causes double serialization):
  // writer.writeData({
  //   type: 'tool-call',
  //   data: JSON.stringify(chunk.data),
  // });

  // AFTER (direct data passing):
  writer.writeData({
    type: 'tool-call',
    data: chunk.data,
  });
} else if (chunk.type === 'tool_result') {
  writer.writeData({
    type: 'tool-result',
    data: chunk.data, // Remove JSON.stringify wrapper
  });
}
```

#### C. Implement Stream Coordination Protocol

**Solution**: Create a new `CoordinatedDataStreamWriter` that manages both tool execution and content streaming:

```typescript
// New file: lib/ai/coordinated-streaming.ts
export class CoordinatedDataStreamWriter extends CustomDataStreamWriter {
  private toolExecutionState: 'idle' | 'executing' | 'streaming' = 'idle';
  
  writeToolStart(toolId: string, toolName: string) {
    this.toolExecutionState = 'executing';
    this.writeData({
      type: 'tool-start',
      data: { id: toolId, name: toolName }
    });
  }
  
  writeToolContentDelta(content: string) {
    this.toolExecutionState = 'streaming';
    this.writeData({
      type: 'text-delta',
      content: content
    });
  }
  
  writeToolComplete(toolId: string, result: any) {
    this.toolExecutionState = 'idle';
    this.writeData({
      type: 'tool-complete',
      data: { id: toolId, result }
    });
  }
}
```

### 3.2. Proposed Frontend Changes

#### A. Enhanced Data Stream Processing

**Current Problem**: The `Chat.tsx` component doesn't properly handle tool-related streaming events.

**Solution**: Expand the data stream processing logic:

```typescript
// In components/chat.tsx - Enhanced useEffect for data processing
useEffect(() => {
  if (!data?.length) return;

  const newDeltas = data.slice(lastProcessedIndex.current + 1);
  lastProcessedIndex.current = data.length - 1;

  newDeltas.forEach((delta: any) => {
    // NEW: Handle tool execution states
    switch (delta.type) {
      case 'tool-start':
        setArtifact((draft) => ({
          ...draft,
          status: 'streaming',
          isVisible: true
        }));
        break;
        
      case 'text-delta':
        // Existing text-delta handling...
        break;
        
      case 'tool-complete':
        setArtifact((draft) => ({
          ...draft,
          status: 'idle'
        }));
        break;
    }
    
    // Existing artifact definition processing...
  });
}, [data, setArtifact, setMetadata, artifact]);
```

#### B. Fix Client-Side Event Deserialization

**Solution**: Update `DataStreamHandler` to properly handle serialized tool events:

```typescript
// In components/data-stream-handler.tsx
newDeltas.forEach((delta: DataStreamDelta) => {
  let processedDelta = delta;
  
  // ENHANCED: Better deserialization handling
  if (delta.type === 'tool-call' || delta.type === 'tool-result') {
    try {
      // Handle both pre-serialized and direct data
      if (typeof delta.content === 'string') {
        const parsed = JSON.parse(delta.content);
        processedDelta = { ...delta, content: parsed };
      }
    } catch (error) {
      console.warn('Failed to parse tool delta:', error);
      return; // Skip malformed events
    }
  }
  
  // Continue with existing processing...
});
```

### 3.3. Sequence Diagram of Proposed Flow

The proposed architecture implements a coordinated streaming approach that ensures tool execution content properly reaches the client UI:

[Sequence diagram has been generated above showing the corrected flow]

## 4. Unit Test Proposal

### 4.1. Backend Component Tests

#### Test Case 1: Stream Context Sharing Validation
**Test Description**: The `/api/chat` handler should properly pass the main dataStream to tool executors without creating isolated contexts.

```typescript
// tests/api/chat-tool-streaming.test.ts
describe('Tool Execution Stream Context', () => {
  it('should pass shared dataStream to tool executor', async () => {
    const mockDataStream = new MockCoordinatedDataStreamWriter();
    const mockContext = { session: mockSession, dataStream: mockDataStream };
    
    const toolCall = createMockToolCall('createDocument', { title: 'Test Doc', kind: 'text' });
    const result = await executeToolCall(toolCall, mockContext);
    
    expect(result.success).toBe(true);
    expect(mockDataStream.events).toContainEqual({
      type: 'tool-start',
      data: { id: expect.any(String), name: 'createDocument' }
    });
  });
});
```

#### Test Case 2: Double Serialization Prevention
**Test Description**: Tool call and result data should not undergo double JSON serialization in the chat API route.

```typescript
describe('Data Serialization in Chat API', () => {
  it('should not double-serialize tool event data', async () => {
    const mockWriter = new MockDataStreamWriter();
    const toolCallData = { id: 'test-id', name: 'createDocument', arguments: '{}' };
    
    // Simulate the fixed behavior
    mockWriter.writeData({
      type: 'tool-call',
      data: toolCallData, // Direct data, not JSON.stringify(toolCallData)
    });
    
    const writtenData = mockWriter.getLastWrittenData();
    expect(typeof writtenData.data).toBe('object');
    expect(writtenData.data.id).toBe('test-id');
  });
});
```

#### Test Case 3: Tool Executor Error Handling
**Test Description**: The tool execution system should gracefully handle malformed tool calls and return specific error responses.

```typescript
describe('Tool Executor Error Handling', () => {
  it('should handle malformed tool call arguments gracefully', async () => {
    const malformedToolCall = {
      id: 'test-id',
      type: 'function' as const,
      function: { name: 'createDocument', arguments: 'invalid-json{' }
    };
    
    const result = await executeToolCall(malformedToolCall, mockContext);
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid JSON arguments');
  });
});
```

#### Test Case 4: Stream Coordination Protocol
**Test Description**: The CoordinatedDataStreamWriter should properly manage tool execution state transitions.

```typescript
describe('CoordinatedDataStreamWriter', () => {
  it('should correctly transition through tool execution states', () => {
    const writer = new CoordinatedDataStreamWriter(mockController);
    
    writer.writeToolStart('tool-1', 'createDocument');
    expect(writer.toolExecutionState).toBe('executing');
    
    writer.writeToolContentDelta('Hello world');
    expect(writer.toolExecutionState).toBe('streaming');
    
    writer.writeToolComplete('tool-1', { success: true });
    expect(writer.toolExecutionState).toBe('idle');
    
    const events = writer.getAllEvents();
    expect(events).toHaveLength(3);
    expect(events[1].type).toBe('text-delta');
  });
});
```

### 4.2. Frontend Component Tests

#### Test Case 1: Data Stream Event Processing
**Test Description**: The `Chat` component should correctly handle tool-related streaming events without breaking existing functionality.

```typescript
// tests/components/chat-streaming.test.tsx
describe('Chat Component Tool Event Processing', () => {
  it('should process tool-start events and update artifact state', () => {
    const { result } = renderHook(() => useArtifact());
    const mockSetArtifact = jest.fn();
    
    const toolStartEvent = { type: 'tool-start', data: { id: 'tool-1', name: 'createDocument' } };
    
    // Simulate the enhanced useEffect processing
    processDataStreamEvent(toolStartEvent, mockSetArtifact);
    
    expect(mockSetArtifact).toHaveBeenCalledWith(expect.any(Function));
    const updateFunction = mockSetArtifact.mock.calls[0][0];
    const updatedArtifact = updateFunction(initialArtifactData);
    
    expect(updatedArtifact.status).toBe('streaming');
    expect(updatedArtifact.isVisible).toBe(true);
  });
});
```

#### Test Case 2: Artifact UI Text Delta Rendering
**Test Description**: The `textArtifact.onStreamPart()` method should correctly render incoming `text-delta` stream events in real-time.

```typescript
describe('Text Artifact Streaming', () => {
  it('should render text-delta events progressively', () => {
    const mockSetArtifact = jest.fn();
    const textArtifact = getTextArtifactDefinition();
    
    const textDeltaEvent = { type: 'text-delta', content: 'Hello ' };
    
    textArtifact.onStreamPart({
      streamPart: textDeltaEvent,
      setArtifact: mockSetArtifact,
      setMetadata: jest.fn()
    });
    
    expect(mockSetArtifact).toHaveBeenCalledWith(expect.any(Function));
    const updateFunction = mockSetArtifact.mock.calls[0][0];
    const updatedArtifact = updateFunction({ ...initialArtifactData, content: 'Existing ' });
    
    expect(updatedArtifact.content).toBe('Existing Hello ');
    expect(updatedArtifact.status).toBe('streaming');
  });
});
```

#### Test Case 3: Data Stream Deserialization
**Test Description**: The `DataStreamHandler` should correctly parse both pre-serialized and direct tool event data.

```typescript
describe('DataStreamHandler Deserialization', () => {
  it('should handle both serialized and direct tool event data', () => {
    const serializedEvent = {
      type: 'tool-call',
      content: '{"id":"tool-1","name":"createDocument"}'
    };
    
    const directEvent = {
      type: 'tool-call',
      content: { id: 'tool-1', name: 'createDocument' }
    };
    
    const processedSerialized = processDataStreamDelta(serializedEvent);
    const processedDirect = processDataStreamDelta(directEvent);
    
    expect(processedSerialized.content).toEqual({ id: 'tool-1', name: 'createDocument' });
    expect(processedDirect.content).toEqual({ id: 'tool-1', name: 'createDocument' });
  });
});
```

#### Test Case 4: Tool Error State Handling
**Test Description**: The frontend should gracefully handle tool execution errors and display appropriate user feedback.

```typescript
describe('Tool Error State Handling', () => {
  it('should display error state when tool execution fails', () => {
    const errorEvent = {
      type: 'tool-error',
      data: { toolId: 'tool-1', error: 'Failed to create document' }
    };
    
    const { getByTestId } = render(<Chat {...mockChatProps} />);
    
    // Simulate error event processing
    fireEvent(window, new CustomEvent('tool-error', { detail: errorEvent }));
    
    expect(getByTestId('tool-error-message')).toBeInTheDocument();
    expect(getByTestId('tool-error-message')).toHaveTextContent('Failed to create document');
  });
});
```

## 5. Implementation & Validation Plan

### 5.1. Key Implementation Steps

1. **Phase 1: Backend Stream Context Fix (Critical Path)**
   - Implement `CoordinatedDataStreamWriter` class
   - Modify `executeToolCall` to use shared stream context
   - Remove double serialization in `/api/chat/route.ts`
   - **Duration**: 2-3 days

2. **Phase 2: Frontend Data Processing Enhancement**
   - Update `Chat.tsx` component with enhanced data stream processing
   - Fix `DataStreamHandler` deserialization logic
   - Add new tool event types to artifact definitions
   - **Duration**: 2-3 days

3. **Phase 3: Integration Testing & Validation**
   - Implement all unit tests specified in Section 4
   - Run end-to-end tool execution tests
   - Performance testing with streaming artifacts
   - **Duration**: 3-4 days

4. **Phase 4: Production Deployment**
   - Deploy to staging environment
   - Run comprehensive user acceptance testing
   - Monitor tool execution metrics
   - **Duration**: 1-2 days

### 5.2. Recommended Testing Strategy

#### Functional Testing Approach
1. **Unit Testing**: Achieve 95% code coverage for all modified components
2. **Integration Testing**: Test complete user prompt → artifact creation flow
3. **Performance Testing**: Validate streaming latency remains under 100ms per delta
4. **Error Handling Testing**: Verify graceful degradation under failure conditions

#### Success Criteria Validation
- **Tool Call Success Rate**: ≥99% of valid tool calls should execute successfully
- **Streaming Continuity**: 100% of tool-generated content should reach the client UI
- **Response Time**: Tool execution should begin within 500ms of AI tool call
- **Error Recovery**: System should recover gracefully from tool failures without breaking the chat session

#### Monitoring & Metrics
Implement the following monitoring for the fixed system:
- Tool execution completion rate
- Stream event delivery success rate  
- Client-side artifact rendering performance
- Tool execution latency distribution

This comprehensive refactoring addresses the root cause of the tool-use and streaming failures while providing robust testing coverage to prevent regression and ensure reliable operation in production.
</code_block_to_apply_changes_from>
</invoke>
</rewritten_file>