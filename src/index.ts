import 'dotenv/config';
import { serve } from '@hono/node-server';
import server from './server.js';

serve(server);
