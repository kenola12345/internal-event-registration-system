import { Router } from "express";

// キャンセル待ち(W1〜W2) のルート。中身は各 Phase で実装する(routes/index.ts への登録は済み)
export const waitlistRouter = Router();
