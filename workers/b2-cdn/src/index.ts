export default {
  fetch(request: Request): Response {
    return new Response(`b2 cdn worker placeholder: ${new URL(request.url).pathname}`, {
      status: 501,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
      },
    });
  },
};
