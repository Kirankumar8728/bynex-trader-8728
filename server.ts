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
import admin from "firebase-admin";
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
// Firebase Integration
// ============================================================================
// Initialize Firebase Admin
let db: admin.firestore.Firestore | undefined;

try {
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
    db = admin.firestore();
    console.log("Firebase Admin initialized successfully");
  } else {
    console.warn("Firebase Admin environment variables missing. Firestore features will be disabled.");
  }
} catch (error) {
  console.error("Failed to initialize Firebase Admin:", error);
}

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
    if (!db) return res.status(500).json({ error: "Firestore not initialized" });
    
    const withdrawal = req.body;
    withdrawal.timestamp = new Date().toISOString();
    withdrawal.status = 'pending';
    
    try {
      const userRef = db.collection("balances").doc(withdrawal.userId);
      const withdrawalRef = db.collection("withdrawals").doc();

      await db.runTransaction(async (t) => {
        const userDoc = await t.get(userRef);
        const currentBalance = userDoc.exists ? (userDoc.data()?.balance || 0) : 0;

        if (currentBalance < withdrawal.amount) {
          throw new Error("Insufficient balance");
        }

        // Deduct balance
        t.set(userRef, {
          balance: admin.firestore.FieldValue.increment(-withdrawal.amount)
        }, { merge: true });

        // Save withdrawal request
        t.set(withdrawalRef, withdrawal);
      });

      res.json({ success: true, id: withdrawalRef.id });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || "Failed to save withdrawal" });
    }
  };

  app.post("/api/w-requests", isAuthenticated, withdrawalLimiter, handleCreateWithdrawal);
  app.post("/api/withdrawals", isAuthenticated, withdrawalLimiter, handleCreateWithdrawal);

  const handleGetWithdrawals = async (req: express.Request, res: express.Response) => {
    const requestId = Math.random().toString(36).substring(7);
    console.log(`[API] [${requestId}] Starting handleGetWithdrawals`);
    
    if (!db) {
      console.warn(`[API] [${requestId}] Firestore not initialized for /api/w-requests`);
      return res.json([]);
    }
    
    console.log(`[API] [${requestId}] Fetching withdrawals from Firestore...`);
    const startTime = Date.now();
    try {
      const snapshot = await db.collection("withdrawals").orderBy("timestamp", "desc").limit(50).get();
      const duration = Date.now() - startTime;
      console.log(`[API] [${requestId}] Firestore query took ${duration}ms. Found ${snapshot.size} docs.`);
      
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      console.log(`[API] [${requestId}] Sending ${data.length} records`);
      res.json(data);
    } catch (error: any) {
      console.error(`[API] [${requestId}] Failed to fetch withdrawals from Firestore:`, error.message || error);
      res.status(500).json({ error: "Failed to connect to withdrawal database", details: error.message });
    }
  };

  app.get("/api/w-requests", isAuthenticated, handleGetWithdrawals);
  app.get("/api/withdrawals", isAuthenticated, handleGetWithdrawals);

  const handleUpdateWithdrawal = async (req: express.Request, res: express.Response) => {
    if (!db) return res.status(500).json({ error: "Firestore not initialized" });
    
    const { id } = req.params;
    const { status, rejectionReason } = req.body;
    
    try {
      const withdrawalRef = db.collection("withdrawals").doc(id as string);

      await db.runTransaction(async (t) => {
        const doc = await t.get(withdrawalRef);
        if (!doc.exists) throw new Error("Withdrawal not found");

        const data = doc.data();
        if (data?.status !== 'pending') throw new Error("Withdrawal already processed");

        t.update(withdrawalRef, { status, rejectionReason: rejectionReason || null });

        // Refund balance if rejected
        if (status === 'rejected') {
          const userRef = db.collection("balances").doc(data?.userId);
          t.set(userRef, {
            balance: admin.firestore.FieldValue.increment(data?.amount)
          }, { merge: true });
        }
      });

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || "Failed to update withdrawal" });
    }
  };

  app.patch("/api/w-requests/:id", isAuthenticated, handleUpdateWithdrawal);
  app.patch("/api/withdrawals/:id", isAuthenticated, handleUpdateWithdrawal);

  app.get("/api/referral-balance/:userId", isAuthenticated, async (req: express.Request, res: express.Response) => {
    if (!db) return res.json({ balance: 0 }); // Return 0 if Firestore is not initialized
    
    const { userId } = req.params;
    try {
      const doc = await db.collection("balances").doc(userId as string).get();
      if (doc.exists) {
        res.json(doc.data());
      } else {
        res.json({ balance: 0 });
      }
    } catch (error) {
      console.error("Failed to fetch balance:", error);
      res.json({ balance: 0 });
    }
  });



  app.post("/api/process-trade", async (req: express.Request, res: express.Response) => {
    if (!db) return res.status(500).json({ error: "Firestore not initialized" });
    
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
      const tradeRef = db.collection("balances").doc(userId).collection("trades").doc(contractId.toString());
      
      // Determine who gets the commission (Referrer gets priority, then user as cashback)
      const commissionTargetId = referrerId || userId;
      const targetRef = db.collection("balances").doc(commissionTargetId);
      let calculatedCommission = 0;

      await db.runTransaction(async (t) => {
        const tradeDoc = await t.get(tradeRef);
        if (tradeDoc.exists) {
          throw new Error("Duplicate trade");
        }

        // Commission is typically 1% of stake
        const stakeAmount = Number(buyPrice || profit || 1); 
        calculatedCommission = stakeAmount * 0.01;
        
        // Save the trade receipt for the trading user
        t.set(tradeRef, {
          buyPrice: Number(buyPrice || 0),
          profit: Number(profit || 0),
          commission: calculatedCommission,
          referrerId: referrerId || null,
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        // Increment the target's balance (Referrer or User)
        t.set(targetRef, {
          balance: admin.firestore.FieldValue.increment(calculatedCommission),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      });

      res.json({ success: true, commission: calculatedCommission, awardedTo: commissionTargetId });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || "Failed to record trade" });
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
