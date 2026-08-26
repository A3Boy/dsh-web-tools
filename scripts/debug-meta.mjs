#!/usr/bin/env node
import { ProfileStore } from "../src/host/browser/profile-store.ts";
import os from "node:os";

const ps = new ProfileStore();
const dir = ps.getProfileDir("xiaohongshu");
console.log("Profile dir:", dir);
console.log("Matches homedir:", dir === `C:\\Users\\林壮茂\\.dsh\\web-tools\\browser-profiles\\xiaohongshu`);

const meta = ps.loadMetadata("xiaohongshu");
console.log("Metadata:", JSON.stringify(meta));