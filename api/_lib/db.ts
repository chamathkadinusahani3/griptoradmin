import dns from 'dns';
import mongoose from 'mongoose';

// Some local networks (VPNs/security software) point Node's resolver at a
// stub that doesn't answer raw SRV queries, breaking mongodb+srv:// lookups
// even though the OS resolver works fine. Public resolvers work everywhere,
// including on Vercel, so this is safe to set unconditionally.
dns.setServers(['8.8.8.8', '1.1.1.1']);

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

// Reused across warm serverless invocations so we don't open a new
// connection (and exhaust the Atlas connection limit) on every request.
declare global {
  // eslint-disable-next-line no-var
  var _mongooseCache: MongooseCache | undefined;
}

const cache: MongooseCache = global._mongooseCache ?? { conn: null, promise: null };
global._mongooseCache = cache;

export async function connectToDatabase(): Promise<typeof mongoose> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set. Add it to griptoradmin/.env.local');
  }

  if (cache.conn) return cache.conn;

  if (!cache.promise) {
    cache.promise = mongoose.connect(uri);
  }

  cache.conn = await cache.promise;
  return cache.conn;
}
