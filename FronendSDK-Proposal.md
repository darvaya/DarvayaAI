# Proposal: Frontend SDK Migration from Vercel AI to OpenAI

## 1. Executive Summary

This proposal outlines a comprehensive migration strategy to replace the DarvayaAI v1.0 frontend's dependency on the **Vercel AI SDK** with a direct **OpenAI SDK** implementation. Currently, our application suffers from a technical dichotomy where the backend uses OpenAI SDK + OpenRouter for model interactions, while the frontend relies on Vercel's high-level abstractions (`useChat`, `UseChatHelpers`) for state management and streaming.

**Key Problems with Current Architecture:**
- **Format Mismatch**: Vercel AI SDK uses `{ parts: [{ type: 'text', text: string }] }` while OpenAI uses `{ role: string, content: string }`
- **Complex Format Conversion**: Custom streaming serialization causing "text parts expect string value" errors
- **Limited Debugging Control**: High-level abstractions make it difficult to debug streaming and tool-use failures
- **Dependency Overhead**: Additional abstraction layer when we already have OpenAI SDK on backend

**Expected Benefits:**
- **Unified Stack**: Consistent OpenAI SDK usage across frontend and backend
- **Better Debugging**: Direct control over message formatting, streaming, and error handling
- **Reduced Complexity**: Eliminate format conversion between SDK types
- **Performance**: Remove abstraction layer overhead and potential serialization issues
- **Long-term Maintainability**: Direct alignment with OpenRouter's recommended patterns

## 2. Current State Analysis

### 2.1. Vercel AI SDK Dependencies

**Core Dependencies:**
- `@ai-sdk/react: ^1.2.11` - Primary React hooks and utilities
- `ai: 4.3.13` - Core types and utilities (UIMessage, Attachment, etc.)

**Primary Usage Patterns:**

#### **`useChat` Hook:**
- **Files**: `components/chat.tsx`, `components/data-stream-handler.tsx`
- **Functionality**: Complete chat state management, streaming, message handling
- **Returns**: `{ messages, setMessages, handleSubmit, input, setInput, append, status, stop, reload, experimental_resume, data }`

#### **`UseChatHelpers` Type Dependencies:**
- **Files**: 
  - `components/multimodal-input.tsx` - Input handling, form submission
  - `components/messages.tsx` - Message display and state management
  - `components/message-editor.tsx` - Message editing functionality
  - `components/artifact.tsx` - Artifact chat interface
  - `components/toolbar.tsx` - UI controls
  - `components/suggested-actions.tsx` - Action suggestions
  - `hooks/use-auto-resume.ts` - Resume functionality
  - `hooks/use-messages.tsx` - Message utilities

#### **Enhanced Chat Implementation:**
- **Files**: `hooks/use-chat-enhanced.ts`, `components/chat-enhanced.tsx`
- **Functionality**: Wraps `useChat` with performance tracking, caching, retry logic

#### **Core AI SDK Types:**
- **Files**: Multiple components using `UIMessage`, `Attachment`, `CoreMessage` types
- **Usage**: Message formatting, type definitions, utility functions

### 2.2. Current Streaming Architecture

```typescript
// Current flow: Complex format conversion
Frontend (Vercel AI SDK) -> Backend (OpenAI SDK) -> OpenRouter -> Custom Streaming -> Frontend (Vercel AI SDK)

// Message format conversions:
useChat: { content: string } -> experimental_prepareRequestBody: { parts: [{ type: 'text', text: string }] } -> Backend: { role: string, content: string }
```

## 3. Proposed Migration Strategy & Architecture

### 3.1. Vercel-to-OpenAI Mapping

| Vercel Feature | Proposed Replacement |
| :--- | :--- |
| `useChat()` | **Custom `useOpenAIChat()` hook.** This hook will manage chat state using React's `useState` and `useReducer`. It will make direct `fetch` requests to our existing `/api/chat` endpoint and handle streaming responses manually. |
| `UseChatHelpers['messages']` | **`Message[]` array state.** Using OpenAI's standard message format: `{ role: 'user' \| 'assistant' \| 'system', content: string, tool_calls?: ToolCall[] }` |
| `UseChatHelpers['status']` | **Custom status enum.** `'idle' \| 'loading' \| 'streaming' \| 'error'` managed via `useState` |
| `UseChatHelpers['input']` | **Standard `string` state.** Managed with `useState<string>('')` |
| `UseChatHelpers['handleSubmit']` | **Custom `sendMessage()` function.** Handles form submission, adds user message to state, calls API, and processes streaming response |
| `UseChatHelpers['append']` | **Custom `addMessage()` function.** Directly manipulates the messages array state |
| `UseChatHelpers['setMessages']` | **Standard React state setter.** `Dispatch<SetStateAction<Message[]>>` |
| `UseChatHelpers['reload']` | **Custom `retryLastMessage()` function.** Removes last assistant message and re-sends the previous user message |
| `UseChatHelpers['stop']` | **`AbortController` integration.** Cancel in-flight requests and streaming |
| Streaming Response Handling | **Manual `ReadableStream` processing.** Use `fetch()` with `response.body.getReader()` to process chunks. Parse each chunk as text, update messages state incrementally to create real-time streaming effect |
| `UIMessage` types | **OpenAI `ChatCompletionMessage` types.** Standard format: `{ role, content, tool_calls?, function_call? }` |
| `Attachment` handling | **Custom attachment interface.** Simplified to match our actual usage: `{ url: string, name: string, contentType: string }` |
| Tool Use Integration | **Direct OpenAI tool format.** Handle `tool_calls` and `tool_results` in standard OpenAI message format without additional abstraction |
| `experimental_prepareRequestBody` | **Direct request formatting.** Format requests directly to match our API schema without SDK transformation layer |

### 3.2. New Custom Hook Design: `useOpenAIChat()`

**Core Interface:**
```typescript
interface OpenAIChatOptions {
  id: string;
  initialMessages?: Message[];
  onFinish?: (message: Message) => void;
  onError?: (error: Error) => void;
}

interface OpenAIChatHelpers {
  // Core state
  messages: Message[];
  input: string;
  status: 'idle' | 'loading' | 'streaming' | 'error';
  error: Error | null;
  
  // Core actions
  sendMessage: (content: string, attachments?: Attachment[]) => Promise<void>;
  addMessage: (message: Message) => void;
  setInput: (input: string) => void;
  retryLastMessage: () => Promise<void>;
  stop: () => void;
  
  // State management
  setMessages: Dispatch<SetStateAction<Message[]>>;
  clearChat: () => void;
}
```

**State Management:**
- **`messages`**: Array of OpenAI-format messages with proper typing
- **`input`**: Current input string for the text area
- **`status`**: Current operation state for UI feedback
- **`error`**: Error state for error handling and display
- **`abortController`**: For canceling in-flight requests

**Core Functions:**
- **`sendMessage()`**: Validates input, adds user message to state, calls `/api/chat`, processes streaming response
- **`addMessage()`**: Appends message to messages array (replaces `append`)
- **`retryLastMessage()`**: Removes last assistant message, re-sends previous user message
- **`stop()`**: Aborts current request using AbortController
- **`clearChat()`**: Resets all state for new conversation

**Streaming Implementation:**
```typescript
const processStreamingResponse = async (response: Response) => {
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  
  if (!reader) throw new Error('No response body');
  
  let assistantMessageId = generateId();
  let currentContent = '';
  
  // Add initial assistant message
  addMessage({
    id: assistantMessageId,
    role: 'assistant',
    content: '',
  });
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') return;
          
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            
            if (content) {
              currentContent += content;
              // Update assistant message in real-time
              setMessages(prev => prev.map(msg => 
                msg.id === assistantMessageId 
                  ? { ...msg, content: currentContent }
                  : msg
              ));
            }
          } catch (e) {
            console.warn('Failed to parse chunk:', e);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
    setStatus('idle');
  }
};
```

### 3.3. Tool Use Integration

**Current Tool Flow:**
```typescript
// Vercel AI SDK format (complex)
type UIMessage = {
  parts: Array<{
    type: 'text' | 'tool-invocation' | 'tool-result';
    text?: string;
    toolInvocation?: ToolInvocation;
  }>;
}
```

**Proposed OpenAI Format (standard):**
```typescript
// Direct OpenAI format (simple)
type Message = {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string; // For tool response messages
}
```

**Tool Handling in Hook:**
- Parse `tool_calls` from streaming response
- Display tool execution UI using standard OpenAI tool format
- Handle tool results as separate messages with `role: 'tool'`
- No complex parts array manipulation required

## 4. Impact Analysis

### 4.1. Files Requiring Refactoring

**High Impact (Complete Rewrite Required):**
- [ ] `components/chat.tsx` - Replace `useChat` with `useOpenAIChat`
- [ ] `components/chat-enhanced.tsx` - Reimplement with OpenAI SDK
- [ ] `hooks/use-chat-enhanced.ts` - Rebuild performance tracking around OpenAI SDK
- [ ] `components/data-stream-handler.tsx` - Simplify with direct OpenAI message handling

**Medium Impact (Type Changes + Logic Updates):**
- [ ] `components/multimodal-input.tsx` - Update prop types from `UseChatHelpers` to custom types
- [ ] `components/messages.tsx` - Replace `UIMessage` with OpenAI `Message` type
- [ ] `components/message.tsx` - Simplify message rendering without `parts` array complexity
- [ ] `components/message-editor.tsx` - Update message editing logic for OpenAI format
- [ ] `components/artifact.tsx` - Update prop interfaces and message handling
- [ ] `components/artifact-messages.tsx` - Type updates for OpenAI message format
- [ ] `hooks/use-auto-resume.ts` - Update types and resume logic
- [ ] `hooks/use-messages.tsx` - Simplify with OpenAI message format

**Low Impact (Type Updates Only):**
- [ ] `components/suggested-actions.tsx` - Update prop types
- [ ] `components/toolbar.tsx` - Update prop types  
- [ ] `components/create-artifact.tsx` - Type updates
- [ ] `app/(chat)/chat/[id]/page.tsx` - Update message conversion logic
- [ ] `app/(chat)/actions.ts` - Update type imports

**New Files Required:**
- [ ] `hooks/use-openai-chat.ts` - Core replacement for `useChat`
- [ ] `lib/types/openai.ts` - Custom type definitions and interfaces
- [ ] `lib/utils/message-formatting.ts` - Utilities for message conversion and validation

### 4.2. Backend API Compatibility

**No Changes Required:**
- `/api/chat` endpoint remains unchanged
- OpenRouter integration stays the same
- Request/response formats can be preserved
- Database schema is unaffected

**Simplified Request Format:**
```typescript
// Current (complex transformation)
body: {
  id: string;
  message: {
    parts: [{ type: 'text', text: string }];
    // ... other fields
  };
}

// Proposed (direct)
body: {
  id: string;
  message: {
    role: 'user';
    content: string;
  };
  attachments?: Attachment[];
}
```

### 4.3. Estimated Complexity

**Overall Effort: Medium-High**

**Breakdown by Component:**
- **Core Hook Implementation**: High (3-4 days) - Building robust `useOpenAIChat` with streaming
- **Main Chat Components**: Medium (2-3 days) - Updating chat.tsx and related components  
- **Message Components**: Low-Medium (1-2 days) - Type updates and simplified rendering
- **Tool Use Integration**: Medium (2-3 days) - Adapting tool calling to OpenAI format
- **Testing & Debugging**: Medium (2-3 days) - Ensuring feature parity
- **Type System Updates**: Low (1 day) - Updating type definitions throughout

**Total Estimated Time: 11-18 days**

**Risk Factors:**
- Streaming implementation complexity
- Tool use functionality verification
- Artifact system integration
- Performance regression prevention

## 5. Risk Assessment & Mitigation

### 5.1. Technical Risks

**Risk: Streaming Functionality Breaks**
- **Probability**: Medium
- **Impact**: High
- **Mitigation**: 
  - Implement streaming in isolated hook first
  - Maintain parallel implementation during transition
  - Comprehensive streaming tests before full deployment

**Risk: Tool Use Functionality Regression**
- **Probability**: Medium
- **Impact**: High  
- **Mitigation**:
  - Test tool calling with each backend model
  - Validate tool result handling and UI updates
  - Maintain tool execution logs for debugging

**Risk: Performance Degradation**
- **Probability**: Low
- **Impact**: Medium
- **Mitigation**:
  - Benchmark current vs. new implementation
  - Optimize streaming chunk processing
  - Monitor token/second metrics post-migration

**Risk: Type Safety Issues**
- **Probability**: Medium
- **Impact**: Medium
- **Mitigation**:
  - Comprehensive TypeScript type definitions
  - Runtime type validation for API responses
  - Unit tests for type conversions

### 5.2. User Experience Risks

**Risk: Temporary Feature Loss During Migration**
- **Probability**: Low
- **Impact**: High
- **Mitigation**:
  - Feature-flagged gradual rollout
  - Maintain backward compatibility during transition
  - Quick rollback capability

**Risk: UI/UX Inconsistencies**
- **Probability**: Low
- **Impact**: Medium
- **Mitigation**:
  - Maintain exact UI behavior specifications
  - Visual regression testing
  - User acceptance testing before full deployment

### 5.3. Development Risks

**Risk: Extended Development Timeline**
- **Probability**: Medium
- **Impact**: Medium
- **Mitigation**:
  - Phased implementation approach
  - Regular milestone reviews
  - Parallel development where possible

**Risk: Integration Issues with Existing Features**
- **Probability**: Medium
- **Impact**: Medium
- **Mitigation**:
  - Comprehensive integration testing
  - Artifact system compatibility verification
  - Authentication and session handling validation

## 6. Implementation Phases

### Phase 1: Core Hook Development (Days 1-4)
- Implement `useOpenAIChat` hook with full feature parity
- Add streaming response processing
- Create comprehensive test suite
- Validate against existing `/api/chat` endpoint

### Phase 2: Main Chat Component Migration (Days 5-7)
- Update `components/chat.tsx` to use new hook
- Migrate `components/multimodal-input.tsx` 
- Update message display components
- Ensure UI behavior matches current implementation

### Phase 3: Enhanced Features & Tool Integration (Days 8-11)  
- Implement tool use with OpenAI format
- Migrate artifact system integration
- Add performance tracking equivalent to current enhanced chat
- Update all remaining component dependencies

### Phase 4: Testing & Optimization (Days 12-15)
- Comprehensive end-to-end testing
- Performance benchmarking and optimization
- Bug fixes and edge case handling
- Documentation updates

### Phase 5: Deployment & Monitoring (Days 16-18)
- Feature-flagged gradual rollout
- Production monitoring and metrics
- Issue resolution and stability improvements
- Full migration completion

## 7. Success Criteria

**Technical Success Criteria:**
- [ ] Complete elimination of `@ai-sdk/react` dependency
- [ ] Streaming functionality works identically to current implementation
- [ ] Tool use and artifact generation function without regression
- [ ] Performance metrics match or exceed current implementation
- [ ] Zero breaking changes to existing API endpoints

**User Experience Success Criteria:**  
- [ ] Chat interface behavior is visually and functionally identical
- [ ] Message formatting and display preserve current appearance
- [ ] Tool execution and results display work seamlessly
- [ ] File attachments and multimodal input function properly
- [ ] Error handling and user feedback remain consistent

**Maintainability Success Criteria:**
- [ ] Codebase complexity reduced through unified SDK usage
- [ ] Debugging capabilities improved with direct OpenAI SDK access
- [ ] Type safety maintained or improved throughout migration
- [ ] Development velocity increased due to simpler architecture
- [ ] Documentation updated to reflect new implementation patterns

This migration represents a strategic architectural improvement that will provide long-term benefits in maintainability, debuggability, and performance while ensuring we follow OpenRouter's recommended implementation patterns with the OpenAI SDK. 