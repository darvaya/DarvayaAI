'use client';

import { useChat } from '@ai-sdk/react';
import { useEffect, useRef } from 'react';
import { artifactDefinitions, type ArtifactKind } from './artifact';
import type { Suggestion } from '@/lib/db/schema';
import { initialArtifactData, useArtifact } from '@/hooks/use-artifact';

export type DataStreamDelta = {
  type:
    | 'text-delta'
    | 'code-delta'
    | 'sheet-delta'
    | 'image-delta'
    | 'title'
    | 'id'
    | 'suggestion'
    | 'clear'
    | 'finish'
    | 'kind'
    | 'tool-call'
    | 'tool-result'
    | 'tool-start'
    | 'tool-complete'
    | 'tool-error'
    | 'model-routing';
  content: string | Suggestion;
  data?: any; // For tool events that use data field instead of content
};

export function DataStreamHandler({
  id,
  dataStream,
}: {
  id: string;
  dataStream?: any[];
}) {
  const { artifact, setArtifact, setMetadata } = useArtifact();
  const lastProcessedIndex = useRef(-1);

  useEffect(() => {
    if (!dataStream?.length) return;

    const newDeltas = dataStream.slice(lastProcessedIndex.current + 1);
    lastProcessedIndex.current = dataStream.length - 1;

    (newDeltas as DataStreamDelta[]).forEach((delta: DataStreamDelta) => {
      // ENHANCED: Better deserialization handling for all tool events
      let processedDelta = delta;

      const isToolEvent = [
        'tool-call',
        'tool-result',
        'tool-start',
        'tool-complete',
        'tool-error',
        'model-routing',
      ].includes(delta.type);

      if (isToolEvent) {
        try {
          // Handle both pre-serialized and direct tool event data
          if (typeof delta.content === 'string') {
            try {
              const parsedContent = JSON.parse(delta.content);
              processedDelta = {
                ...delta,
                content: parsedContent,
                data: parsedContent, // Also populate data field for consistency
              };
            } catch (parseError) {
              // If content parsing fails, try data field
              if (delta.data && typeof delta.data === 'string') {
                const parsedData = JSON.parse(delta.data);
                processedDelta = {
                  ...delta,
                  data: parsedData,
                };
              } else {
                // Keep original if no parsing works
                processedDelta = delta;
              }
            }
          } else if (delta.data) {
            // Data field already parsed, use as-is
            processedDelta = delta;
          }
        } catch (error) {
          console.warn(`Failed to parse ${delta.type} event:`, error);
          // Skip malformed events to prevent UI crashes
          return;
        }
      }

      const artifactDefinition = artifactDefinitions.find(
        (artifactDefinition) => artifactDefinition.kind === artifact.kind,
      );

      if (artifactDefinition?.onStreamPart) {
        artifactDefinition.onStreamPart({
          streamPart: processedDelta,
          setArtifact,
          setMetadata,
        });
      }

      setArtifact((draftArtifact) => {
        if (!draftArtifact) {
          return { ...initialArtifactData, status: 'streaming' };
        }

        switch (processedDelta.type) {
          case 'id':
            return {
              ...draftArtifact,
              documentId: processedDelta.content as string,
              status: 'streaming',
            };

          case 'title':
            return {
              ...draftArtifact,
              title: processedDelta.content as string,
              status: 'streaming',
            };

          case 'kind':
            return {
              ...draftArtifact,
              kind: processedDelta.content as ArtifactKind,
              status: 'streaming',
            };

          case 'clear':
            return {
              ...draftArtifact,
              content: '',
              status: 'streaming',
            };

          case 'finish':
            return {
              ...draftArtifact,
              status: 'idle',
            };

          // NEW: Handle coordinated tool execution events
          case 'tool-start':
            return {
              ...draftArtifact,
              status: 'streaming',
              isVisible: true, // Make artifact visible when tool starts
            };

          case 'tool-complete':
            return {
              ...draftArtifact,
              status: 'idle', // Tool completed successfully
            };

          case 'tool-error':
            // Log error for debugging but keep artifact visible
            console.warn(
              'Tool execution error:',
              processedDelta.data?.error || processedDelta.content,
            );
            return {
              ...draftArtifact,
              status: 'idle', // Reset to idle state on error
            };

          default:
            return draftArtifact;
        }
      });
    });
  }, [dataStream, setArtifact, setMetadata, artifact]);

  return null;
}
