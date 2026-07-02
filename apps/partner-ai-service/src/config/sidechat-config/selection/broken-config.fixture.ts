// Test fixture: a config module that fails at load time, so the selection test
// can prove a broken config is a loud fatal error (never a silent fallback).
throw new Error("broken on purpose");
