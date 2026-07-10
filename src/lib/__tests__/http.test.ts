import { describe, expect, it } from "vitest";
import { readJsonObject } from "@/lib/http";

function jsonRequest(body: string, headers: HeadersInit = {}): Request {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  });
}

describe("readJsonObject", () => {
  it("크기 안의 JSON 객체를 읽는다", async () => {
    const result = await readJsonObject(jsonRequest('{"ok":true}'), 100);
    expect(result).toEqual({ ok: true, value: { ok: true } });
  });

  it("잘못된 content type과 JSON을 거부한다", async () => {
    const text = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "{}",
    });
    expect(await readJsonObject(text, 100)).toEqual({ ok: false, status: 415 });
    expect(await readJsonObject(jsonRequest("{"), 100)).toEqual({
      ok: false,
      status: 400,
    });
  });

  it("문자 수가 아닌 UTF-8 byte 기준으로 제한한다", async () => {
    const body = JSON.stringify({ text: "가".repeat(10) });
    expect(body.length).toBeLessThan(40);
    expect(await readJsonObject(jsonRequest(body), 25)).toEqual({
      ok: false,
      status: 413,
    });
  });

  it("선언된 요청 크기가 한도를 넘으면 읽기 전에 거부한다", async () => {
    const request = jsonRequest("{}", { "Content-Length": "999" });
    expect(await readJsonObject(request, 100)).toEqual({
      ok: false,
      status: 413,
    });
  });
});
