import { Router } from "express";

// フィードバック(F1〜F4) のルート。中身は各 Phase で実装する(routes/index.ts への登録は済み)
export const feedbacksRouter = Router();
