import { Request, Response, NextFunction } from 'express';
import pool from '../db/pool';

const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey) {
    res.status(401).json({ error: 'Missing API key' });
    return;
  }

  try {
    const [rows]: any = await pool.execute(
      'SELECT id, name FROM api_keys WHERE api_key = ? AND is_active = TRUE',
      [apiKey]
    );

    if (!rows.length) {
      res.status(403).json({ error: 'Invalid or inactive API key' });
      return;
    }

    await pool.execute(
      'UPDATE api_keys SET last_used_at = NOW() WHERE api_key = ?',
      [apiKey]
    );

    (req as any).apiKeyName = rows[0].name;
    next();
  } catch (err) {
    res.status(500).json({ error: 'Authentication error' });
  }
};

export default authenticate;
