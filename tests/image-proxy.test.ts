import test from "node:test";
import assert from "node:assert";
import { NextRequest } from "next/server";
import { GET } from "../app/api/image/route.ts";

test("Image Proxy returns 400 when url param is missing", async () => {
  const req = new NextRequest("http://localhost:3000/api/image");
  const res = await GET(req);
  assert.strictEqual(res.status, 400);
});

test("Image Proxy returns 400 when protocol is not http or https", async () => {
  const req = new NextRequest("http://localhost:3000/api/image?url=javascript:alert(1)");
  const res = await GET(req);
  assert.strictEqual(res.status, 400);
});
