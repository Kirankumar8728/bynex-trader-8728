import express from "express";
import session from "express-session";
import 'express-session';

declare module 'express-session' {
  interface SessionData {
    tokens: {
      access_token: string;
      refresh_token: string;
      expires_at: number;
    }
  }
}

import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { sql } from "@vercel/postgres";
import archiver from "archiver";

import { GoogleGenAI } from "@google/genai";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();

// ============================================================================
// AI Icon Generation
// ============================================================================
async function ensureAppIcon() {
  const iconPath = path.join(__dirname, "public", "app-icon.png");
  if (fs.existsSync(iconPath)) return;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{ text: "A professional, modern app icon for a trading application named 'Bynex Trader'. The icon should feature a sleek, stylized 'B' integrated with a rising candlestick chart. Color palette: Deep Navy Blue, Emerald Green, and crisp White. Minimalist, high-tech, premium feel. 1024x1024 resolution." }],
      },
      config: {
        imageConfig: { aspectRatio: "1:1", imageSize: "1K" },
      },
    });

    const candidates = response.candidates;
    if (!candidates || candidates.length === 0 || !candidates[0].content) return;

    const parts = candidates[0].content.parts;
    if (!parts) return;

    for (const part of parts) {
      if (part.inlineData && part.inlineData.data) {
        const buffer = Buffer.from(part.inlineData.data, 'base64');
        const publicDir = path.join(__dirname, "public");
        if (!fs.existsSync(publicDir)) {
          fs.mkdirSync(publicDir);
        }
        fs.writeFileSync(iconPath, buffer);
        console.log("App icon generated successfully");
      }
    }
  } catch (error: any) {
    if (error.message && (error.message.includes("API key not valid") || error.message.includes("400"))) {
      console.warn("Skipping app icon generation due to invalid API key.");
    } else {
      console.error("Failed to generate app icon:", error);
    }
  }
}

// ============================================================================
// Vercel Postgres Integration & Table Setup
// ============================================================================

async function setupDatabase() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS balances (
        userId VARCHAR(255) PRIMARY KEY,
        balance DECIMAL(20, 2) DEFAULT 0
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS withdrawals (
        id SERIAL PRIMARY KEY,
        userId VARCHAR(255),
        amount DECIMAL(20, 2),
        method VARCHAR(50),
        status VARCHAR(50),
        timestamp BIGINT,
        rejectionReason TEXT,
        details JSONB
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS processed_trades (
        contractId VARCHAR(255) PRIMARY KEY,
        userId VARCHAR(255),
        profit DECIMAL(20, 2),
        processedAt BIGINT
      );
    `;
    console.log("Postgres tables verified/created successfully.");
  } catch (error) {
    console.error("Failed to initialize Postgres tables:", error);
  }
}

// Call setup once on startup
setupDatabase();

// ============================================================================
// Secure Endpoints Middleware & Rate Limiting
// ============================================================================
import rateLimit from "express-rate-limit";

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per `window`
  message: { error: "Too many requests, please try again later." }
});

const withdrawalLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each IP to 10 withdrawal requests per hour
  message: { error: "Too many withdrawal requests, please try again later." }
});

const isAuthenticated = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.session && req.session.tokens && req.session.tokens.access_token) {
    next();
  } else {
    res.status(401).json({ error: "Unauthorized access. Please login." });
  }
};
// ============================================================================
// Express Middleware & API Routes (Module-level for Vercel serverless compatibility)
// ============================================================================
app.set('trust proxy', 1);
const sessionSecret = process.env.SESSION_SECRET;
if (process.env.NODE_ENV === 'production' && (!sessionSecret || sessionSecret === 'bynex-trader-secret-12345')) {
  throw new Error("CRITICAL: SESSION_SECRET must be explicitly set to a strong random string in production.");
}

app.use(session({
  secret: sessionSecret || 'dev-fallback-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production', httpOnly: true, maxAge: 3600000 }
}));

app.use(apiLimiter);


app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    console.log(`[API] ${req.method} ${req.path}`);
  }
  next();
});

  // API routes
  app.get("/api/download-source", (req: express.Request, res: express.Response) => {
    res.attachment("bynex-trader-source.zip");
    const archive = archiver("zip", { zlib: { level: 9 } });
    
    archive.on("error", (err) => {
      res.status(500).send({ error: err.message });
    });

    archive.pipe(res);

    // Append files from the root directory, ignoring node_modules, dist, and .git
    archive.glob("**/*", {
      cwd: __dirname,
      ignore: ["node_modules/**", "dist/**", ".git/**", "firebase-debug.log"],
      dot: true
    });

    archive.finalize();
  });

  app.get("/api/health", (req: express.Request, res: express.Response) => {
    res.json({ status: "ok" });
  });

  // ============================================================================
  // Deriv OAuth Callback/Token endpoint
  // ============================================================================
  app.post("/api/deriv/token", async (req: express.Request, res: express.Response) => {
    const { code, code_verifier, redirect_uri } = req.body;
    const OAUTH_CLIENT_ID = process.env.VITE_DERIV_CLIENT_ID || '32FjINZV8sXfdKQcVvnZf';
    
    // 1. Validation
    if (!code || !code_verifier || !redirect_uri) {
      console.error("[AUTH ERROR] Missing required parameters for token exchange", { 
        hasCode: !!code, 
        hasVerifier: !!code_verifier, 
        hasRedirect: !!redirect_uri 
      });
      return res.status(400).json({ error: "Missing required parameters (code, code_verifier, or redirect_uri) in request body" });
    }

    console.log(`[AUTH] Initiating Token Exchange with Deriv.
      Code: ${code.substring(0, 5)}...
      Client: ${OAUTH_CLIENT_ID}
      Redirect: ${redirect_uri}`);

    try {
      // 2. Token request strictly as per documentation: 
      // - POST to https://auth.deriv.com/oauth2/token
      // - application/x-www-form-urlencoded
      const tokenRequestParams = new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        client_id: OAUTH_CLIENT_ID,
        redirect_uri: redirect_uri,
        code_verifier: code_verifier,
      });

      const response = await fetch('https://auth.deriv.com/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: tokenRequestParams.toString(),
      });

      const data = await response.json();
      
      if (!response.ok) {
        console.error("[AUTH ERROR] Deriv token exchange failed:", {
          status: response.status,
          statusText: response.statusText,
          error: data.error,
          description: data.error_description
        });
        
        return res.status(response.status).json({ 
          error: data.error_description || data.error || 'Token exchange failed',
          details: data
        });
      }

      console.log("[AUTH SUCCESS] Token exchange completed successfully");

      // Secure session recovery without localStorage exposure
      req.session.tokens = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: Date.now() + (data.expires_in * 1000)
      };

      res.json({
        access_token: data.access_token,
        expires_in: data.expires_in,
        token_type: data.token_type
      });
    } catch (error: any) {
      console.error("[AUTH CRITICAL ERROR] Exception during token exchange:", error);
      res.status(500).json({ 
        error: "Internal server error during authentication exchange", 
        message: error.message 
      });
    }
  });

  // ============================================================================
  // Session Recovery & Logout Routes
  // ============================================================================
  app.get("/api/deriv/session", (req: express.Request, res: express.Response) => {
    if (req.session?.tokens?.access_token) {
      // Return token from secure server session
      res.json({ 
        access_token: req.session.tokens.access_token,
        expires_at: req.session.tokens.expires_at 
      });
    } else {
      res.status(401).json({ error: "No active secure session" });
    }
  });

  app.post("/api/deriv/logout", (req: express.Request, res: express.Response) => {
    if (req.session) {
      req.session.destroy(() => {
        res.json({ success: true });
      });
    } else {
      res.json({ success: true });
    }
  });

  // ============================================================================
  // Cashier & Balance Routes
  // ============================================================================
  const handleCreateWithdrawal = async (req: express.Request, res: express.Response) => {
    const withdrawal = req.body;
    withdrawal.timestamp = Date.now();
    withdrawal.status = withdrawal.status || 'pending';
    
    try {
      // 1. Check and deduct balance
      const updateResult = await sql`
        UPDATE balances 
        SET balance = balance - ${withdrawal.amount}
        WHERE userId = ${withdrawal.userId} AND balance >= ${withdrawal.amount}
        RETURNING balance;
      `;

      if (updateResult.rowCount === 0) {
        return res.status(400).json({ success: false, error: "Insufficient balance or user not found" });
      }

      // 2. Save withdrawal request
      const { rows } = await sql`
        INSERT INTO withdrawals (userId, amount, method, status, timestamp, details)
        VALUES (${withdrawal.userId}, ${withdrawal.amount}, ${withdrawal.method}, ${withdrawal.status}, ${withdrawal.timestamp}, ${JSON.stringify(withdrawal)})
        RETURNING id
      `;

      res.json({ success: true, id: rows[0].id });
    } catch (error: any) {
      console.error("Create withdrawal error:", error);
      res.status(500).json({ success: false, error: error.message || "Failed to save withdrawal" });
    }
  };

  app.post("/api/w-requests", isAuthenticated, withdrawalLimiter, handleCreateWithdrawal);
  app.post("/api/withdrawals", isAuthenticated, withdrawalLimiter, handleCreateWithdrawal);

  const handleGetWithdrawals = async (req: express.Request, res: express.Response) => {
    try {
      const { rows } = await sql`SELECT * FROM withdrawals ORDER BY timestamp DESC LIMIT 50`;
      res.json(rows);
    } catch (error: any) {
      console.error("Get withdrawals error:", error);
      res.status(500).json({ error: "Failed to connect to withdrawal database", details: error.message });
    }
  };

  app.get("/api/w-requests", isAuthenticated, handleGetWithdrawals);
  app.get("/api/withdrawals", isAuthenticated, handleGetWithdrawals);

  const handleUpdateWithdrawal = async (req: express.Request, res: express.Response) => {
    const { id } = req.params;
    const { status, rejectionReason } = req.body;
    
    try {
      const { rows } = await sql`SELECT * FROM withdrawals WHERE id = ${id as string}`;
      if (rows.length === 0) return res.status(404).json({ error: "Withdrawal not found" });
      
      const withdrawal = rows[0];
      if (withdrawal.status !== 'pending') return res.status(400).json({ error: "Withdrawal already processed" });

      await sql`UPDATE withdrawals SET status = ${status as string}, rejectionReason = ${rejectionReason ? String(rejectionReason) : null} WHERE id = ${id as string}`;

      // Refund balance if rejected
      if (status === 'rejected') {
        await sql`
          UPDATE balances 
          SET balance = balance + ${withdrawal.amount}
          WHERE userId = ${withdrawal.userId}
        `;
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("Update withdrawal error:", error);
      res.status(500).json({ success: false, error: error.message || "Failed to update withdrawal" });
    }
  };

  app.patch("/api/w-requests/:id", isAuthenticated, handleUpdateWithdrawal);
  app.patch("/api/withdrawals/:id", isAuthenticated, handleUpdateWithdrawal);

  app.get("/api/referral-balance/:userId", isAuthenticated, async (req: express.Request, res: express.Response) => {
    const { userId } = req.params;
    try {
      const { rows } = await sql`SELECT balance FROM balances WHERE userId = ${userId as string}`;
      if (rows.length > 0) {
        res.json({ balance: Number(rows[0].balance) });
      } else {
        res.json({ balance: 0 });
      }
    } catch (error) {
      console.error("Failed to fetch balance:", error);
      res.json({ balance: 0 });
    }
  });



  app.post("/api/process-trade", async (req: express.Request, res: express.Response) => {
    const { userId, contractId, profit, buyPrice, appId, referrerId } = req.body;
    if (!userId || !contractId) return res.status(400).json({ error: "Missing data" });

    // Exclude demo/virtual accounts from rewards
    if (userId.startsWith('VRTC')) {
      return res.json({ success: false, reason: "Demo trades are excluded from commission" });
    }

    // Only reward trades made through our app
    const VALID_APP_ID = process.env.VITE_DERIV_APP_ID || '111810';
    if (appId && appId.toString() !== VALID_APP_ID) {
      return res.json({ success: false, reason: "External trade ignored" });
    }

    try {
      // Idempotency check
      const tradeCheck = await sql`SELECT contractId FROM processed_trades WHERE contractId = ${contractId.toString()}`;
      if ((tradeCheck.rowCount || 0) > 0) {
         return res.json({ success: false, reason: "Trade already processed" });
      }

      const commissionTargetId = referrerId || userId;
      const earnings = (parseFloat(profit) || parseFloat(buyPrice || '0')) * 0.01;

      // Upsert balance
      await sql`
        INSERT INTO balances (userId, balance) 
        VALUES (${commissionTargetId}, ${earnings})
        ON CONFLICT (userId) 
        DO UPDATE SET balance = balances.balance + EXCLUDED.balance;
      `;

      // Log processed trade
      await sql`
        INSERT INTO processed_trades (contractId, userId, profit, processedAt)
        VALUES (${contractId.toString()}, ${userId}, ${profit}, ${Date.now()});
      `;

      res.json({ success: true, commission: earnings, awardedTo: commissionTargetId });
    } catch (error: any) {
      console.error("Failed to process trade:", error);
      res.status(500).json({ success: false, error: error.message || "Failed to process trade" });
    }
  });

// ============================================================================
// Server Bootstrap (only runs outside Vercel serverless)
// ============================================================================
async function startServer() {
  const PORT = 3000;

  await ensureAppIcon();

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production serving
    app.use(express.static(path.join(__dirname, "dist")));
    app.get(/(.*)/, (req: express.Request, res: express.Response) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }



  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

// Only start the full server when NOT on Vercel
if (process.env.VERCEL !== "1") {
  startServer();
}
