/* The smallest possible proof that the backend runs.
   No database, no dependencies - if /api/health answers, the API layer works
   and anything that breaks later is our code, not the platform. */
export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    service: 'codetoclick',
    region: process.env.VERCEL_REGION || 'local',
    /* True once Neon is connected. We never send the value itself. */
    databaseConfigured: Boolean(process.env.DATABASE_URL),
    time: new Date().toISOString()
  });
}
