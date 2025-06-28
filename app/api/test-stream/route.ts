export async function POST() {
  // Simple test stream
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // Send some test data
      controller.enqueue(
        encoder.encode('data: {"type": "content", "data": "Hello "}\n\n'),
      );

      setTimeout(() => {
        controller.enqueue(
          encoder.encode('data: {"type": "content", "data": "from "}\n\n'),
        );

        setTimeout(() => {
          controller.enqueue(
            encoder.encode(
              'data: {"type": "content", "data": "streaming!"}\n\n',
            ),
          );

          setTimeout(() => {
            controller.enqueue(
              encoder.encode('data: {"type": "finish", "data": {}}\n\n'),
            );
            controller.close();
          }, 500);
        }, 500);
      }, 500);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
