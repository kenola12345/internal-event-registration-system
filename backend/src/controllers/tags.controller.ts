import { listTagsQuerySchema } from "@template/shared";
import type { RequestHandler } from "express";

import { getValidated } from "../middleware/validate.js";
import * as tags from "../services/tags.service.js";

// タグ(T1)のコントローラ。

/** T1 タグ候補 */
export const list: RequestHandler = async (req, res) => {
  const query = getValidated(req, "query", listTagsQuerySchema);
  const data = await tags.listTags(query);
  res.json({ data });
};
