import type { Env } from './config';
import { handleCdnRequest } from './handler';

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleCdnRequest(request, env);
  },
};
