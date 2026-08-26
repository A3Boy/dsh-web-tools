import assert from "node:assert/strict";
import test from "node:test";
import { locateBrowser } from "../src/host/browser/locator.ts";

test("BrowserLocator: detects Edge first on Windows when both exist", () => {
  const fakeFs = {
    existsSync: (p: string) => {
      if (p.includes("msedge.exe")) return true;
      if (p.includes("chrome.exe")) return true;
      return false;
    },
  };

  const env = {
    ProgramFiles: "C:\\Program Files",
    "ProgramFiles(x86)": "C:\\Program Files (x86)",
    LOCALAPPDATA: "C:\\Users\\test\\AppData\\Local",
  };

  const res = locateBrowser("auto", fakeFs, "win32", env);
  assert.equal(res.kind, "edge");
  assert.match(res.executablePath, /msedge\.exe$/i);
});

test("BrowserLocator: falls back to Chrome on Windows when Edge is absent", () => {
  const fakeFs = {
    existsSync: (p: string) => {
      if (p.includes("msedge.exe")) return false;
      if (p.includes("chrome.exe")) return true;
      return false;
    },
  };

  const env = {
    ProgramFiles: "C:\\Program Files",
  };

  const res = locateBrowser("auto", fakeFs, "win32", env);
  assert.equal(res.kind, "chrome");
  assert.match(res.executablePath, /chrome\.exe$/i);
});

test("BrowserLocator: respects explicit chrome choice", () => {
  const fakeFs = {
    existsSync: (p: string) => true,
  };

  const env = {
    ProgramFiles: "C:\\Program Files",
  };

  const res = locateBrowser("chrome", fakeFs, "win32", env);
  assert.equal(res.kind, "chrome");
});

test("BrowserLocator: supports custom executable path", () => {
  const customPath = "D:\\custom\\browser\\my-edge.exe";
  const fakeFs = {
    existsSync: (p: string) => p === customPath,
  };

  const res = locateBrowser(customPath, fakeFs, "win32", {});
  assert.equal(res.kind, "edge");
  assert.equal(res.executablePath, customPath);
});

test("BrowserLocator: throws when no browser found", () => {
  const fakeFs = {
    existsSync: () => false,
  };

  assert.throws(
    () => locateBrowser("auto", fakeFs, "win32", {}),
    /No supported Microsoft Edge or Google Chrome/i,
  );
});
