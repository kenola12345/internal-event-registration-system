import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { app, resetDb, signedUpAgent } from "./helpers.js";

beforeEach(resetDb);

describe("todos API", () => {
  it("requires login", async () => {
    await request(app).get("/api/todos").expect(401);
    await request(app).post("/api/todos").send({ title: "x" }).expect(401);
  });

  it("creates and lists todos, newest first", async () => {
    const agent = await signedUpAgent();
    await agent.post("/api/todos").send({ title: "first" }).expect(201);
    const created = await agent.post("/api/todos").send({ title: "  second  " }).expect(201);
    expect(created.body.data).toMatchObject({ title: "second", completed: false }); // trimmed

    const res = await agent.get("/api/todos").expect(200);
    expect(res.body.data.map((t: { title: string }) => t.title)).toEqual(["second", "first"]);
  });

  it("rejects an empty title with field details", async () => {
    const agent = await signedUpAgent();
    const res = await agent.post("/api/todos").send({ title: "   " }).expect(400);
    expect(res.body.error.details[0].field).toBe("title");
  });

  it("updates and deletes your own todo", async () => {
    const agent = await signedUpAgent();
    const { body } = await agent.post("/api/todos").send({ title: "a" });
    const id = body.data.id as string;
    const res = await agent.patch(`/api/todos/${id}`).send({ completed: true }).expect(200);
    expect(res.body.data.completed).toBe(true);
    await agent.delete(`/api/todos/${id}`).expect(204);
    await agent.delete(`/api/todos/${id}`).expect(404);
  });

  it("hides other users' todos (404, not 403)", async () => {
    const alice = await signedUpAgent("alice@example.com");
    const bob = await signedUpAgent("bob@example.com");
    const { body } = await alice.post("/api/todos").send({ title: "private" });
    const id = body.data.id as string;

    expect((await bob.get("/api/todos")).body.data).toEqual([]);
    await bob.patch(`/api/todos/${id}`).send({ completed: true }).expect(404);
    await bob.delete(`/api/todos/${id}`).expect(404);
    expect((await alice.get("/api/todos")).body.data).toHaveLength(1);
  });
});
