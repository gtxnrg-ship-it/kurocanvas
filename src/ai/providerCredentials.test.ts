import { afterEach, describe, expect, it, vi } from "vitest";
import { clearRemoteModelCredential, readRemoteModelCredential, saveRemoteModelCredential } from "./providerCredentials";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, String(value)); },
    removeItem: (key: string) => { values.delete(key); },
    clear: () => values.clear(),
    values,
  };
}

describe("remote model credentials", () => {
  const session = memoryStorage();
  afterEach(() => {
    session.clear();
    vi.unstubAllGlobals();
  });

  it("stores a trimmed key only in session storage and binds it to the exact endpoint", () => {
    vi.stubGlobal("sessionStorage", session);
    saveRemoteModelCredential("https://model.example/v1/", "  secret-token  ");
    expect(readRemoteModelCredential("https://model.example/v1")).toBe("secret-token");
    expect(readRemoteModelCredential("https://other.example/v1")).toBe("");
    expect([...session.values.values()].join(" ")).toContain("secret-token");
  });

  it("clears a key on an empty save and on explicit reset", () => {
    vi.stubGlobal("sessionStorage", session);
    saveRemoteModelCredential("https://model.example/v1", "secret-token");
    saveRemoteModelCredential("https://model.example/v1", " ");
    expect(readRemoteModelCredential("https://model.example/v1")).toBe("");
    saveRemoteModelCredential("https://model.example/v1", "secret-token");
    clearRemoteModelCredential();
    expect(readRemoteModelCredential("https://model.example/v1")).toBe("");
  });

  it("fails closed on malformed session data or disabled browser storage", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => "{bad json",
      setItem: () => { throw new Error("blocked"); },
      removeItem: () => { throw new Error("blocked"); },
    });
    expect(readRemoteModelCredential("https://model.example/v1")).toBe("");
    expect(() => saveRemoteModelCredential("https://model.example/v1", "token")).toThrow(/session storage/i);
    expect(() => clearRemoteModelCredential()).not.toThrow();
  });
});
