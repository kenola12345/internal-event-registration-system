import { normalizeTag, tagsSchema } from "@template/shared";
import { describe, expect, it } from "vitest";

// タグの正規化は shared にあり、フロントとバックで同じ関数を使う(マニフェスト 3-4)
describe("normalizeTag", () => {
  it("「React」「react」「ＲＥＡＣＴ」が同じタグになる", () => {
    expect(normalizeTag("React")).toBe("react");
    expect(normalizeTag("react")).toBe("react");
    expect(normalizeTag("ＲＥＡＣＴ")).toBe("react");
  });

  it("前後の空白を除き、連続する空白(全角を含む)を 1 つにする", () => {
    expect(normalizeTag("  type　　script  ")).toBe("type script");
  });

  it("日本語のタグはそのまま残る", () => {
    expect(normalizeTag("新人向け")).toBe("新人向け");
  });
});

describe("tagsSchema", () => {
  it("正規化後に重複したタグを 1 つにまとめる", () => {
    expect(tagsSchema.parse(["React", "react", "ＲＥＡＣＴ", "aws"])).toEqual(["react", "aws"]);
  });

  it("空白だけのタグと 21 文字以上のタグを拒否する", () => {
    expect(tagsSchema.safeParse(["   "]).success).toBe(false);
    expect(tagsSchema.safeParse(["a".repeat(21)]).success).toBe(false);
  });

  it("11 個以上のタグを拒否する", () => {
    const tags = Array.from({ length: 11 }, (_, i) => `tag${String(i)}`);
    expect(tagsSchema.safeParse(tags).success).toBe(false);
  });
});
